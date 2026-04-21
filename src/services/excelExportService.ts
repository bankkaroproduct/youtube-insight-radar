import { supabase } from "@/integrations/supabase/client";

// ===== Types =====
type Video = {
  id: string;
  video_id: string;
  title: string;
  description: string | null;
  channel_id: string;
  channel_name: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
};

type VideoLink = {
  id: string;
  video_id: string;
  original_url: string;
  unshortened_url: string | null;
  domain: string | null;
  original_domain: string | null;
  affiliate_platform: string | null;
  resolved_retailer: string | null;
  classification: string | null;
};

type VideoKeyword = { video_id: string; keyword_id: string; search_rank: number | null };

type VkEntry = { keyword_id: string; search_rank: number | null };

type Keyword = {
  id: string;
  keyword: string;
  category: string;
  business_aim: string;
  priority: string | null;
  status: string;
  estimated_volume: string | null;
  last_priority_fetch_at: string | null;
};

type Channel = {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string | null;
  description: string | null;
  subscriber_count: number | null;
  median_views: number | null;
  median_likes: number | null;
  median_comments: number | null;
  contact_email: string | null;
  instagram_url: string | null;
  country: string | null;
  youtube_category: string | null;
  affiliate_status: string | null;
  custom_links: Array<{ header: string; url: string }> | null;
  custom_links_scraped_at: string | null;
  total_videos_fetched: number | null;
  youtube_total_videos: number | null;
};

type IGProfile = {
  channel_id: string;
  instagram_username: string | null;
  follower_count: number | null;
  bio: string | null;
  business_category: string | null;
};

// ===== Constants =====
const SOCIAL_DOMAINS: Record<string, string> = {
  "instagram.com": "Instagram",
  "fb.com": "Facebook",
  "facebook.com": "Facebook",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "wa.me": "WhatsApp",
  "wa.link": "WhatsApp",
  "whatsapp.com": "WhatsApp",
  "t.me": "Telegram",
  "telegram.me": "Telegram",
  "telegram.org": "Telegram",
  "snapchat.com": "Snapchat",
  "linkedin.com": "LinkedIn",
  "pinterest.com": "Pinterest",
  "pin.it": "Pinterest",
  "threads.net": "Threads",
  "spotify.com": "Spotify",
  "discord.gg": "Discord",
  "discord.com": "Discord",
};

const PLACEHOLDERS = new Set(["No Links", "No Description", "No Email", "No Instagram", "N/A", "Last 50 Scraped Video"]);

// ===== Style helpers =====
// Note: borders intentionally omitted to keep file size small.
// Only header + special data cells (placeholder/red/blue) get styled.
const headerStyle = {
  font: { bold: true, name: "Arial", sz: 10 },
  fill: { fgColor: { rgb: "E0E0E0" }, patternType: "solid" },
  alignment: { vertical: "center", wrapText: true },
};
const placeholderStyle = { font: { name: "Arial", sz: 10, italic: true, color: { rgb: "808080" } } };
const redStyle = { font: { name: "Arial", sz: 10, color: { rgb: "FF0000" } } };
const blueStyle = { font: { name: "Arial", sz: 10, color: { rgb: "0000FF" } } };

