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

// ========== Data fetch ==========
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

// ========== Sheet builders (mirror client logic; Excluded/Social/placeholder cells styled) ==========

function buildSheet1(keywords: any[], videoCountByKeyword: Map<string, number>) {
  const headers = ["Keyword", "Category", "Priority", "Search Volume", "Total Videos Fetched", "Last Fetch Date", "Days Since Last Fetch"];
  const rows: any[][] = [];
  const today = Date.now();
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
    rows.push([
      kw.keyword, kw.category || "N/A", kw.priority || "N/A", kw.estimated_volume || "N/A",
      videoCountByKeyword.get(kw.id) || 0, lastFetchDisplay,
      typeof daysGap === "string" ? styled(daysGap, styleForPlaceholder(daysGap)) : daysGap,
    ]);
  }
  return { headers, rows };
}

const S2_HEADERS = ["Keyword", "Category", "Business Aim", "Priority", "Search Rank", "KW Status", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];

// Streams S2 sheet XML directly to a tmpfile to avoid holding ~394k row arrays
// + their styled-cell objects in JS heap simultaneously. Returns the tmpfile path
// plus row count; the file contents are spliced into the final zip later.
async function buildSheet2ToFile(
  videos: any[],
  vkMap: Map<string, any[]>,
  keywordsById: Map<string, any>,
  linksByVideo: Map<string, any[]>,
  retailerByDomain: Map<string, string>,
  affiliateCounts: Map<string, number>,
): Promise<{ tmpPath: string; rowCount: number; headers: string[] }> {
  const headers = S2_HEADERS;
  const colCount = headers.length;
  const tmpPath = await Deno.makeTempFile({ suffix: ".xml" });
  const file = await Deno.open(tmpPath, { write: true, truncate: true });
  const encoder = new TextEncoder();
  const CHUNK_TARGET = 256 * 1024;
  let buf = "";
  let rowCount = 0;
  let xlsxRowIdx = 1; // 0 is reserved for the header row written during zip assembly

  const flush = async (force = false) => {
    if (buf.length === 0) return;
    if (!force && buf.length < CHUNK_TARGET) return;
    await file.write(encoder.encode(buf));
    buf = "";
  };

  try {
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
        const baseRow: any[] = [
          kw.keyword, kw.category || "N/A", kw.business_aim || "N/A", kw.priority || "N/A",
          typeof rank === "string" ? styled(rank, styleForPlaceholder(rank)) : rank,
          kw.status || "N/A",
          `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
          v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0,
          styled(description, styleForPlaceholder(description)), totalLinks,
        ];
        if (vlinks.length === 0) {
          const row = [...baseRow,
            styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
            styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
          ];
          buf += rowXml(row, xlsxRowIdx++, colCount);
          rowCount++;
          await flush();
        } else {
          for (let idx = 0; idx < vlinks.length; idx++) {
            const link = vlinks[idx];
            const unshort = link.unshortened_url || "N/A";
            const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
            const social = getSocialPlatform(domain);
            const retailer = resolveRetailerDisplay(link, retailerByDomain);
            const excluded = computeExcluded(link, social, affiliateCounts);
            const row = [...baseRow,
              `L${idx + 1}`, link.original_url, styled(unshort, styleForPlaceholder(unshort)),
              domain || styled("N/A", STYLE_PLACEHOLDER), link.affiliate_platform || "", retailer,
              styled(social, styleForSocial(social)), styled(excluded, styleForExcluded(excluded)),
            ];
            buf += rowXml(row, xlsxRowIdx++, colCount);
            rowCount++;
            await flush();
          }
        }
      }
    }
    await flush(true);
  } finally {
    file.close();
  }
  return { tmpPath, rowCount, headers };
}

// Wraps a pre-built row-XML body (from buildSheet2ToFile) into a complete sheet XML.
function buildSheet2XmlFromBody(headers: string[], rowsBody: Uint8Array): Uint8Array {
  const colCount = headers.length;
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
  const tail = '</sheetData></worksheet>';
  const headBytes = strToU8(head.join(""));
  const tailBytes = strToU8(tail);
  const out = new Uint8Array(headBytes.length + rowsBody.length + tailBytes.length);
  out.set(headBytes, 0);
  out.set(rowsBody, headBytes.length);
  out.set(tailBytes, headBytes.length + rowsBody.length);
  return out;
}

function buildSheet3(videos: any[], vkMap: Map<string, any[]>, linksByVideo: Map<string, any[]>, retailerByDomain: Map<string, string>, affiliateCounts: Map<string, number>) {
  const headers = ["Keyword", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const v of videos) {
    if (vkMap.has(v.id)) continue;
    const links = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const baseRow = [
      styled("Last 50 Scraped Video", STYLE_PLACEHOLDER),
      `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
      v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0,
      styled(description, styleForPlaceholder(description)), links.length,
    ];
    if (links.length === 0) {
      rows.push([...baseRow,
        styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
        styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
      ]);
    } else {
      links.forEach((link, idx) => {
        const unshort = link.unshortened_url || "N/A";
        const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
        const social = getSocialPlatform(domain);
        const retailer = resolveRetailerDisplay(link, retailerByDomain);
        const excluded = computeExcluded(link, social, affiliateCounts);
        rows.push([...baseRow,
          `L${idx + 1}`, link.original_url, styled(unshort, styleForPlaceholder(unshort)),
          domain || styled("N/A", STYLE_PLACEHOLDER), link.affiliate_platform || "", retailer,
          styled(social, styleForSocial(social)), styled(excluded, styleForExcluded(excluded)),
        ]);
      });
    }
  }
  return { headers, rows };
}

