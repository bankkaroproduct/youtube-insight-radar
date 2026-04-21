// Use built-in Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAvailableApiKeys(supabase: any, count: number) {
  const { data, error } = await supabase
    .from("youtube_api_keys")
    .select("id, api_key, quota_used_today, daily_quota_limit")
    .eq("is_active", true)
    .order("quota_used_today", { ascending: true })
    .limit(count);
  if (error || !data) return [];
  return data.filter((k: any) => k.daily_quota_limit === 0 || k.quota_used_today < k.daily_quota_limit);
}

async function markKeyExhausted(supabase: any, keyId: string) {
  await supabase.from("youtube_api_keys").update({
    is_active: false,
    last_test_status: "quota_exceeded",
    last_tested_at: new Date().toISOString(),
  }).eq("id", keyId);
}

async function incrementQuota(supabase: any, keyId: string, units: number, quotaCache: Map<string, number>) {
  const current = quotaCache.get(keyId) || 0;
  const newVal = current + units;
  quotaCache.set(keyId, newVal);
  await supabase.from("youtube_api_keys").update({
    quota_used_today: newVal,
    last_used_at: new Date().toISOString(),
  }).eq("id", keyId);
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

interface KeyData {
  id: string;
  api_key: string;
  quota_used_today: number;
  daily_quota_limit: number;
}

function parseInteger(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

async function processChannel(
  supabase: any,
  channel: { channel_id: string; total_videos_fetched?: number | null; youtube_total_videos?: number | null },
  apiKeys: KeyData[],
  keyIndex: { val: number },
  quotaCache: Map<string, number>,
  videosPerChannel: number,
): Promise<{ videosInserted: number; youtubeTotal: number | null }> {
  const channelId = channel.channel_id;
  let currentKey = apiKeys[keyIndex.val % apiKeys.length];

  // Step 1: Get the true total video count AND the uploads playlist id.
  // The uploads playlist is the authoritative ordered list of all channel uploads —
  // far more reliable than search.list, which only returns a recent slice.
  let youtubeTotal: number | null = channel.youtube_total_videos == null
    ? null
    : Number(channel.youtube_total_videos);
  let uploadsPlaylistId: string | null = null;
  try {
    const chParams = new URLSearchParams({
      part: "statistics,contentDetails",
      id: channelId,
      key: currentKey.api_key,
    });
    const chResp = await fetch(`https://www.googleapis.com/youtube/v3/channels?${chParams}`);
    if (chResp.ok) {
      await incrementQuota(supabase, currentKey.id, 1, quotaCache);
      const chData = await chResp.json();
      const item = chData?.items?.[0];
      const vc = item?.statistics?.videoCount;
      if (vc != null) youtubeTotal = parseInt(String(vc)) || 0;
      uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads || null;
    }
  } catch (e) {
    console.error(`channels.list failed for ${channelId}:`, e);
  }

  const { data: existingVideos } = await supabase
    .from("videos")
    .select("video_id")
    .eq("channel_id", channelId);

  const existingVideoIds = new Set((existingVideos || []).map((video: any) => String(video.video_id)));
  // Sanity guard: if YouTube total is below what we've already fetched, the cached count is wrong.
  // Treat it as unknown so we don't artificially cap the backfill target.
  const trustedYoutubeTotal = (youtubeTotal !== null && youtubeTotal >= existingVideoIds.size)
    ? youtubeTotal
    : null;
  const targetStoredVideos = Math.min(videosPerChannel, trustedYoutubeTotal ?? videosPerChannel);
  const missingVideos = Math.max(targetStoredVideos - existingVideoIds.size, 0);

  if (trustedYoutubeTotal !== null) {
    await supabase.from("channels").update({ youtube_total_videos: trustedYoutubeTotal }).eq("channel_id", channelId);
  }

  if (missingVideos === 0) {
    // Sync stale total_videos_fetched even when nothing new to fetch
    await supabase
      .from("channels")
      .update({ total_videos_fetched: existingVideoIds.size })
      .eq("channel_id", channelId);
    keyIndex.val++;
    return { videosInserted: 0, youtubeTotal };
  }

  // Step 2: Page through the channel's uploads playlist (cheap: 1 unit/page, returns all uploads
  // in reverse-chronological order) until we collect enough non-Short videos.
  const videoRecordsById = new Map<string, any>();
  const videoSnippets = new Map<string, any>();
  const seenVideoIds = new Set<string>(existingVideoIds);
  let nextPageToken: string | null = null;
  let pagesFetched = 0;
  const maxPages = 25; // 25 pages × 50 = up to 1250 uploads inspected per invocation

  if (!uploadsPlaylistId) {
    console.error(`No uploads playlist id for channel ${channelId}`);
    keyIndex.val++;
    return { videosInserted: 0, youtubeTotal };
  }

  while (pagesFetched < maxPages && videoRecordsById.size < missingVideos) {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      key: currentKey.api_key,
    });
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const resp = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        await markKeyExhausted(supabase, currentKey.id);
        const replacements = await getAvailableApiKeys(supabase, 1);
        if (replacements.length > 0) {
          currentKey = replacements[0];
          quotaCache.set(currentKey.id, currentKey.quota_used_today);
          apiKeys.push(currentKey);
          continue;
        }
        throw new Error("All API keys exhausted");
      }
      console.error(`playlistItems failed for channel ${channelId}: ${body?.error?.message}`);
      break;
    }

    await incrementQuota(supabase, currentKey.id, 1, quotaCache);
    const playlistData = await resp.json();
    const pageVideoIds = (playlistData.items || [])
      .map((item: any) => item.contentDetails?.videoId)
      .filter((vid: string | undefined) => Boolean(vid) && !seenVideoIds.has(vid));

    nextPageToken = playlistData.nextPageToken || null;
    pagesFetched++;

    if (pageVideoIds.length === 0) {
      if (!nextPageToken) break;
      continue;
    }

    const detailParams = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: pageVideoIds.join(","),
      key: currentKey.api_key,
    });

    const detailResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
    if (!detailResp.ok) {
      if (!nextPageToken) break;
      continue;
    }

    await incrementQuota(supabase, currentKey.id, 1, quotaCache);
    const detailData = await detailResp.json();

    for (const video of (detailData.items || [])) {
      seenVideoIds.add(String(video.id));

      const snippet = video.snippet || {};
      const stats = video.statistics || {};
      const contentDetails = video.contentDetails || {};

      const duration = contentDetails.duration || "";
      const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const totalSeconds = durationMatch
        ? (parseInt(durationMatch[1] || "0") * 3600) + (parseInt(durationMatch[2] || "0") * 60) + parseInt(durationMatch[3] || "0")
        : 0;
      if (totalSeconds > 0 && totalSeconds < 60) continue;
      if ((snippet.title || "").toLowerCase().includes("#shorts")) continue;

      videoRecordsById.set(video.id, {
        video_id: video.id,
        keyword_id: null,
        channel_id: snippet.channelId || channelId,
        channel_name: snippet.channelTitle || "",
        title: snippet.title || "",
        description: snippet.description || "",
        thumbnail_url: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
        published_at: snippet.publishedAt || null,
        view_count: parseInt(stats.viewCount || "0"),
        like_count: parseInt(stats.likeCount || "0"),
        comment_count: parseInt(stats.commentCount || "0"),
      });
      videoSnippets.set(video.id, snippet);

      if (videoRecordsById.size >= missingVideos) break;
    }

    if (!nextPageToken) break;
  }

  const videoRecords = Array.from(videoRecordsById.values());
  if (videoRecords.length === 0) {
    keyIndex.val++;
    return { videosInserted: 0, youtubeTotal };
  }

  const { data: insertedVideos } = await supabase
    .from("videos")
    .upsert(videoRecords, { onConflict: "video_id" })
    .select("id, video_id");

  const videoIdMap = new Map<string, string>();
  if (insertedVideos) {
    for (const v of insertedVideos) videoIdMap.set(v.video_id, v.id);
  }

  const linkRecords: any[] = [];
  for (const [ytVideoId, snippet] of videoSnippets) {
    const internalId = videoIdMap.get(ytVideoId);
    if (!internalId) continue;
    for (const url of extractUrls(snippet.description || "")) {
      linkRecords.push({ video_id: internalId, original_url: url });
    }
  }
  if (linkRecords.length > 0) {
    for (let i = 0; i < linkRecords.length; i += 500) {
      await supabase.from("video_links").upsert(linkRecords.slice(i, i + 500), { onConflict: "video_id,original_url" });
    }
  }

  // Sync the channel's stored count with the actual videos table after upserts
  const { count: newTotal } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channelId);
  await supabase
    .from("channels")
    .update({ total_videos_fetched: newTotal ?? 0 })
    .eq("channel_id", channelId);

  keyIndex.val++;
  return { videosInserted: videoRecords.length, youtubeTotal };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth guard: require service role key or valid admin JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const tmpClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await tmpClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const userId = claims.claims.sub as string;
      const { data: hasAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: hasSuperAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!hasAdmin && !hasSuperAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    // Hard-cap per-invocation limit to stay under the 150s edge timeout.
    // Client loops calling this function until backfill completes.
    const limit = Math.min(Math.max(parseInteger(body.limit, 10) ?? 10, 1), 10);
    const videosPerChannel = body.videos_per_channel || 50;
    const minVideos = parseInteger(body.min_videos, null);
    const maxVideos = parseInteger(body.max_videos, null);
    const backfillUnder50 = body.backfill_under_50 === true;

    const needsVideoCountFilter = backfillUnder50 || minVideos !== null || maxVideos !== null;
    const selectionWindow = needsVideoCountFilter
      ? Math.min(Math.max(limit * 20, 200), 1000)
      : limit;

    // Avoid PostgREST integer parsing issues by fetching an ordered window and filtering counts in-memory.
    // Secondary sort by last_analyzed_at (nulls first) so backfill rotates through ALL underfilled channels
    // instead of repeatedly re-selecting the same leading subset of tied counts.
    const { data: rawChannels, error: chErr } = await supabase
      .from("channels")
      .select("channel_id, channel_name, total_videos_fetched, youtube_total_videos, last_analyzed_at")
      .order("total_videos_fetched", { ascending: needsVideoCountFilter })
      .order("last_analyzed_at", { ascending: true, nullsFirst: true })
      .order("channel_id", { ascending: true })
      .limit(selectionWindow);

    if (chErr) throw chErr;
    const channels = (rawChannels || [])
      .filter((channel: any) => {
        const fetched = Number(channel.total_videos_fetched ?? 0);
        const ytTotal = channel.youtube_total_videos == null
          ? null
          : Number(channel.youtube_total_videos);
        if (backfillUnder50) {
          if (fetched >= 50) return false;
          // Skip only when we trust the YouTube total: it must be >= what we've already fetched.
          // A stale/under-count (ytTotal < fetched) means the cached value is wrong — re-process.
          if (ytTotal !== null && ytTotal >= fetched && fetched >= ytTotal) return false;
        }
        if (minVideos !== null && fetched < minVideos) return false;
        if (maxVideos !== null && fetched > maxVideos) return false;
        return true;
      })
      .slice(0, limit);

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ message: "No channels found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKeys = await getAvailableApiKeys(supabase, 20);
    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: "No available API keys" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quotaCache = new Map<string, number>();
    for (const k of apiKeys) quotaCache.set(k.id, k.quota_used_today);

    const keyIndex = { val: 0 };
    let totalVideos = 0;
    let processedChannels = 0;
    const BATCH_SIZE = backfillUnder50 ? 5 : 10;
    const channelIds = channels.map((c: any) => c.channel_id);

    for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((channel: any) => processChannel(supabase, channel, apiKeys, keyIndex, quotaCache, videosPerChannel))
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          totalVideos += r.value.videosInserted;
          processedChannels++;
        } else {
          console.error("Channel processing failed:", r.reason);
        }
      }
    }

    // Fire-and-forget downstream processing
    const triggerHeaders = {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    fetch(`${supabaseUrl}/functions/v1/process-video-links`, {
      method: "POST", headers: triggerHeaders,
    }).catch(e => console.error("Failed to trigger process-video-links:", e));

    fetch(`${supabaseUrl}/functions/v1/compute-channel-stats`, {
      method: "POST", headers: triggerHeaders,
      body: JSON.stringify({ channel_ids: channelIds }),
    }).catch(e => console.error("Failed to trigger compute-channel-stats:", e));

    fetch(`${supabaseUrl}/functions/v1/scrape-instagram-profiles`, {
      method: "POST", headers: triggerHeaders,
      body: JSON.stringify({ channel_ids: channelIds }),
    }).catch(e => console.error("Failed to trigger scrape-instagram-profiles:", e));

    fetch(`${supabaseUrl}/functions/v1/scrape-channel-links`, {
      method: "POST", headers: triggerHeaders,
      body: JSON.stringify({ channel_ids: channelIds }),
    }).catch(e => console.error("Failed to trigger scrape-channel-links:", e));

    return new Response(JSON.stringify({
      success: true,
      channels_processed: processedChannels,
      total_videos_inserted: totalVideos,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-channel-videos error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
