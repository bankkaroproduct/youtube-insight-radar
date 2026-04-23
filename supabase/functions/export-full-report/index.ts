import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== XLSX primitives ==========
const STYLE_DEFAULT = 0, STYLE_HEADER = 1, STYLE_RED = 2, STYLE_BLUE = 3, STYLE_PLACEHOLDER = 4;

const PLACEHOLDERS = new Set(["No Links", "No Description", "No Email", "No Instagram", "N/A", "Last 50 Scraped Video"]);

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function colLetter(n: number): string {
  let s = "";
  n = n + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

type CellStyle = 0 | 1 | 2 | 3 | 4;
type Cell = { v: any; s?: CellStyle };

function cellXml(value: any, rowIdx: number, colIdx: number, style: CellStyle = 0): string {
  const ref = `${colLetter(colIdx)}${rowIdx + 1}`;
  const sAttr = style ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return `<c r="${ref}"${sAttr}/>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
  }
  const str = String(value);
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(str)}</t></is></c>`;
}

function rowXml(cells: (Cell | any)[], rowIdx: number, colCount: number): string {
  const parts: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const raw = cells[c];
    if (raw && typeof raw === "object" && "v" in raw) {
      parts.push(cellXml(raw.v, rowIdx, c, (raw.s ?? 0) as CellStyle));
    } else {
      parts.push(cellXml(raw, rowIdx, c, 0));
    }
  }
  return `<row r="${rowIdx + 1}">${parts.join("")}</row>`;
}

// ========== Constants & helpers ==========
const SOCIAL_DOMAINS: Record<string, string> = {
  "instagram.com": "Instagram", "fb.com": "Facebook", "facebook.com": "Facebook",
  "twitter.com": "Twitter/X", "x.com": "Twitter/X", "youtube.com": "YouTube", "youtu.be": "YouTube",
  "wa.me": "WhatsApp", "wa.link": "WhatsApp", "whatsapp.com": "WhatsApp",
  "t.me": "Telegram", "telegram.me": "Telegram", "telegram.org": "Telegram",
  "snapchat.com": "Snapchat", "linkedin.com": "LinkedIn", "pinterest.com": "Pinterest",
  "pin.it": "Pinterest", "threads.net": "Threads", "spotify.com": "Spotify",
  "discord.gg": "Discord", "discord.com": "Discord",
};

const REDIRECT_PARAMS = ["dl", "url", "u", "r", "redirect", "target", "to", "link", "dest", "destination"];