function buildSheet4(videos: any[], vkMap: Map<string, any[]>, channelsByYTId: Map<string, any>) {
  const headers = ["Keyword", "Video Name", "Video Link", "Channel Name", "Channel Link", "Total Videos From Channel"];
  const last50 = videos.filter(v => !vkMap.has(v.id));
  const channelCounts = new Map<string, number>();
  for (const v of last50) channelCounts.set(v.channel_id, (channelCounts.get(v.channel_id) || 0) + 1);
  const rows: any[][] = last50.map(v => {
    const ch = channelsByYTId.get(v.channel_id);
    return [
      styled("Last 50 Scraped Video", STYLE_PLACEHOLDER),
      v.title,
      `https://www.youtube.com/watch?v=${v.video_id}`,
      v.channel_name,
      ch?.channel_url || `https://www.youtube.com/channel/${v.channel_id}`,
      channelCounts.get(v.channel_id) || 0,
    ];
  });
  return { headers, rows };
}

function buildSheet5(channels: any[], channelBestRank: Map<string, number>, retailerByDomain: Map<string, string>, affiliateByDomain: Map<string, string>) {
  const headers = ["Channel Link", "Channel Name", "Channel Subscribers", "Best Video Rank", "Channel Avg Views", "Channel Avg Likes", "Channel Avg Comments", "Videos Fetched (Till Date)", "Total Videos on YouTube", "Channel Description", "Link #", "Link Header", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const ch of channels) {
    const description = ch.description?.trim() ? ch.description : "No Description";
    const bestRank = channelBestRank.get(ch.channel_id);
    const fetched = ch.total_videos_fetched ?? 0;
    const yt = ch.youtube_total_videos;
    const fetchedDisplay = (yt != null && yt < 50 && fetched >= yt) ? `${fetched} (complete)` : fetched;
    const ytTotal = ch.youtube_total_videos ?? "N/A";
    const base = [
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.channel_name,
      ch.subscriber_count ?? 0,
      bestRank != null ? bestRank : styled("N/A", STYLE_PLACEHOLDER),
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
      rows.push([...base,
        styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER), styled("No Links", STYLE_PLACEHOLDER),
        styled("N/A", STYLE_PLACEHOLDER), styled("N/A", STYLE_PLACEHOLDER), "", "", "", "",
      ]);
    } else {
      linkPairs.forEach(({ header, url }, idx) => {
        const domain = extractDomain(url);
        const social = getSocialPlatform(domain);
        const affiliate = lookupByDomain(domain, affiliateByDomain);
        const retailer = lookupByDomain(domain, retailerByDomain);
        const excluded = social ? `Excluded - Social (${social})` : "";
        rows.push([
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
        ]);
      });
    }
  }
  return { headers, rows };
}

function buildSheet6(channels: any[], igByChannelId: Map<string, any>) {
  const headers = ["Channel Name", "Channel Link", "Subscribers", "Country", "Category", "Affiliate Status", "Contact Email", "Instagram Handle", "IG Followers", "IG Bio", "IG Business Category", "Instagram Link", "Facebook Link", "Twitter Link", "WhatsApp Link", "Telegram Link", "Snapchat Link", "LinkedIn Link", "YouTube Link"];
  const rows: any[][] = channels.map(ch => {
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
    return [
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
    ];
  });
  return { headers, rows };
}

// ========== XLSX assembly ==========