// ===== Helpers =====
function extractDomain(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = /(https?:\/\/[^\s<>"'\)]+)/gi;
  const matches = text.match(re) || [];
  // strip trailing punctuation
  return matches.map(u => u.replace(/[.,;:!?\)]+$/, ""));
}

function getSocialPlatform(domain: string): string {
  if (!domain) return "";
  // Try exact then suffix match
  if (SOCIAL_DOMAINS[domain]) return SOCIAL_DOMAINS[domain];
  for (const [d, name] of Object.entries(SOCIAL_DOMAINS)) {
    if (domain === d || domain.endsWith("." + d)) return name;
  }
  return "";
}

// Infer a friendly header label from a URL when no scraped header is available.
// e.g. instagram.com -> "Instagram", haulpack.com -> "Haulpack".
function inferHeaderFromUrl(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return "Link";
  const social = getSocialPlatform(domain);
  if (social) return social;
  // Take the second-level domain word, title-case it.
  const parts = domain.split(".");
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!root) return "Link";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

async function fetchAll<T>(table: string, select = "*"): Promise<T[]> {
  const BATCH = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase.from(table as any).select(select).range(from, from + BATCH - 1) as any);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all = all.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

async function ensureChannelLinksScraped(channels: Channel[], onProgress?: (msg: string) => void): Promise<Channel[]> {
  const pending = channels.filter((channel) => !channel.custom_links_scraped_at).map((channel) => channel.channel_id);
  if (pending.length === 0) return channels;

  let processed = 0;
  for (let i = 0; i < pending.length; i += 25) {
    const batch = pending.slice(i, i + 25);
    onProgress?.(`Scraping channel link headers (${processed + 1}-${processed + batch.length} of ${pending.length})...`);
    const { data, error } = await supabase.functions.invoke("scrape-channel-links", {
      body: { channel_ids: batch, batch_size: batch.length },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to scrape channel link headers");
    processed += batch.length;
  }

  onProgress?.("Refreshing channels...");
  return fetchAll<Channel>(
    "channels",
    "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,contact_email,instagram_url,country,youtube_category,affiliate_status,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos"
  );
}

// ===== Sheet builders =====
function buildSheet1(keywords: Keyword[], videoCountByKeyword: Map<string, number>) {
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
      kw.keyword,
      kw.category || "N/A",
      kw.priority || "N/A",
      kw.estimated_volume || "N/A",
      videoCountByKeyword.get(kw.id) || 0,
      lastFetchDisplay,
      daysGap,
    ]);
  }
  return { headers, rows };
}

const REDIRECT_PARAMS = ["dl", "url", "u", "r", "redirect", "target", "to", "link", "dest", "destination"];

