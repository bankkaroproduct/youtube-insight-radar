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

async function processChannel(
  supabase: any,
  channelId: string,
  apiKeys: KeyData[],
  keyIndex: { val: number },
  quotaCache: Map<string, number>,
): Promise<{ videosInserted: number; youtubeTotal: number | null }> {
  let currentKey = apiKeys[keyIndex.val % apiKeys.length];

  // Search for latest 50 videos from this channel
  const allVideoIds: string[] = [];
  let nextPageToken: string | null = null;
  let youtubeTotal: number | null = null;

  for (let page = 0; page < 1; page++) {
    const params = new URLSearchParams({
      part: "snippet",
      channelId,
      maxResults: "50",
      order: "date",
      type: "video",
      key: currentKey.api_key,
    });
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);

    if (!resp.ok) {
      const body = await resp.json();
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        await markKeyExhausted(supabase, currentKey.id);
        const replacements = await getAvailableApiKeys(supabase, 1);
        if (replacements.length > 0) {
          currentKey = replacements[0];
          quotaCache.set(currentKey.id, currentKey.quota_used_today);
          // Update in the shared keys array
          apiKeys.push(currentKey);
          page--;
          continue;
        }
        throw new Error("All API keys exhausted");
      }
      console.error(`Search failed for channel ${channelId}: ${body?.error?.message}`);
      return { videosInserted: 0 };
    }

    await incrementQuota(supabase, currentKey.id, 100, quotaCache);
    const searchData = await resp.json();
    if (searchData.pageInfo?.totalResults != null && youtubeTotal === null) {
      youtubeTotal = searchData.pageInfo.totalResults;
    }
    const items = (searchData.items || []).filter((item: any) => item.id?.videoId);
    for (const item of items) {
      if (!allVideoIds.includes(item.id.videoId)) {
        allVideoIds.push(item.id.videoId);
      }
    }
    nextPageToken = searchData.nextPageToken || null;
    if (!nextPageToken) break;
  }

  if (allVideoIds.length === 0) {
    // Still save the youtube total even if no videos found
    if (youtubeTotal !== null) {
      await supabase.from("channels").update({ youtube_total_videos: youtubeTotal }).eq("channel_id", channelId);
    }
    return { videosInserted: 0, youtubeTotal };
  }

  // Fetch video details in chunks of 50
  const videoRecords: any[] = [];
  const videoSnippets = new Map<string, any>();

  for (let i = 0; i < allVideoIds.length; i += 50) {
    const chunk = allVideoIds.slice(i, i + 50);
    const detailParams = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
      key: currentKey.api_key,
    });

    const detailResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
    if (!detailResp.ok) continue;
    await incrementQuota(supabase, currentKey.id, 1, quotaCache);
    const detailData = await detailResp.json();

    for (const video of (detailData.items || [])) {
      const snippet = video.snippet || {};
      const stats = video.statistics || {};
      const contentDetails = video.contentDetails || {};

      // Filter shorts
      const duration = contentDetails.duration || "";
      const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const totalSeconds = durationMatch
        ? (parseInt(durationMatch[1] || "0") * 3600) + (parseInt(durationMatch[2] || "0") * 60) + parseInt(durationMatch[3] || "0")
        : 0;
      if (totalSeconds > 0 && totalSeconds < 60) continue;
      if ((snippet.title || "").toLowerCase().includes("#shorts")) continue;

      videoRecords.push({
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
    }
  }

  if (videoRecords.length === 0) return { videosInserted: 0, youtubeTotal };

  // Upsert videos
  const { data: insertedVideos } = await supabase
    .from("videos")
    .upsert(videoRecords, { onConflict: "video_id" })
    .select("id, video_id");

  const videoIdMap = new Map<string, string>();
  if (insertedVideos) {
    for (const v of insertedVideos) videoIdMap.set(v.video_id, v.id);
  }

  // Extract and upsert links
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

  // Save youtube_total_videos to the channel
  if (youtubeTotal !== null) {
    await supabase.from("channels").update({ youtube_total_videos: youtubeTotal }).eq("channel_id", channelId);
  }

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
    const limit = body.limit || 50;
    const videosPerChannel = body.videos_per_channel || 50;
    const minVideos = body.min_videos ?? null;
    const maxVideos = body.max_videos ?? null;
    const backfillUnder50 = body.backfill_under_50 === true;

    // Get channels, optionally filtered by total_videos_fetched range
    let query = supabase
      .from("channels")
      .select("channel_id, channel_name, total_videos_fetched, youtube_total_videos")
      .limit(limit);

    if (backfillUnder50) {
      // Channels under 50 videos fetched. If youtube_total_videos is known and <= fetched,
      // the YouTube API will simply return what's available (idempotent upsert).
      query = query
        .lt("total_videos_fetched", 50)
        .order("total_videos_fetched", { ascending: true });
    } else {
      query = query.order("total_videos_fetched", { ascending: false });
      if (minVideos !== null) query = query.gte("total_videos_fetched", minVideos);
      if (maxVideos !== null) query = query.lte("total_videos_fetched", maxVideos);
    }

    const { data: channels, error: chErr } = await query;

    if (chErr) throw chErr;
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
    const BATCH_SIZE = 5;
    const channelIds = channels.map((c: any) => c.channel_id);

    for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
      const batch = channelIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(chId => processChannel(supabase, chId, apiKeys, keyIndex, quotaCache))
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