function buildSheetXml(sheetData: { headers: string[]; rows: any[][] }): string {
  const { headers, rows } = sheetData;
  const colCount = headers.length;
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  parts.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen" activePane="bottomLeft"/></sheetView></sheetViews>');
  parts.push('<cols>');
  headers.forEach((h, i) => {
    const width = Math.max(12, Math.min(50, h.length + 4));
    parts.push(`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`);
  });
  parts.push('</cols>');
  parts.push('<sheetData>');
  parts.push(`<row r="1">${headers.map((h, c) => cellXml(h, 0, c, STYLE_HEADER)).join("")}</row>`);
  for (let r = 0; r < rows.length; r++) {
    parts.push(rowXml(rows[r], r + 1, colCount));
  }
  parts.push('</sheetData>');
  parts.push('</worksheet>');
  return parts.join("");
}

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

function buildXlsxBuffer(sheetsInOrder: { name: string; data: { headers: string[]; rows: any[][] } }[]): Uint8Array {
  const zipInput: Record<string, Uint8Array> = {};
  zipInput["[Content_Types].xml"] = strToU8(buildContentTypes(sheetsInOrder.length));
  zipInput["_rels/.rels"] = strToU8(ROOT_RELS);
  zipInput["xl/workbook.xml"] = strToU8(buildWorkbookXml(sheetsInOrder.map(s => s.name)));
  zipInput["xl/_rels/workbook.xml.rels"] = strToU8(buildWorkbookRels(sheetsInOrder.length));
  zipInput["xl/styles.xml"] = strToU8(STYLES_XML);
  sheetsInOrder.forEach((s, i) => {
    zipInput[`xl/worksheets/sheet${i+1}.xml`] = strToU8(buildSheetXml(s.data));
  });
  return zipSync(zipInput, { level: 6 });
}