function tryMatchRetailerFromDomain(domain: string, retailerByDomain: Map<string, string>): string | null {
  if (!domain) return null;
  const r = retailerByDomain.get(domain);
  if (r) return r;
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
      // Decode possibly multiple times
      let decoded = raw;
      for (let i = 0; i < 3; i++) {
        try {
          const d = decodeURIComponent(decoded);
          if (d === decoded) break;
          decoded = d;
        } catch { break; }
      }
      // Try parsing as URL
      try {
        const inner = new URL(decoded.startsWith("http") ? decoded : `https://${decoded}`);
        const host = inner.hostname.replace(/^www\./, "").toLowerCase();
        const match = tryMatchRetailerFromDomain(host, retailerByDomain);
        if (match) return match;
      } catch {
        // Not a parseable URL — try domain regex extraction
        const m = decoded.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
        if (m) {
          const host = m[0].replace(/^www\./, "").toLowerCase();
          const match = tryMatchRetailerFromDomain(host, retailerByDomain);
          if (match) return match;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveRetailerDisplay(link: VideoLink, retailerByDomain: Map<string, string>): string {
  if (link.resolved_retailer) return link.resolved_retailer;
  // Try matching unshortened or original domain against known retailer patterns
  const candidates = [
    extractDomain(link.unshortened_url),
    link.domain,
    link.original_domain,
    extractDomain(link.original_url),
  ].filter(Boolean) as string[];
  for (const d of candidates) {
    const match = tryMatchRetailerFromDomain(d, retailerByDomain);
    if (match) return match;
  }
  // Try decoding embedded redirect params (e.g. haulpack.com/deeplink?dl=https%3A%2F%2Fmyntra.com...)
  const embedded = extractEmbeddedRetailer(link.unshortened_url, retailerByDomain)
    ?? extractEmbeddedRetailer(link.original_url, retailerByDomain);
  if (embedded) return embedded;
  if (link.affiliate_platform) return `Via ${link.affiliate_platform}`;
  return "N/A";
}

function computeExcluded(link: VideoLink, social: string, affiliateCounts: Map<string, number>): string {
  if (social) return `Excluded - Social (${social})`;
  const aff = link.affiliate_platform;
  if (aff && (affiliateCounts.get(aff) ?? 0) === 1) return "Excluded - Single Affiliate";
  return "";
}

function buildSheet2(videos: Video[], vkMap: Map<string, VkEntry[]>, keywordsById: Map<string, Keyword>, linksByVideo: Map<string, VideoLink[]>, retailerByDomain: Map<string, string>, affiliateCounts: Map<string, number>) {
  const headers = ["Keyword", "Category", "Business Aim", "Priority", "Search Rank", "KW Status", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const v of videos) {
    const entries = vkMap.get(v.id);
    if (!entries || entries.length === 0) continue;
    const links = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const totalLinks = links.length;
    for (const entry of entries) {
      const kw = keywordsById.get(entry.keyword_id);
      if (!kw) continue;
      const rank = entry.search_rank != null ? entry.search_rank : "N/A";
      const baseRow = [
        kw.keyword, kw.category || "N/A", kw.business_aim || "N/A", kw.priority || "N/A", rank, kw.status || "N/A",
        `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
        v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0, description, totalLinks,
      ];
      if (links.length === 0) {
        rows.push([...baseRow, "No Links", "No Links", "N/A", "N/A", "", "", "", ""]);
      } else {
        links.forEach((link, idx) => {
          const unshort = link.unshortened_url || "N/A";
          const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
          const social = getSocialPlatform(domain);
          const retailer = resolveRetailerDisplay(link, retailerByDomain);
          const excluded = computeExcluded(link, social, affiliateCounts);
          rows.push([...baseRow, `L${idx + 1}`, link.original_url, unshort, domain || "N/A", link.affiliate_platform || "", retailer, social, excluded]);
        });
      }
    }
  }
  return { headers, rows };
}

function buildSheet3(videos: Video[], vkMap: Map<string, VkEntry[]>, linksByVideo: Map<string, VideoLink[]>, retailerByDomain: Map<string, string>, affiliateCounts: Map<string, number>) {
  const headers = ["Keyword", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const v of videos) {
    if (vkMap.has(v.id)) continue; // only "Last 50" (no keyword)
    const links = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const baseRow = [
      "Last 50 Scraped Video",
      `https://www.youtube.com/watch?v=${v.video_id}`, v.title, v.channel_name,
      v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0, description, links.length,
    ];
    if (links.length === 0) {
      rows.push([...baseRow, "No Links", "No Links", "N/A", "N/A", "", "", "", ""]);
    } else {
      links.forEach((link, idx) => {
        const unshort = link.unshortened_url || "N/A";
        const domain = link.domain || link.original_domain || extractDomain(link.unshortened_url || link.original_url);
        const social = getSocialPlatform(domain);
        const retailer = resolveRetailerDisplay(link, retailerByDomain);
        const excluded = computeExcluded(link, social, affiliateCounts);
        rows.push([...baseRow, `L${idx + 1}`, link.original_url, unshort, domain || "N/A", link.affiliate_platform || "", retailer, social, excluded]);
      });
    }
  }
  return { headers, rows };
}

function buildSheet4(videos: Video[], vkMap: Map<string, VkEntry[]>, channelsByYTId: Map<string, Channel>) {
  const headers = ["Keyword", "Video Name", "Video Link", "Channel Name", "Channel Link", "Total Videos From Channel"];
  const last50 = videos.filter(v => !vkMap.has(v.id));
  const channelCounts = new Map<string, number>();
  for (const v of last50) channelCounts.set(v.channel_id, (channelCounts.get(v.channel_id) || 0) + 1);
  const rows: any[][] = last50.map(v => {
    const ch = channelsByYTId.get(v.channel_id);
    return [
      "Last 50 Scraped Video",
      v.title,
      `https://www.youtube.com/watch?v=${v.video_id}`,
      v.channel_name,
      ch?.channel_url || `https://www.youtube.com/channel/${v.channel_id}`,
      channelCounts.get(v.channel_id) || 0,
    ];
  });
  return { headers, rows };
}

function buildSheet5(
  channels: Channel[],
  channelBestRank: Map<string, number>,
  retailerByDomain: Map<string, string>,
  affiliateByDomain: Map<string, string>,
) {
  const headers = ["Channel Link", "Channel Name", "Channel Subscribers", "Best Video Rank", "Channel Avg Views", "Channel Avg Likes", "Channel Avg Comments", "Videos Fetched (Till Date)", "Total Videos on YouTube", "Channel Description", "Link #", "Link Header", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const ch of channels) {
    const description = ch.description?.trim() ? ch.description : "No Description";
    const bestRank = channelBestRank.get(ch.channel_id);
    const base = [
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.channel_name,
      ch.subscriber_count ?? 0,
      bestRank != null ? bestRank : "N/A",
      ch.median_views ?? 0,
      ch.median_likes ?? 0,
      ch.median_comments ?? 0,
      (() => {
        const fetched = ch.total_videos_fetched ?? 0;
        const yt = ch.youtube_total_videos;
        if (yt != null && yt < 50 && fetched >= yt) return `${fetched} (complete)`;
        return fetched;
      })(),
      ch.youtube_total_videos ?? "N/A",
      description,
    ];

    // Merge scraped custom_links (creator-set headers) with URLs extracted from description.
    const scraped = Array.isArray(ch.custom_links) ? ch.custom_links.filter(l => l && l.url) : [];
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
      rows.push([...base, "No Links", "No Links", "No Links", "N/A", "N/A", "", "", "", ""]);
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
          "N/A",
          domain || "N/A",
          affiliate || "",
          retailer || "",
          social,
          excluded,
        ]);
      });
    }
  }
  return { headers, rows };
}