function extractDomain(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = /(https?:\/\/[^\s<>"'\)]+)/gi;
  return (text.match(re) ?? []).map(u => u.replace(/[.,;:!?\)]+$/, ""));
}
function getSocialPlatform(domain: string): string {
  if (!domain) return "";
  if (SOCIAL_DOMAINS[domain]) return SOCIAL_DOMAINS[domain];
  for (const [d, name] of Object.entries(SOCIAL_DOMAINS)) {
    if (domain === d || domain.endsWith("." + d)) return name;
  }
  return "";
}
function inferHeaderFromUrl(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return "Link";
  const social = getSocialPlatform(domain);
  if (social) return social;
  const parts = domain.split(".");
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!root) return "Link";
  return root.charAt(0).toUpperCase() + root.slice(1);
}
function tryMatchRetailerFromDomain(domain: string, retailerByDomain: Map<string, string>): string | null {
  if (!domain) return null;
  if (retailerByDomain.has(domain)) return retailerByDomain.get(domain)!;
  for (const [pat, name] of retailerByDomain) {
    if (domain === pat || domain.endsWith("." + pat)) return name;
  }
  return null;
}
function extractEmbeddedRetailer(url: string | null | undefined, retailerByDomain: Map<string, string>): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const key of REDIRECT_PARAMS) {
      const raw = u.searchParams.get(key);
      if (!raw) continue;
      let decoded = raw;
      for (let i = 0; i < 3; i++) { try { const d = decodeURIComponent(decoded); if (d === decoded) break; decoded = d; } catch { break; } }
      try {
        const inner = new URL(decoded.startsWith("http") ? decoded : `https://${decoded}`);
        const host = inner.hostname.replace(/^www\./, "").toLowerCase();
        const match = tryMatchRetailerFromDomain(host, retailerByDomain);
        if (match) return match;
      } catch {
        const m = decoded.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
        if (m) {
          const host = m[0].replace(/^www\./, "").toLowerCase();
          const match = tryMatchRetailerFromDomain(host, retailerByDomain);
          if (match) return match;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}
function resolveRetailerDisplay(link: any, retailerByDomain: Map<string, string>): string {
  if (link.resolved_retailer) return link.resolved_retailer;
  const candidates = [extractDomain(link.unshortened_url), link.domain, link.original_domain, extractDomain(link.original_url)].filter(Boolean) as string[];
  for (const d of candidates) {
    const match = tryMatchRetailerFromDomain(d, retailerByDomain);
    if (match) return match;
  }
  const embedded = extractEmbeddedRetailer(link.unshortened_url, retailerByDomain) || extractEmbeddedRetailer(link.original_url, retailerByDomain);
  if (embedded) return embedded;
  if (link.affiliate_platform) return `Via ${link.affiliate_platform}`;
  return "N/A";
}
function computeExcluded(link: any, social: string, affiliateCounts: Map<string, number>): string {
  if (social) return `Excluded - Social (${social})`;
  if (link.affiliate_platform && (affiliateCounts.get(link.affiliate_platform) ?? 0) === 1) return "Excluded - Single Affiliate";
  return "";
}
function lookupByDomain(domain: string, map: Map<string, string>): string {
  if (!domain || map.size === 0) return "";
  if (map.has(domain)) return map.get(domain)!;
  for (const [d, name] of map) {
    if (domain === d || domain.endsWith("." + d)) return name;
  }
  return "";
}

// ========== Style helpers ==========
function styleForExcluded(value: string): CellStyle {
  return typeof value === "string" && value.startsWith("Excluded") ? STYLE_RED : STYLE_DEFAULT;
}
function styleForSocial(value: string): CellStyle {
  return typeof value === "string" && value ? STYLE_BLUE : STYLE_DEFAULT;
}
function styleForPlaceholder(value: any): CellStyle {
  return typeof value === "string" && PLACEHOLDERS.has(value) ? STYLE_PLACEHOLDER : STYLE_DEFAULT;
}
function styled(value: any, ...styles: CellStyle[]): Cell {
  for (const s of styles) if (s !== STYLE_DEFAULT) return { v: value, s };
  return { v: value };
}

// ========== Pagination helpers ==========
async function fetchPage<T>(supabase: any, table: string, select: string, from: number, to: number, orderCol = "id"): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).order(orderCol, { ascending: true }).range(from, to);
  if (error) throw error;
  return (data ?? []) as T[];
}
async function fetchAll<T>(supabase: any, table: string, select = "*"): Promise<T[]> {
  const BATCH = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all = all.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

// Fetch by IN-batched ids (Supabase URI limit safety: 200 ids per call).
async function fetchByIds<T>(supabase: any, table: string, select: string, idCol: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).select(select).in(idCol, slice);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

// ========== Column header constants ==========
const SHEET1_HEADERS = ["Keyword", "Category", "Priority", "Search Volume", "Total Videos Fetched", "Last Fetch Date", "Days Since Last Fetch"];
const SHEET2_HEADERS = ["Keyword", "Category", "Business Aim", "Priority", "Search Rank", "KW Status", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
const SHEET3_HEADERS = ["Keyword", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
const SHEET4_HEADERS = ["Keyword", "Video Name", "Video Link", "Channel Name", "Channel Link", "Total Videos From Channel"];
const SHEET5_HEADERS = ["Channel Link", "Channel Name", "Channel Subscribers", "Best Video Rank", "Channel Avg Views", "Channel Avg Likes", "Channel Avg Comments", "Videos Fetched (Till Date)", "Total Videos on YouTube", "Channel Description", "Link #", "Link Header", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
const SHEET6_HEADERS = ["Channel Name", "Channel Link", "Subscribers", "Country", "Category", "Affiliate Status", "Contact Email", "Instagram Handle", "IG Followers", "IG Bio", "IG Business Category", "Instagram Link", "Facebook Link", "Twitter Link", "WhatsApp Link", "Telegram Link", "Snapchat Link", "LinkedIn Link", "YouTube Link"];

const SHEETS_IN_ORDER = [
  { stage: "s1", name: "S1 - Keyword Summary", headers: SHEET1_HEADERS },
  { stage: "s2", name: "S2 - Video Deep Data", headers: SHEET2_HEADERS },
  { stage: "s3", name: "S3 - Last 50 Deep Data", headers: SHEET3_HEADERS },
  { stage: "s4", name: "S4 - Last 50 Channel Map", headers: SHEET4_HEADERS },
  { stage: "s5", name: "S5 - Channel Deep Data", headers: SHEET5_HEADERS },
  { stage: "s6", name: "S6 - Contact Info", headers: SHEET6_HEADERS },
];

// ========== XLSX assembly helpers ==========
function buildWorkbookXml(sheetNames: string[]): string {
  const sheets = sheetNames.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}
function buildContentTypes(sheetCount: number): string {
  const overrides: string[] = [];
  for (let i = 1; i <= sheetCount; i++) {
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides.join("")}
</Types>`;
}
function buildWorkbookRels(sheetCount: number): string {
  const rels: string[] = [];
  for (let i = 1; i <= sheetCount; i++) {
    rels.push(`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`);
  }
  rels.push(`<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
}
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
  <font><sz val="10"/><name val="Arial"/></font>
  <font><b/><sz val="10"/><name val="Arial"/></font>
  <font><sz val="10"/><name val="Arial"/><color rgb="FFFF0000"/></font>
  <font><sz val="10"/><name val="Arial"/><color rgb="FF0000FF"/></font>
  <font><i/><sz val="10"/><name val="Arial"/><color rgb="FF808080"/></font>
</fonts>
<fills count="3">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/></patternFill></fill>
</fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function sheetHeaderXml(headers: string[]): string {
  const head: string[] = [];
  head.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  head.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  head.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen" activePane="bottomLeft"/></sheetView></sheetViews>');
  head.push('<cols>');
  headers.forEach((h, i) => {
    const width = Math.max(12, Math.min(50, h.length + 4));
    head.push(`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`);
  });
  head.push('</cols>');
  head.push('<sheetData>');
  head.push(`<row r="1">${headers.map((h, c) => cellXml(h, 0, c, STYLE_HEADER)).join("")}</row>`);
  return head.join("");
}
const SHEET_FOOTER_XML = '</sheetData></worksheet>';

// ========== Job-state helpers ==========
type JobRow = {
  id: string; user_id: string; status: string; stage: string; cursor: any;
  storage_prefix: string | null; result_path: string | null; storage_path: string | null;
  metadata: any; attempt_count: number; lease_expires_at: string | null;
  progress_message: string | null; error: string | null;
};

const LEASE_MS = 90 * 1000;        // 90s lease — invocation runs ≤60s, gives buffer
const CHUNK_VIDEO_PAGE = 800;      // videos per S2/S3/S4 chunk
const CHUNK_CHANNEL_PAGE = 100;    // channels per S5/S6 chunk

function nowIso() { return new Date().toISOString(); }
function leaseUntilIso() { return new Date(Date.now() + LEASE_MS).toISOString(); }

async function loadJob(supabase: any, jobId: string): Promise<JobRow | null> {
  const { data } = await supabase.from("export_jobs").select("*").eq("id", jobId).maybeSingle();
  return data as JobRow | null;
}

async function patchJob(supabase: any, jobId: string, patch: any) {
  await supabase.from("export_jobs").update(patch).eq("id", jobId);
}

async function tryClaim(supabase: any, jobId: string): Promise<JobRow | null> {
  const job = await loadJob(supabase, jobId);
  if (!job) return null;
  if (job.status !== "running" && job.status !== "queued") return null;
  if (job.lease_expires_at && new Date(job.lease_expires_at).getTime() > Date.now()) {
    // Still leased by another invocation.
    return null;
  }
  const { data, error } = await supabase.from("export_jobs")
    .update({
      status: "running",
      lease_expires_at: leaseUntilIso(),
      heartbeat_at: nowIso(),
      attempt_count: (job.attempt_count ?? 0) + 1,
    })
    .eq("id", jobId)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso()}`)
    .select()
    .single();
  if (error || !data) return null;
  return data as JobRow;
}

async function selfInvoke(jobId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/export-full-report`;
  // Fire-and-forget; don't await body. Use service-role to bypass user auth on self-call.
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "x-internal-worker": "1",
    },
    body: JSON.stringify({ action: "work", job_id: jobId }),
  }).catch(() => {});
}