// ========== Channel-link scrape (mirrors client ensureChannelLinksScraped) ==========
async function ensureChannelLinksScraped(supabase: any, channels: any[], updateMsg: (m: string) => Promise<void>): Promise<any[]> {
  const pending = channels.filter((c) => !c.custom_links_scraped_at).map((c) => c.channel_id);
  if (pending.length === 0) return channels;

  let processed = 0;
  for (let i = 0; i < pending.length; i += 25) {
    const batch = pending.slice(i, i + 25);
    await updateMsg(`Scraping channel link headers (${processed + 1}-${processed + batch.length} of ${pending.length})...`);
    const { data, error } = await supabase.functions.invoke("scrape-channel-links", {
      body: { channel_ids: batch, batch_size: batch.length },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to scrape channel link headers");
    processed += batch.length;
  }

  await updateMsg("Refreshing channels...");
  return fetchAll<any>(supabase, "channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,contact_email,instagram_url,country,youtube_category,affiliate_status,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos");
}

// ========== Main handler ==========

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));

  // Endpoint 1: status
  if (body.action === "status") {
    const { data } = await supabase.from("export_jobs").select("*").eq("id", body.job_id).eq("user_id", user.id).single();
    if (!data) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let signedUrl: string | null = null;
    if (data.status === "completed" && data.storage_path) {
      const { data: signed } = await supabase.storage.from("exports").createSignedUrl(data.storage_path, 300);
      signedUrl = signed?.signedUrl ?? null;
    }
    return new Response(JSON.stringify({ ...data, signed_url: signedUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Endpoint 2: start a new job
  const { data: jobRow, error: insErr } = await supabase.from("export_jobs").insert({
    user_id: user.id, status: "running", progress_message: "Starting...",
  }).select().single();
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const updateJob = async (patch: any) => {
    await supabase.from("export_jobs").update(patch).eq("id", jobRow.id);
  };
  const updateMsg = (m: string) => updateJob({ progress_message: m });

  const backgroundTask = (async () => {
    try {
      await updateMsg("Fetching videos...");
      const videos = await fetchAll<any>(supabase, "videos", "id,video_id,title,description,channel_id,channel_name,view_count,like_count,comment_count,published_at");

      await updateMsg("Fetching links...");
      const links = await fetchAll<any>(supabase, "video_links", "id,video_id,original_url,unshortened_url,domain,original_domain,affiliate_platform,resolved_retailer,classification");

      await updateMsg("Fetching keywords...");
      const vks = await fetchAll<any>(supabase, "video_keywords", "video_id,keyword_id,search_rank");
      const keywordsAll = await fetchAll<any>(supabase, "keywords_search_runs", "id,keyword,category,business_aim,priority,status,estimated_volume,last_priority_fetch_at");

      await updateMsg("Fetching channels...");
      let channels = await fetchAll<any>(supabase, "channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,contact_email,instagram_url,country,youtube_category,affiliate_status,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos");

      // Scrape channel link headers for any channels missing them (mirrors client).
      channels = await ensureChannelLinksScraped(supabase, channels, updateMsg);

      await updateMsg("Fetching Instagram...");
      const igs = await fetchAll<any>(supabase, "instagram_profiles", "channel_id,instagram_username,follower_count,bio,business_category");

      await updateMsg("Fetching patterns...");
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

      await updateMsg("Building maps...");
      const vkMap = new Map<string, any[]>();
      for (const vk of vks) {
        const list = vkMap.get(vk.video_id) || [];
        list.push({ keyword_id: vk.keyword_id, search_rank: vk.search_rank ?? null });
        vkMap.set(vk.video_id, list);
      }
      const videoYTChannelById = new Map<string, string>();
      for (const v of videos) videoYTChannelById.set(v.id, v.channel_id);
      const channelBestRank = new Map<string, number>();
      for (const vk of vks) {
        if (vk.search_rank == null) continue;
        const ytId = videoYTChannelById.get(vk.video_id);
        if (!ytId) continue;
        const cur = channelBestRank.get(ytId);
        if (cur == null || vk.search_rank < cur) channelBestRank.set(ytId, vk.search_rank);
      }
      const keywordsById = new Map(keywordsAll.map((k: any) => [k.id, k]));
      const linksByVideo = new Map<string, any[]>();
      for (const l of links) {
        const list = linksByVideo.get(l.video_id) || [];
        list.push(l);
        linksByVideo.set(l.video_id, list);
      }
      const channelsByYTId = new Map(channels.map((c: any) => [c.channel_id, c]));
      const igByChannelId = new Map(igs.map((i: any) => [i.channel_id, i]));

      const videoCountByKeyword = new Map<string, number>();
      const affiliateCounts = new Map<string, number>();
      for (const vk of vks) videoCountByKeyword.set(vk.keyword_id, (videoCountByKeyword.get(vk.keyword_id) || 0) + 1);
      for (const l of links) if (l.affiliate_platform) affiliateCounts.set(l.affiliate_platform, (affiliateCounts.get(l.affiliate_platform) ?? 0) + 1);

      await updateMsg("Building S1...");
      const s1 = buildSheet1(keywordsAll, videoCountByKeyword);
      await updateMsg("Building S2 (largest)...");
      const s2 = buildSheet2(videos, vkMap, keywordsById, linksByVideo, retailerByDomain, affiliateCounts);
      await updateMsg("Building S3...");
      const s3 = buildSheet3(videos, vkMap, linksByVideo, retailerByDomain, affiliateCounts);
      await updateMsg("Building S4...");
      const s4 = buildSheet4(videos, vkMap, channelsByYTId);
      await updateMsg("Building S5...");
      const s5 = buildSheet5(channels, channelBestRank, retailerByDomain, affiliateByDomain);
      await updateMsg("Building S6...");
      const s6 = buildSheet6(channels, igByChannelId);

      await updateMsg("Zipping XLSX...");
      const xlsxBytes = buildXlsxBuffer([
        { name: "S1 - Keyword Summary", data: s1 },
        { name: "S2 - Video Deep Data", data: s2 },
        { name: "S3 - Last 50 Deep Data", data: s3 },
        { name: "S4 - Last 50 Channel Map", data: s4 },
        { name: "S5 - Channel Deep Data", data: s5 },
        { name: "S6 - Contact Info", data: s6 },
      ]);

      await updateMsg("Uploading...");
      const date = new Date().toISOString().split("T")[0];
      const path = `${user.id}/youtube_full_report_${date}_${jobRow.id.slice(0, 8)}.xlsx`;
      const { error: upErr } = await supabase.storage.from("exports").upload(path, xlsxBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (upErr) throw upErr;

      await updateJob({
        status: "completed",
        storage_path: path,
        file_size_bytes: xlsxBytes.byteLength,
        progress_message: "Done",
        completed_at: new Date().toISOString(),
      });
    } catch (e: any) {
      await updateJob({ status: "failed", error: e?.message || String(e), completed_at: new Date().toISOString() });
    }
  })();

  // @ts-ignore - EdgeRuntime is the Supabase edge-function runtime global.
  EdgeRuntime.waitUntil(backgroundTask);

  return new Response(JSON.stringify({ job_id: jobRow.id, status: "running" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
