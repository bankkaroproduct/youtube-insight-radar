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

type VideoKeyword = { video_id: string; keyword_id: string };

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
const thinBorder = { style: "thin", color: { rgb: "000000" } };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const headerStyle = {
  font: { bold: true, name: "Arial", sz: 10 },
  fill: { fgColor: { rgb: "E0E0E0" }, patternType: "solid" },
  border: allBorders,
  alignment: { vertical: "center", wrapText: true },
};
const baseDataStyle = { font: { name: "Arial", sz: 10 }, border: allBorders, alignment: { vertical: "top", wrapText: true } };
const placeholderStyle = { font: { name: "Arial", sz: 10, italic: true, color: { rgb: "808080" } }, border: allBorders, alignment: { vertical: "top" } };
const redStyle = { font: { name: "Arial", sz: 10, color: { rgb: "FF0000" } }, border: allBorders, alignment: { vertical: "top" } };
const blueStyle = { font: { name: "Arial", sz: 10, color: { rgb: "0000FF" } }, border: allBorders, alignment: { vertical: "top" } };

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

function buildSheet2(videos: Video[], vkMap: Map<string, string[]>, keywordsById: Map<string, Keyword>, linksByVideo: Map<string, VideoLink[]>, urlOccurrences: Map<string, number>) {
  const headers = ["Keyword", "Category", "Business Aim", "Priority", "KW Status", "Video Link", "Video Name", "Channel Name", "Video Views", "Video Likes", "Video Comments", "Video Description", "Total Links in Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const v of videos) {
    const kIds = vkMap.get(v.id);
    if (!kIds || kIds.length === 0) continue;
    const links = linksByVideo.get(v.id) || [];
    const description = v.description?.trim() ? v.description : "No Description";
    const totalLinks = links.length;
    for (const kId of kIds) {
      const kw = keywordsById.get(kId);
      if (!kw) continue;
      const baseRow = [
        kw.keyword, kw.category || "N/A", kw.business_aim || "N/A", kw.priority || "N/A", kw.status || "N/A",
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
          let excluded = "";
          if (social) excluded = `Excluded - Social (${social})`;
          else if (urlOccurrences.get(link.original_url) === 1) excluded = "Excluded - Single Use";
          else if (!link.affiliate_platform && !link.resolved_retailer && domain) excluded = "Excluded - Unknown Domain";
          rows.push([...baseRow, `L${idx + 1}`, link.original_url, unshort, domain || "N/A", link.affiliate_platform || "", link.resolved_retailer || "", social, excluded]);
        });
      }
    }
  }
  return { headers, rows };
}

function buildSheet3(videos: Video[], vkMap: Map<string, string[]>, linksByVideo: Map<string, VideoLink[]>, urlOccurrences: Map<string, number>) {
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
        let excluded = "";
        if (social) excluded = `Excluded - Social (${social})`;
        else if (urlOccurrences.get(link.original_url) === 1) excluded = "Excluded - Single Use";
        else if (!link.affiliate_platform && !link.resolved_retailer && domain) excluded = "Excluded - Unknown Domain";
        rows.push([...baseRow, `L${idx + 1}`, link.original_url, unshort, domain || "N/A", link.affiliate_platform || "", link.resolved_retailer || "", social, excluded]);
      });
    }
  }
  return { headers, rows };
}