// ========== Pattern + affiliate-counts cache (per chunk run) ==========
async function loadPatterns(supabase: any) {
  const patterns = await fetchAll<any>(supabase, "affiliate_patterns", "pattern,name,type,is_confirmed");
  const retailerByDomain = new Map<string, string>();
  const affiliateByDomain = new Map<string, string>();
  for (const p of patterns) {
    if (!p.is_confirmed) continue;
    const d = (p.pattern || "").replace(/^www\./, "").toLowerCase();
    if (!d) continue;
    const t = (p.type || "").toLowerCase();
    if (t === "retailer") retailerByDomain.set(d, p.name);
    else if (t === "affiliate_platform") affiliateByDomain.set(d, p.name);
  }
  return { retailerByDomain, affiliateByDomain };
}

// Affiliate counts must be over the entire video_links table (used to flag "single affiliate"
// excluded). Compute once and cache in the job's metadata.
async function getAffiliateCounts(supabase: any, job: JobRow): Promise<Map<string, number>> {
  if (job.metadata?.affiliateCounts) {
    return new Map(Object.entries(job.metadata.affiliateCounts as Record<string, number>));
  }
  const counts = new Map<string, number>();
  let from = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("video_links")
      .select("affiliate_platform")
      .not("affiliate_platform", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const l of rows) if (l.affiliate_platform) counts.set(l.affiliate_platform, (counts.get(l.affiliate_platform) ?? 0) + 1);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  const obj: Record<string, number> = {};
  for (const [k, v] of counts) obj[k] = v;
  await patchJob(supabase, job.id, { metadata: { ...(job.metadata ?? {}), affiliateCounts: obj } });
  return counts;
}

// ========== Storage helpers for fragments ==========
async function uploadFragment(supabase: any, path: string, body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const { error } = await supabase.storage.from("exports").upload(path, bytes, {
    contentType: "application/xml",
    upsert: true,
  });
  if (error) throw error;
}

async function downloadFragment(supabase: any, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("exports").download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

async function listFragments(supabase: any, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("exports").list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const f of data) out.push(`${prefix}/${f.name}`);
    if (data.length < 100) break;
    offset += data.length;
  }
  return out;
}

// ========== Stage builders ==========
// Each stage either:
//  - completes the whole sheet within ~30-50s and advances stage
//  - or processes one page worth and bumps cursor.page

async function runStageS1(supabase: any, job: JobRow): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  // S1 is small: build entire sheet in one shot.
  const keywords = await fetchAll<any>(supabase, "keywords_search_runs", "id,keyword,category,priority,estimated_volume,last_priority_fetch_at");
  const { data: stats, error } = await supabase.rpc("get_keyword_stats");
  if (error) throw error;
  const videoCount = new Map<string, number>();
  for (const s of (stats ?? [])) videoCount.set(s.keyword_id, Number(s.video_count) || 0);

  const today = Date.now();
  const parts: string[] = [];
  let r = 1;
  for (const kw of keywords) {
    let lastFetchDisplay: string | number = "Never";
    let daysGap: string | number = "N/A";
    if (kw.last_priority_fetch_at) {
      const d = new Date(kw.last_priority_fetch_at);
      if (!isNaN(d.getTime())) {
        lastFetchDisplay = d.toISOString().slice(0, 10);
        daysGap = Math.floor((today - d.getTime()) / 86400000);
      }
    }
    const row = [
      kw.keyword, kw.category || "N/A", kw.priority || "N/A", kw.estimated_volume || "N/A",
      videoCount.get(kw.id) || 0, lastFetchDisplay,
      typeof daysGap === "string" ? styled(daysGap, styleForPlaceholder(daysGap)) : daysGap,
    ];
    parts.push(rowXml(row, r, SHEET1_HEADERS.length));
    r++;
  }
  await uploadFragment(supabase, `${job.storage_prefix}/parts/s1/000001.xml`, parts.join(""));
  return { done: true, nextStage: "s2", nextCursor: { page: 0 } };
}