// Match a domain against a domain->name map: exact match, then suffix match for subdomains.
function lookupByDomain(domain: string, map: Map<string, string>): string {
  if (!domain || map.size === 0) return "";
  if (map.has(domain)) return map.get(domain)!;
  for (const [d, name] of map) {
    if (domain === d || domain.endsWith("." + d)) return name;
  }
  return "";
}

function buildSheet6(channels: Channel[], igByChannelId: Map<string, IGProfile>) {
  const headers = ["Channel Name", "Channel Link", "Subscribers", "Country", "Category", "Affiliate Status", "Contact Email", "Instagram Handle", "IG Followers", "IG Bio", "IG Business Category", "Instagram Link", "Facebook Link", "Twitter Link", "WhatsApp Link", "Telegram Link", "Snapchat Link", "LinkedIn Link", "YouTube Link"];
  const rows: any[][] = channels.map(ch => {
    const ig = igByChannelId.get(ch.id);
    // Use scraped custom_links first, then fall back to description URLs.
    const scraped = Array.isArray(ch.custom_links) ? ch.custom_links.filter(l => l && l.url).map(l => l.url) : [];
    const descUrls = extractUrls(ch.description);
    const allUrls = [...new Set([...scraped, ...descUrls])];
    const findSocial = (names: string[]) => {
      for (const url of allUrls) {
        const platform = getSocialPlatform(extractDomain(url));
        if (names.includes(platform)) return url;
      }
      return "";
    };
    return [
      ch.channel_name,
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.subscriber_count ?? 0,
      ch.country || "N/A",
      ch.youtube_category || "N/A",
      ch.affiliate_status || "N/A",
      ch.contact_email || "No Email",
      ig?.instagram_username || "No Instagram",
      ig?.follower_count ?? "N/A",
      ig?.bio || "N/A",
      ig?.business_category || "N/A",
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

// ===== Worksheet construction with styles =====
function buildWorksheet(XLSX: any, sheetData: { headers: string[]; rows: any[][] }, socialColIdx: number | null, excludedColIdx: number | null) {
  const { headers, rows } = sheetData;
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const colCount = headers.length;
  const rowCount = aoa.length;

  // Column widths
  ws["!cols"] = headers.map(h => ({ wch: Math.max(12, Math.min(50, h.length + 4)) }));
  // Freeze top row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!views"] = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2", activePane: "bottomLeft" }];

  // Style ONLY header row + meaningful data cells (placeholder/red/blue).
  // Leaving plain data cells unstyled drastically reduces file size.
  // Header row
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) ws[addr] = { v: headers[c] ?? "", t: "s" };
    ws[addr].s = headerStyle;
  }
  // Data rows: only style cells that need color/italic
  for (let r = 1; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const val = cell.v;
      if (excludedColIdx !== null && c === excludedColIdx && typeof val === "string" && val.startsWith("Excluded")) {
        cell.s = redStyle;
      } else if (socialColIdx !== null && c === socialColIdx && typeof val === "string" && val) {
        cell.s = blueStyle;
      } else if (typeof val === "string" && PLACEHOLDERS.has(val)) {
        cell.s = placeholderStyle;
      }
    }
  }
  return ws;
}

// ===== Main entry =====
export async function exportFullReport(onProgress?: (msg: string) => void) {
  onProgress?.("Loading library...");
  const XLSX = (await import("xlsx-js-style")).default;

  onProgress?.("Fetching videos...");
  const videos = await fetchAll<Video>("videos", "id,video_id,title,description,channel_id,channel_name,view_count,like_count,comment_count,published_at");

  onProgress?.("Fetching links...");
  const links = await fetchAll<VideoLink>("video_links", "id,video_id,original_url,unshortened_url,domain,original_domain,affiliate_platform,resolved_retailer,classification");

  onProgress?.("Fetching keywords...");
  const vks = await fetchAll<VideoKeyword>("video_keywords", "video_id,keyword_id,search_rank");
  const keywordsAll = await fetchAll<Keyword>("keywords_search_runs", "id,keyword,category,business_aim,priority,status,estimated_volume,last_priority_fetch_at");

  onProgress?.("Fetching channels...");
  let channels = await fetchAll<Channel>("channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,contact_email,instagram_url,country,youtube_category,affiliate_status,custom_links,custom_links_scraped_at,total_videos_fetched,youtube_total_videos");
  channels = await ensureChannelLinksScraped(channels, onProgress);

  onProgress?.("Fetching Instagram...");
  const igs = await fetchAll<IGProfile>("instagram_profiles", "channel_id,instagram_username,follower_count,bio,business_category");

  onProgress?.("Building sheets...");

  // Maps
  const vkMap = new Map<string, VkEntry[]>(); // video.id -> [{keyword_id, search_rank}]
  for (const vk of vks) {
    const list = vkMap.get(vk.video_id) || [];
    list.push({ keyword_id: vk.keyword_id, search_rank: vk.search_rank ?? null });
    vkMap.set(vk.video_id, list);
  }

  // Per-channel best (min) search rank, keyed by YouTube channel_id
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
  const keywordsById = new Map(keywordsAll.map(k => [k.id, k]));
  const linksByVideo = new Map<string, VideoLink[]>();
  for (const l of links) {
    const list = linksByVideo.get(l.video_id) || [];
    list.push(l);
    linksByVideo.set(l.video_id, list);
  }
  const channelsByYTId = new Map(channels.map(c => [c.channel_id, c]));
  const igByChannelId = new Map(igs.map(i => [i.channel_id, i]));

  // Build retailer + affiliate-platform domain maps from affiliate_patterns
  const retailerByDomain = new Map<string, string>();
  const affiliateByDomain = new Map<string, string>();
  try {
    const patterns = await fetchAll<{ pattern: string; name: string; type: string; is_confirmed: boolean }>(
      "affiliate_patterns",
      "pattern,name,type,is_confirmed"
    );
    for (const p of patterns) {
      if (!p.is_confirmed) continue;
      const d = (p.pattern || "").replace(/^www\./, "").toLowerCase();
      if (!d) continue;
      const t = (p.type || "").toLowerCase();
      if (t === "retailer") retailerByDomain.set(d, p.name);
      else if (t === "affiliate_platform") affiliateByDomain.set(d, p.name);
    }
  } catch {
    // non-fatal: classification just won't fire
  }

  // Per-keyword video counts for Sheet 1
  const videoCountByKeyword = new Map<string, number>();
  for (const vk of vks) {
    videoCountByKeyword.set(vk.keyword_id, (videoCountByKeyword.get(vk.keyword_id) || 0) + 1);
  }

  // Affiliate platform frequency map across all links (for "Single Affiliate" exclusion)
  const affiliateCounts = new Map<string, number>();
  for (const l of links) {
    if (l.affiliate_platform) {
      affiliateCounts.set(l.affiliate_platform, (affiliateCounts.get(l.affiliate_platform) ?? 0) + 1);
    }
  }

  const s1 = buildSheet1(keywordsAll, videoCountByKeyword);
  const s2 = buildSheet2(videos, vkMap, keywordsById, linksByVideo, retailerByDomain, affiliateCounts);
  const s3 = buildSheet3(videos, vkMap, linksByVideo, retailerByDomain, affiliateCounts);
  const s4 = buildSheet4(videos, vkMap, channelsByYTId);
  const s5 = buildSheet5(channels, channelBestRank, retailerByDomain, affiliateByDomain);
  const s6 = buildSheet6(channels, igByChannelId);

  onProgress?.("Formatting workbook...");
  const wb = XLSX.utils.book_new();
  // Sheet 2: 22 cols → Social=20, Excluded=21 (added Search Rank at idx 4)
  // Sheet 3: 17 cols → Social=15, Excluded=16 (unchanged)
  // Sheet 5: 17 cols → Social=15, Excluded=16 (added Link Header at idx 9)
  const s1Ws = buildWorksheet(XLSX, s1, null, null);
  s1Ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, s1Ws, "S1 - Keyword Summary");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s2, 20, 21), "S2 - Video Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s3, 15, 16), "S3 - Last 50 Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s4, null, null), "S4 - Last 50 Channel Map");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s5, 17, 18), "S5 - Channel Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s6, null, null), "S6 - Contact Info");

  onProgress?.("Downloading file...");
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `youtube_full_report_${date}.xlsx`, { compression: true });
}