function buildSheet4(videos: Video[], vkMap: Map<string, string[]>, channelsByYTId: Map<string, Channel>) {
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

function buildSheet5(channels: Channel[]) {
  const headers = ["Channel Link", "Channel Name", "Channel Avg Views", "Channel Avg Likes", "Channel Avg Comments", "Channel Description", "Link #", "Link", "Unshortened Link", "Domain", "Affiliate Used", "Retailer", "Social Platform", "Excluded"];
  const rows: any[][] = [];
  for (const ch of channels) {
    const description = ch.description?.trim() ? ch.description : "No Description";
    const urls = extractUrls(ch.description);
    const base = [
      ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`,
      ch.channel_name,
      ch.median_views ?? 0,
      ch.median_likes ?? 0,
      ch.median_comments ?? 0,
      description,
    ];
    if (urls.length === 0) {
      rows.push([...base, "No Links", "No Links", "N/A", "N/A", "", "", "", ""]);
    } else {
      urls.forEach((url, idx) => {
        const domain = extractDomain(url);
        const social = getSocialPlatform(domain);
        const excluded = social ? `Excluded - Social (${social})` : "";
        rows.push([...base, `L${idx + 1}`, url, "N/A", domain || "N/A", "", "", social, excluded]);
      });
    }
  }
  return { headers, rows };
}

function buildSheet6(channels: Channel[], igByChannelId: Map<string, IGProfile>) {
  const headers = ["Channel Name", "Channel Link", "Subscribers", "Country", "Category", "Affiliate Status", "Contact Email", "Instagram Handle", "IG Followers", "IG Bio", "IG Business Category", "Instagram Link", "Facebook Link", "Twitter Link", "WhatsApp Link", "Telegram Link", "Snapchat Link", "LinkedIn Link", "YouTube Link"];
  const rows: any[][] = channels.map(ch => {
    const ig = igByChannelId.get(ch.id);
    const urls = extractUrls(ch.description);
    const findSocial = (names: string[]) => {
      for (const url of urls) {
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

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) {
        ws[addr] = { v: "", t: "s", s: r === 0 ? headerStyle : baseDataStyle };
        continue;
      }
      if (r === 0) {
        cell.s = headerStyle;
      } else {
        const val = cell.v;
        const isPlaceholder = typeof val === "string" && PLACEHOLDERS.has(val);
        if (excludedColIdx !== null && c === excludedColIdx && typeof val === "string" && val.startsWith("Excluded")) {
          cell.s = redStyle;
        } else if (socialColIdx !== null && c === socialColIdx && typeof val === "string" && val) {
          cell.s = blueStyle;
        } else if (isPlaceholder) {
          cell.s = placeholderStyle;
        } else {
          cell.s = baseDataStyle;
        }
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
  const vks = await fetchAll<VideoKeyword>("video_keywords", "video_id,keyword_id");
  const keywordsAll = await fetchAll<Keyword>("keywords_search_runs", "id,keyword,category,business_aim,priority,status,estimated_volume,last_priority_fetch_at");

  onProgress?.("Fetching channels...");
  const channels = await fetchAll<Channel>("channels", "id,channel_id,channel_name,channel_url,description,subscriber_count,median_views,median_likes,median_comments,contact_email,instagram_url,country,youtube_category,affiliate_status");

  onProgress?.("Fetching Instagram...");
  const igs = await fetchAll<IGProfile>("instagram_profiles", "channel_id,instagram_username,follower_count,bio,business_category");

  onProgress?.("Building sheets...");

  // Maps
  const vkMap = new Map<string, string[]>(); // video.id -> keyword_ids
  for (const vk of vks) {
    const list = vkMap.get(vk.video_id) || [];
    list.push(vk.keyword_id);
    vkMap.set(vk.video_id, list);
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

  // URL occurrence count for "Single Use" detection
  const urlOccurrences = new Map<string, number>();
  for (const l of links) urlOccurrences.set(l.original_url, (urlOccurrences.get(l.original_url) || 0) + 1);

  // Per-keyword video counts for Sheet 1
  const videoCountByKeyword = new Map<string, number>();
  for (const vk of vks) {
    videoCountByKeyword.set(vk.keyword_id, (videoCountByKeyword.get(vk.keyword_id) || 0) + 1);
  }

  const s1 = buildSheet1(keywordsAll, videoCountByKeyword);
  const s2 = buildSheet2(videos, vkMap, keywordsById, linksByVideo, urlOccurrences);
  const s3 = buildSheet3(videos, vkMap, linksByVideo, urlOccurrences);
  const s4 = buildSheet4(videos, vkMap, channelsByYTId);
  const s5 = buildSheet5(channels);
  const s6 = buildSheet6(channels, igByChannelId);

  onProgress?.("Formatting workbook...");
  const wb = XLSX.utils.book_new();
  // Sheet 2: Social=19, Excluded=20
  // Sheet 3: Social=15, Excluded=16
  // Sheet 5: Social=12, Excluded=13
  const s1Ws = buildWorksheet(XLSX, s1, null, null);
  s1Ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, s1Ws, "S1 - Keyword Summary");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s2, 19, 20), "S2 - Video Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s3, 15, 16), "S3 - Last 50 Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s4, null, null), "S4 - Last 50 Channel Map");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s5, 12, 13), "S5 - Channel Deep Data");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(XLSX, s6, null, null), "S6 - Contact Info");

  onProgress?.("Downloading file...");
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `youtube_full_report_${date}.xlsx`);
}