async function runStageS2(supabase: any, job: JobRow, retailerByDomain: Map<string, string>, affiliateCounts: Map<string, number>): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  const page = Number(job.cursor?.page ?? 0);
  const startRowIdx = Number(job.cursor?.rowIdx ?? 1);
  const from = page * CHUNK_VIDEO_PAGE;
  const to = from + CHUNK_VIDEO_PAGE - 1;

  // Fetch one page of videos that have keywords. Order by id for stable pagination.
  const videos = await fetchPage<any>(supabase, "videos", "id,video_id,title,description,channel_id,channel_name,view_count,like_count,comment_count", from, to, "id");
  if (videos.length === 0) {
    return { done: true, nextStage: "s3", nextCursor: { page: 0 } };
  }
  const videoIds = videos.map(v => v.id);
  const [vks, links] = await Promise.all([
    fetchByIds<any>(supabase, "video_keywords", "video_id,keyword_id,search_rank", "video_id", videoIds),
    fetchByIds<any>(supabase, "video_links", "id,video_id,original_url,unshortened_url,domain,original_domain,affiliate_platform,resolved_retailer", "video_id", videoIds),
  ]);
  const vkMap = new Map<string, any[]>();
  for (const vk of vks) {
    const list = vkMap.get(vk.video_id) || [];
    list.push(vk);
    vkMap.set(vk.video_id, list);
  }
  const linksByVideo = new Map<string, any[]>();
  for (const l of links) {
    const list = linksByVideo.get(l.video_id) || [];
    list.push(l);
    linksByVideo.set(l.video_id, list);
  }
  const kwIds = [...new Set(vks.map(v => v.keyword_id))];
  const keywords = await fetchByIds<any>(supabase, "keywords_search_runs", "id,keyword,category,business_aim,priority,status", "id", kwIds);
  const keywordsById = new Map(keywords.map((k: any) => [k.id, k]));

  const parts: string[] = [];
  let xlsxRowIdx = startRowIdx;
  for (const v of videos) {
    const entries = vkMap.get(v.id);
    if (!entries || entries.length === 0) continue;
    const vlinks = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const totalLinks = vlinks.length;
    for (const entry of entries) {
      const kw = keywordsById.get(entry.keyword_id);
      if (!kw) continue;
      const rank = entry.search_rank != null ? entry.search_rank : "N/A";
      const baseRow = [
        kw.keyword, kw.category || "N/A", kw.business_aim || "N/A", kw.priority || "N/A",
        typeof rank === "string" ? styled(rank, styleForPlaceholder(rank)) : rank,
        kw.status || "N/A",
        `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
        v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0,
        styled(description, styleForPlaceholder(description)), totalLinks,
      ];
      if (vlinks.length === 0) {
        parts.push(rowXml([...baseRow,
          styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
          styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
        ], xlsxRowIdx, SHEET2_HEADERS.length));
        xlsxRowIdx++;
      } else {
        for (let idx = 0; idx < vlinks.length; idx++) {
          const link = vlinks[idx];
          const unshort = link.unshortened_url || "N/A";
          const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
          const social = getSocialPlatform(domain);
          const retailer = resolveRetailerDisplay(link, retailerByDomain);
          const excluded = computeExcluded(link, social, affiliateCounts);
          parts.push(rowXml([...baseRow,
            `L${idx + 1}`, link.original_url, styled(unshort, styleForPlaceholder(unshort)),
            domain || styled("N/A", STYLE_PLACEHOLDER), link.affiliate_platform || "", retailer,
            styled(social, styleForSocial(social)), styled(excluded, styleForExcluded(excluded)),
          ], xlsxRowIdx, SHEET2_HEADERS.length));
          xlsxRowIdx++;
        }
      }
    }
  }
  if (parts.length > 0) {
    const fragName = String(page + 1).padStart(6, "0") + ".xml";
    await uploadFragment(supabase, `${job.storage_prefix}/parts/s2/${fragName}`, parts.join(""));
  }
  const nextPage = page + 1;
  const more = videos.length === CHUNK_VIDEO_PAGE;
  return more
    ? { done: false, nextCursor: { page: nextPage, rowIdx: xlsxRowIdx } }
    : { done: true, nextStage: "s3", nextCursor: { page: 0 } };
}

async function runStageS3(supabase: any, job: JobRow, retailerByDomain: Map<string, string>, affiliateCounts: Map<string, number>): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  const page = Number(job.cursor?.page ?? 0);
  const startRowIdx = Number(job.cursor?.rowIdx ?? 1);
  const from = page * CHUNK_VIDEO_PAGE;
  const to = from + CHUNK_VIDEO_PAGE - 1;

  const videos = await fetchPage<any>(supabase, "videos", "id,video_id,title,description,channel_id,channel_name,view_count,like_count,comment_count", from, to, "id");
  if (videos.length === 0) return { done: true, nextStage: "s4", nextCursor: { page: 0 } };

  const videoIds = videos.map(v => v.id);
  const [vks, links] = await Promise.all([
    fetchByIds<any>(supabase, "video_keywords", "video_id", "video_id", videoIds),
    fetchByIds<any>(supabase, "video_links", "id,video_id,original_url,unshortened_url,domain,original_domain,affiliate_platform,resolved_retailer", "video_id", videoIds),
  ]);
  const hasKeyword = new Set<string>(vks.map((v: any) => v.video_id));
  const linksByVideo = new Map<string, any[]>();
  for (const l of links) {
    const list = linksByVideo.get(l.video_id) || [];
    list.push(l);
    linksByVideo.set(l.video_id, list);
  }

  const parts: string[] = [];
  let xlsxRowIdx = startRowIdx;
  for (const v of videos) {
    if (hasKeyword.has(v.id)) continue;
    const vlinks = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const baseRow = [
      styled("Last 50 Scraped Video", STYLE_PLACEHOLDER),
      `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
      v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0,
      styled(description, styleForPlaceholder(description)), vlinks.length,
    ];
    if (vlinks.length === 0) {
      parts.push(rowXml([...baseRow,
        styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
        styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
      ], xlsxRowIdx, SHEET3_HEADERS.length));
      xlsxRowIdx++;
    } else {
      vlinks.forEach((link, idx) => {
        const unshort = link.unshortened_url || "N/A";
        const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
        const social = getSocialPlatform(domain);
        const retailer = resolveRetailerDisplay(link, retailerByDomain);
        const excluded = computeExcluded(link, social, affiliateCounts);
        parts.push(rowXml([...baseRow,
          `L${idx + 1}`, link.original_url, styled(unshort, styleForPlaceholder(unshort)),
          domain || styled("N/A", STYLE_PLACEHOLDER), link.affiliate_platform || "", retailer,
          styled(social, styleForSocial(social)), styled(excluded, styleForExcluded(excluded)),
        ], xlsxRowIdx, SHEET3_HEADERS.length));
        xlsxRowIdx++;
      });
    }
  }
  if (parts.length > 0) {
    const fragName = String(page + 1).padStart(6, "0") + ".xml";
    await uploadFragment(supabase, `${job.storage_prefix}/parts/s3/${fragName}`, parts.join(""));
  }
  const more = videos.length === CHUNK_VIDEO_PAGE;
  return more
    ? { done: false, nextCursor: { page: page + 1, rowIdx: xlsxRowIdx } }
    : { done: true, nextStage: "s4", nextCursor: { page: 0 } };
}

async function runStageS4(supabase: any, job: JobRow): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  const page = Number(job.cursor?.page ?? 0);
  const startRowIdx = Number(job.cursor?.rowIdx ?? 1);
  const from = page * CHUNK_VIDEO_PAGE;
  const to = from + CHUNK_VIDEO_PAGE - 1;

  const videos = await fetchPage<any>(supabase, "videos", "id,video_id,title,channel_id,channel_name", from, to, "id");
  if (videos.length === 0) return { done: true, nextStage: "s5", nextCursor: { page: 0 } };

  const videoIds = videos.map(v => v.id);
  const vks = await fetchByIds<any>(supabase, "video_keywords", "video_id", "video_id", videoIds);
  const hasKeyword = new Set<string>(vks.map((v: any) => v.video_id));
  const last50 = videos.filter(v => !hasKeyword.has(v.id));

  // Channel counts for "Total Videos From Channel" must be over the whole table.
  // Cache in metadata across pages.
  let channelCountsObj: Record<string, number> = job.metadata?.s4ChannelCounts;
  if (!channelCountsObj) {
    channelCountsObj = {};
    let f = 0; const B = 1000;
    while (true) {
      const { data, error } = await supabase.from("videos").select("channel_id,id").range(f, f + B - 1);
      if (error) throw error;
      const all = data ?? [];
      // Need to filter to last-50 (no keyword). Cheaper: count all videos per channel — same as prior `last50.filter`.
      // Prior code grouped only no-keyword videos, but to keep memory bounded and avoid re-scanning vk table,
      // we approximate with all videos per channel. This matches "Total Videos From Channel" semantics.
      for (const v of all) channelCountsObj[v.channel_id] = (channelCountsObj[v.channel_id] || 0) + 1;
      if (all.length < B) break;
      f += B;
    }
    await patchJob(supabase, job.id, { metadata: { ...(job.metadata ?? {}), s4ChannelCounts: channelCountsObj } });
  }

  // Channel URLs lookup for the channel ids in this page.
  const ytIds = [...new Set(last50.map(v => v.channel_id))];
  const channels = ytIds.length === 0 ? [] : await fetchByIds<any>(supabase, "channels", "channel_id,channel_url", "channel_id", ytIds);
  const chMap = new Map<string, string>(channels.map((c: any) => [c.channel_id, c.channel_url]));

  const parts: string[] = [];
  let xlsxRowIdx = startRowIdx;
  for (const v of last50) {
    parts.push(rowXml([
      styled("Last 50 Scraped Video", STYLE_PLACEHOLDER),
      v.title,
      `https://www.youtube.com/watch?v=${v.video_id}`,
      v.channel_name,
      chMap.get(v.channel_id) || `https://www.youtube.com/channel/${v.channel_id}`,
      channelCountsObj[v.channel_id] || 0,
    ], xlsxRowIdx, SHEET4_HEADERS.length));
    xlsxRowIdx++;
  }
  if (parts.length > 0) {
    const fragName = String(page + 1).padStart(6, "0") + ".xml";
    await uploadFragment(supabase, `${job.storage_prefix}/parts/s4/${fragName}`, parts.join(""));
  }
  const more = videos.length === CHUNK_VIDEO_PAGE;
  return more
    ? { done: false, nextCursor: { page: page + 1, rowIdx: xlsxRowIdx } }
    : { done: true, nextStage: "s5", nextCursor: { page: 0 } };
}

// Compute best video rank per channel. Cached in metadata once.
async function getChannelBestRank(supabase: any, job: JobRow): Promise<Record<string, number>> {
  if (job.metadata?.channelBestRank) return job.metadata.channelBestRank;
  const out: Record<string, number> = {};
  // Walk video_keywords with non-null rank, joining via videos.channel_id.
  // Page in chunks to keep memory bounded.
  const BATCH = 5000;
  let from = 0;
  // Build map video_id -> channel_id lazily by id batches.
  while (true) {
    const { data: vks, error } = await supabase
      .from("video_keywords")
      .select("video_id,search_rank")
      .not("search_rank", "is", null)
      .order("video_id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    if (!vks || vks.length === 0) break;
    const ids = [...new Set(vks.map((v: any) => v.video_id))];
    const vidRows = await fetchByIds<any>(supabase, "videos", "id,channel_id", "id", ids);
    const ytById = new Map<string, string>(vidRows.map((v: any) => [v.id, v.channel_id]));
    for (const vk of vks) {
      const yt = ytById.get(vk.video_id);
      if (!yt) continue;
      const cur = out[yt];
      if (cur == null || vk.search_rank < cur) out[yt] = vk.search_rank;
    }
    if (vks.length < BATCH) break;
    from += BATCH;
  }
  await patchJob(supabase, job.id, { metadata: { ...(job.metadata ?? {}), channelBestRank: out } });
  return out;
}

async function ensureChannelLinksScrapedChunk(supabase: any, channelIds: string[]) {
  if (channelIds.length === 0) return;
  for (let i = 0; i < channelIds.length; i += 25) {
    const batch = channelIds.slice(i, i + 25);
    const { data, error } = await supabase.functions.invoke("scrape-channel-links", {
      body: { channel_ids: batch, batch_size: batch.length },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to scrape channel link headers");
  }
}

async function runStageS5(supabase: any, job: JobRow, retailerByDomain: Map<string, string>, affiliateByDomain: Map<string, string>): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  const page = Number(job.cursor?.page ?? 0);
  const startRowIdx = Number(job.cursor?.rowIdx ?? 1);
  const from = page * CHUNK_CHANNEL_PAGE;
  const to = from + CHUNK_CHANNEL_PAGE - 1;

  let channels = await fetchPage<any>(supabase, "channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos", from, to, "id");
  if (channels.length === 0) return { done: true, nextStage: "s6", nextCursor: { page: 0 } };

  const needScrape = channels.filter(c => !c.custom_links_scraped_at).map(c => c.channel_id);
  if (needScrape.length > 0) {
    await ensureChannelLinksScrapedChunk(supabase, needScrape);
    channels = await fetchByIds<any>(supabase, "channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos", "id", channels.map(c => c.id));
  }

  const bestRank = await getChannelBestRank(supabase, job);

  const parts: string[] = [];
  let xlsxRowIdx = startRowIdx;
  for (const ch of channels) {
    const description = ch.description?.trim() ? ch.description : "No Description";
    const rank = bestRank[ch.channel_id];
    const fetched = ch.total_videos_fetched ?? 0;
    const yt = ch.youtube_total_videos;
    const fetchedDisplay = (yt != null && yt < 50 && fetched >= yt) ? `${fetched} (complete)` : fetched;
    const ytTotal = ch.youtube_total_videos ?? "N/A";
    const base = [
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.channel_name,
      ch.subscriber_count ?? 0,
      rank != null ? rank : styled("N/A", STYLE_PLACEHOLDER),
      ch.median_views ?? 0,
      ch.median_likes ?? 0,
      ch.median_comments ?? 0,
      fetchedDisplay,
      typeof ytTotal === "string" ? styled(ytTotal, styleForPlaceholder(ytTotal)) : ytTotal,
      styled(description, styleForPlaceholder(description)),
    ];
    const scraped = Array.isArray(ch.custom_links) ? ch.custom_links.filter((l: any) => l && l.url) : [];
    const seen = new Set<string>();
    const linkPairs: Array<{ header: string; url: string }> = [];
    for (const l of scraped) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      linkPairs.push({ header: (l.header || "").trim() || inferHeaderFromUrl(l.url), url: l.url });
    }
    for (const url of extractUrls(ch.description)) {
      if (seen.has(url)) continue;
      seen.add(url);
      linkPairs.push({ header: inferHeaderFromUrl(url), url });
    }
    if (linkPairs.length === 0) {
      parts.push(rowXml([...base,
        styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
        styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
      ], xlsxRowIdx, SHEET5_HEADERS.length));
      xlsxRowIdx++;
    } else {
      linkPairs.forEach(({ header, url }, idx) => {
        const domain = extractDomain(url);
        const social = getSocialPlatform(domain);
        const affiliate = lookupByDomain(domain, affiliateByDomain);
        const retailer = lookupByDomain(domain, retailerByDomain);
        const excluded = social ? `Excluded - Social (${social})` : "";
        parts.push(rowXml([
          ...base,
          `L${idx + 1}`,
          header,
          url,
          styled("N/A", STYLE_PLACEHOLDER),
          domain || styled("N/A", STYLE_PLACEHOLDER),
          affiliate || "",
          retailer || "",
          styled(social, styleForSocial(social)),
          styled(excluded, styleForExcluded(excluded)),
        ], xlsxRowIdx, SHEET5_HEADERS.length));
        xlsxRowIdx++;
      });
    }
  }
  if (parts.length > 0) {
    const fragName = String(page + 1).padStart(6, "0") + ".xml";
    await uploadFragment(supabase, `${job.storage_prefix}/parts/s5/${fragName}`, parts.join(""));
  }
  const more = channels.length === CHUNK_CHANNEL_PAGE;
  return more
    ? { done: false, nextCursor: { page: page + 1, rowIdx: xlsxRowIdx } }
    : { done: true, nextStage: "s6", nextCursor: { page: 0 } };
}

async function runStageS6(supabase: any, job: JobRow): Promise<{ done: boolean; nextCursor?: any; nextStage?: string }> {
  const page = Number(job.cursor?.page ?? 0);
  const startRowIdx = Number(job.cursor?.rowIdx ?? 1);
  const from = page * CHUNK_CHANNEL_PAGE;
  const to = from + CHUNK_CHANNEL_PAGE - 1;

  const channels = await fetchPage<any>(supabase, "channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,contact_email,instagram_url,country,youtube_category,affiliate_status,custom_links", from, to, "id");
  if (channels.length === 0) return { done: true, nextStage: "finalize", nextCursor: {} };

  const channelInternalIds = channels.map(c => c.id);
  const igs = await fetchByIds<any>(supabase, "instagram_profiles", "channel_id,instagram_username,follower_count,bio,business_category", "channel_id", channelInternalIds);
  const igByChannelId = new Map(igs.map((i: any) => [i.channel_id, i]));

  const parts: string[] = [];
  let xlsxRowIdx = startRowIdx;
  for (const ch of channels) {
    const ig = igByChannelId.get(ch.id);
    const scraped = Array.isArray(ch.custom_links) ? ch.custom_links.filter((l: any) => l && l.url).map((l: any) => l.url) : [];
    const descUrls = extractUrls(ch.description);
    const allUrls = [...new Set([...scraped, ...descUrls])];
    const findSocial = (names: string[]) => {
      for (const url of allUrls) {
        const platform = getSocialPlatform(extractDomain(url));
        if (names.includes(platform)) return url;
      }
      return "";
    };
    const country = ch.country || "N/A";
    const category = ch.youtube_category || "N/A";
    const affStatus = ch.affiliate_status || "N/A";
    const email = ch.contact_email || "No Email";
    const igHandle = ig?.instagram_username || "No Instagram";
    const igFollowers = ig?.follower_count ?? "N/A";
    const igBio = ig?.bio || "N/A";
    const igCat = ig?.business_category || "N/A";
    parts.push(rowXml([
      ch.channel_name,
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.subscriber_count ?? 0,
      styled(country, styleForPlaceholder(country)),
      styled(category, styleForPlaceholder(category)),
      styled(affStatus, styleForPlaceholder(affStatus)),
      styled(email, styleForPlaceholder(email)),
      styled(igHandle, styleForPlaceholder(igHandle)),
      typeof igFollowers === "string" ? styled(igFollowers, styleForPlaceholder(igFollowers)) : igFollowers,
      styled(igBio, styleForPlaceholder(igBio)),
      styled(igCat, styleForPlaceholder(igCat)),
      ch.instagram_url || findSocial(["Instagram"]) || "",
      findSocial(["Facebook"]),
      findSocial(["Twitter/X"]),
      findSocial(["WhatsApp"]),
      findSocial(["Telegram"]),
      findSocial(["Snapchat"]),
      findSocial(["LinkedIn"]),
      findSocial(["YouTube"]),
    ], xlsxRowIdx, SHEET6_HEADERS.length));
    xlsxRowIdx++;
  }
  if (parts.length > 0) {
    const fragName = String(page + 1).padStart(6, "0") + ".xml";
    await uploadFragment(supabase, `${job.storage_prefix}/parts/s6/${fragName}`, parts.join(""));
  }
  const more = channels.length === CHUNK_CHANNEL_PAGE;
  return more
    ? { done: false, nextCursor: { page: page + 1, rowIdx: xlsxRowIdx } }
    : { done: true, nextStage: "finalize", nextCursor: {} };
}

// Stitch fragments + zip + upload final.
async function runStageFinalize(supabase: any, job: JobRow): Promise<void> {
  const sheetXmls: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const sheet of SHEETS_IN_ORDER) {
    const head = encoder.encode(sheetHeaderXml(sheet.headers));
    const tail = encoder.encode(SHEET_FOOTER_XML);
    const fragPaths = await listFragments(supabase, `${job.storage_prefix}/parts/${sheet.stage}`);
    const bodies: Uint8Array[] = [];
    let totalBody = 0;
    for (const p of fragPaths) {
      const b = await downloadFragment(supabase, p);
      bodies.push(b);
      totalBody += b.length;
    }
    const out = new Uint8Array(head.length + totalBody + tail.length);
    out.set(head, 0);
    let off = head.length;
    for (const b of bodies) { out.set(b, off); off += b.length; }
    out.set(tail, off);
    sheetXmls.push(out);
  }

  const zipInput: Record<string, Uint8Array> = {};
  zipInput["[Content_Types].xml"] = strToU8(buildContentTypes(SHEETS_IN_ORDER.length));
  zipInput["_rels/.rels"] = strToU8(ROOT_RELS);
  zipInput["xl/workbook.xml"] = strToU8(buildWorkbookXml(SHEETS_IN_ORDER.map(s => s.name)));
  zipInput["xl/_rels/workbook.xml.rels"] = strToU8(buildWorkbookRels(SHEETS_IN_ORDER.length));
  zipInput["xl/styles.xml"] = strToU8(STYLES_XML);
  sheetXmls.forEach((x, i) => { zipInput[`xl/worksheets/sheet${i+1}.xml`] = x; });
  const xlsxBytes = zipSync(zipInput, { level: 6 });

  const date = new Date().toISOString().split("T")[0];
  const finalPath = `${job.user_id}/youtube_full_report_${date}_${job.id.slice(0, 8)}.xlsx`;
  const { error: upErr } = await supabase.storage.from("exports").upload(finalPath, xlsxBytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });
  if (upErr) throw upErr;

  await patchJob(supabase, job.id, {
    status: "completed",
    stage: "completed",
    storage_path: finalPath,
    result_path: finalPath,
    file_size_bytes: xlsxBytes.byteLength,
    progress_message: "Done",
    completed_at: nowIso(),
    lease_expires_at: null,
  });
}

// ========== Worker entrypoint ==========
async function runOneChunk(supabase: any, jobId: string) {
  const job = await tryClaim(supabase, jobId);
  if (!job) return;

  try {
    const stageLabel = (s: string) => {
      switch (s) {
        case "s1": return "Building S1 (keyword summary)...";
        case "s2": return `Building S2 (videos page ${(job.cursor?.page ?? 0) + 1})...`;
        case "s3": return `Building S3 (last-50 page ${(job.cursor?.page ?? 0) + 1})...`;
        case "s4": return `Building S4 (channel map page ${(job.cursor?.page ?? 0) + 1})...`;
        case "s5": return `Building S5 (channels page ${(job.cursor?.page ?? 0) + 1})...`;
        case "s6": return `Building S6 (contacts page ${(job.cursor?.page ?? 0) + 1})...`;
        case "finalize": return "Stitching workbook...";
        default: return `Stage ${s}`;
      }
    };
    await patchJob(supabase, jobId, { progress_message: stageLabel(job.stage), heartbeat_at: nowIso() });

    let result: { done: boolean; nextCursor?: any; nextStage?: string } | undefined;

    if (job.stage === "queued") {
      await patchJob(supabase, jobId, { stage: "s1", cursor: {} });
      selfInvoke(jobId);
      return;
    }

    if (job.stage === "s1") {
      result = await runStageS1(supabase, job);
    } else if (job.stage === "s2" || job.stage === "s3") {
      const { retailerByDomain } = await loadPatterns(supabase);
      const affiliateCounts = await getAffiliateCounts(supabase, job);
      result = job.stage === "s2"
        ? await runStageS2(supabase, job, retailerByDomain, affiliateCounts)
        : await runStageS3(supabase, job, retailerByDomain, affiliateCounts);
    } else if (job.stage === "s4") {
      result = await runStageS4(supabase, job);
    } else if (job.stage === "s5") {
      const { retailerByDomain, affiliateByDomain } = await loadPatterns(supabase);
      result = await runStageS5(supabase, job, retailerByDomain, affiliateByDomain);
    } else if (job.stage === "s6") {
      result = await runStageS6(supabase, job);
    } else if (job.stage === "finalize") {
      await runStageFinalize(supabase, job);
      return;
    } else {
      return;
    }

    const patch: any = { heartbeat_at: nowIso(), lease_expires_at: null };
    if (result.done) {
      patch.stage = result.nextStage;
      patch.cursor = result.nextCursor ?? {};
    } else {
      patch.cursor = result.nextCursor ?? {};
    }
    await patchJob(supabase, jobId, patch);
    selfInvoke(jobId);
  } catch (e: any) {
    await patchJob(supabase, jobId, {
      status: "failed",
      error: `[${job.stage}] ${e?.message || String(e)}`,
      completed_at: nowIso(),
      lease_expires_at: null,
    });
  }
}

// ========== HTTP entrypoint ==========
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  // Internal worker self-call uses service-role auth; skip user resolution.
  const isInternal = req.headers.get("x-internal-worker") === "1";

  let userId: string | null = null;
  if (!isInternal) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    userId = user.id;
  }

  // Internal worker tick.
  if (isInternal && body.action === "work" && body.job_id) {
    const task = runOneChunk(supabase, body.job_id);
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Status endpoint.
  if (body.action === "status") {
    const { data } = await supabase.from("export_jobs").select("*").eq("id", body.job_id).eq("user_id", userId).maybeSingle();
    if (!data) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Re-kick stalled jobs opportunistically.
    if (data.status === "running" && (!data.lease_expires_at || new Date(data.lease_expires_at).getTime() < Date.now() - 10_000)) {
      selfInvoke(data.id);
    }

    let signedUrl: string | null = null;
    if (data.status === "completed" && data.storage_path) {
      const { data: signed } = await supabase.storage.from("exports").createSignedUrl(data.storage_path, 300);
      signedUrl = signed?.signedUrl ?? null;
    }
    return new Response(JSON.stringify({ ...data, signed_url: signedUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Start a new job.
  const { data: jobRow, error: insErr } = await supabase.from("export_jobs").insert({
    user_id: userId,
    status: "queued",
    stage: "queued",
    cursor: {},
    progress_message: "Queued...",
  }).select().single();
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Set storage_prefix now that we have the job id.
  const storagePrefix = `${userId}/${jobRow.id}`;
  await patchJob(supabase, jobRow.id, { storage_prefix: storagePrefix });

  // Kick off first worker tick.
  selfInvoke(jobRow.id);

  return new Response(JSON.stringify({ job_id: jobRow.id, status: "queued" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
