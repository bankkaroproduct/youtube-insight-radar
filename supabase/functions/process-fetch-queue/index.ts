// Use built-in Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAvailableApiKeys,
  rotateKey,
  incrementQuota,
  fetchYouTubeWithRotation,
} from "../_shared/youtube-rotation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAGES = 2;
const MAX_VIDEOS_PER_KEYWORD = 30;
const MAX_PARALLEL_JOBS = 10;

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

async function fetchChannelDetails(supabase: any, channelIds: string[], apiKeyDataIn: any, quotaCache: Map<string, number>) {
  if (channelIds.length === 0) return;
  let apiKeyData = apiKeyDataIn;
  try {
    const buildChannelsUrl = (apiKey: string) => {
      const params = new URLSearchParams({
        part: "snippet,statistics,brandingSettings,topicDetails",
        id: channelIds.join(","),
        key: apiKey,
      });
      return `https://www.googleapis.com/youtube/v3/channels?${params}`;
    };

    const { resp, key: rotatedKey, exhausted } = await fetchYouTubeWithRotation(
      supabase, buildChannelsUrl, apiKeyData, quotaCache,
    );
    if (exhausted || !resp) return;
    apiKeyData = rotatedKey;

    await incrementQuota(supabase, apiKeyData.id, 1, quotaCache);

    const data = await resp.json();
    
    const updatePromises = (data.items || []).map((ch: any) => {
      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const topicDetails = ch.topicDetails || {};

      const updateData: any = {
        subscriber_count: parseInt(stats.subscriberCount || "0"),
        description: snippet.description || null,
      };

      const topicCategories = topicDetails.topicCategories || [];
      if (topicCategories.length > 0) {
        const categoryNames = topicCategories.map((url: string) => {
          const parts = url.split("/");
          return decodeURIComponent(parts[parts.length - 1]).replace(/_/g, " ");
        });
        updateData.youtube_category = categoryNames.join(", ");
      }

      const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      const descEmails = (snippet.description || "").match(emailRegex);
      if (descEmails && descEmails.length > 0) {
        updateData.contact_email = descEmails[0];
      }

      const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/[^\s<>"')\]]+/gi;
      const igMatches = (snippet.description || "").match(igRegex);
      if (igMatches && igMatches.length > 0) {
        updateData.instagram_url = igMatches[0];
      }

      if (snippet.country) {
        updateData.country = snippet.country;
      }

      return supabase.from("channels").update(updateData).eq("channel_id", ch.id);
    });

    await Promise.all(updatePromises);
  } catch (e) {
    console.error("Failed to fetch channel details:", e);
  }
}

async function processJob(supabase: any, job: any, apiKeyData: any, quotaCache: Map<string, number>) {
  await supabase.from("fetch_jobs").update({
    status: "processing",
    started_at: new Date().toISOString(),
  }).eq("id", job.id);

  const allChannelIds = new Set<string>();

  let allVideoIds: string[] = [];
  const videoRankMap = new Map<string, number>();
  let nextPageToken: string | null = null;
  let globalIndex = 0;
  let currentKey = apiKeyData;

  for (let page = 0; page < MAX_PAGES; page++) {
    const buildSearchUrl = (apiKey: string) => {
      const params = new URLSearchParams({
        part: "snippet",
        q: job.keyword,
        maxResults: "50",
        order: job.order_by || "relevance",
        type: "video",
        regionCode: "IN",
        key: apiKey,
      });
      // Filter shorts at the API level for relevance-ordered searches.
      // "medium" returns videos 4–20 minutes — excludes shorts AND very-long-form.
      // For non-relevance orders (e.g. "date"), users likely want all lengths,
      // so we skip this filter and rely on the JS-side <60s cutoff below.
      if ((job.order_by || "relevance") === "relevance") {
        params.set("videoDuration", "medium");
      }
      if (job.published_after) params.set("publishedAfter", job.published_after);
      if (nextPageToken) params.set("pageToken", nextPageToken);
      return `https://www.googleapis.com/youtube/v3/search?${params}`;
    };

    const { resp, key: rotatedKey, exhausted } = await fetchYouTubeWithRotation(
      supabase, buildSearchUrl, currentKey, quotaCache,
    );
    currentKey = rotatedKey;

    if (exhausted || !resp) {
      if (page === 0) {
        const { data: jobRow } = await supabase
          .from("fetch_jobs")
          .select("attempt_count, max_attempts")
          .eq("id", job.id)
          .single();
        const nextAttempt = (jobRow?.attempt_count ?? 0) + 1;
        const maxAttempts = jobRow?.max_attempts ?? 3;
        const newStatus = nextAttempt >= maxAttempts ? "dead_letter" : "pending";
        await supabase.from("fetch_jobs").update({
          status: newStatus,
          started_at: null,
          attempt_count: nextAttempt,
          last_failure_reason: "All API keys exhausted or unavailable",
          ...(newStatus === "dead_letter" ? { completed_at: new Date().toISOString() } : {}),
        }).eq("id", job.id);
        return { channelIds: [], keyUsed: currentKey };
      }
      break;
    }

    await incrementQuota(supabase, currentKey.id, 100, quotaCache);

    const searchData = await resp.json();
    const items = (searchData.items || []).filter((item: any) => item.id?.videoId);

    for (const item of items) {
      globalIndex++;
      const vid = item.id.videoId;
      if (!videoRankMap.has(vid)) {
        videoRankMap.set(vid, globalIndex);
        allVideoIds.push(vid);
      }
    }

    nextPageToken = searchData.nextPageToken || null;
    if (!nextPageToken) break;
  }

  if (allVideoIds.length === 0) {
    await supabase.from("fetch_jobs").update({
      status: "completed",
      videos_found: 0,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    // Cache the keyword even with 0 results
    await supabase.from("keyword_cache").upsert({
      keyword: job.keyword.toLowerCase().trim(),
      order_by: job.order_by || "relevance",
      published_after: job.published_after || null,
      fetched_at: new Date().toISOString(),
      video_ids: [],
      videos_found: 0,
    }, { onConflict: "keyword,order_by,published_after" });
    return { channelIds: [], keyUsed: currentKey };
  }

  // Get video details
  const videoRecords: any[] = [];
  const channelRecordsMap = new Map<string, any>();
  const videoSnippets = new Map<string, any>();

  const detailChunks: string[][] = [];
  for (let i = 0; i < allVideoIds.length; i += 50) {
    detailChunks.push(allVideoIds.slice(i, i + 50));
  }

  const chunkResults: any[][] = [];
  for (const chunk of detailChunks) {
    const buildDetailUrl = (apiKey: string) => {
      const detailParams = new URLSearchParams({
        part: "snippet,statistics,contentDetails",
        id: chunk.join(","),
        key: apiKey,
      });
      return `https://www.googleapis.com/youtube/v3/videos?${detailParams}`;
    };

    const { resp: detailResp, key: rotatedKey, exhausted } = await fetchYouTubeWithRotation(
      supabase, buildDetailUrl, currentKey, quotaCache,
    );
    currentKey = rotatedKey;
    if (exhausted || !detailResp) { chunkResults.push([]); continue; }
    await incrementQuota(supabase, currentKey.id, 1, quotaCache);
    const detailData = await detailResp.json();
    chunkResults.push(detailData.items || []);
  }

  for (const items of chunkResults) {
    for (const video of items) {
      if (videoRecords.length >= MAX_VIDEOS_PER_KEYWORD) break;

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

      if (snippet.channelId) allChannelIds.add(snippet.channelId);

      videoRecords.push({
        video_id: video.id,
        keyword_id: job.keyword_id || null,
        channel_id: snippet.channelId || "",
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

      if (snippet.channelId && !channelRecordsMap.has(snippet.channelId)) {
        channelRecordsMap.set(snippet.channelId, {
          channel_id: snippet.channelId,
          channel_name: snippet.channelTitle || "",
          channel_url: `https://www.youtube.com/channel/${snippet.channelId}`,
        });
      }
    }
  }

  // Batch upserts
  const { data: insertedVideos } = await supabase
    .from("videos")
    .upsert(videoRecords, { onConflict: "video_id" })
    .select("id, video_id");

  const videoIdMap = new Map<string, string>();
  if (insertedVideos) {
    for (const v of insertedVideos) videoIdMap.set(v.video_id, v.id);
  }

  if (job.keyword_id && videoIdMap.size > 0) {
    const keywordRecords = [...videoIdMap.entries()].map(([ytId, intId]) => ({
      video_id: intId,
      keyword_id: job.keyword_id,
      search_rank: videoRankMap.get(ytId) || null,
    }));
    if (keywordRecords.length > 0) {
      await supabase.from("video_keywords").upsert(keywordRecords, { onConflict: "video_id,keyword_id" });
    }
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

  const channelRecords = [...channelRecordsMap.values()];
  if (channelRecords.length > 0) {
    await supabase.from("channels").upsert(channelRecords, { onConflict: "channel_id" });
  }

  await supabase.from("fetch_jobs").update({
    status: "completed",
    videos_found: videoRecords.length,
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);

  if (job.keyword_id) {
    await supabase.from("keywords_search_runs").update({
      status: "completed",
      run_date: new Date().toISOString().split("T")[0],
    }).eq("id", job.keyword_id);
  }

  // Cache the keyword
  await supabase.from("keyword_cache").upsert({
    keyword: job.keyword.toLowerCase().trim(),
    order_by: job.order_by || "relevance",
    published_after: job.published_after || null,
    fetched_at: new Date().toISOString(),
    video_ids: allVideoIds.slice(0, 100),
    videos_found: videoRecords.length,
  }, { onConflict: "keyword,order_by,published_after" });

  return { channelIds: [...allChannelIds], keyUsed: currentKey };
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
    const isServiceRole = token === serviceKey;
    if (!isServiceRole) {
      const tmpClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await tmpClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub as string;
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: hasAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: hasSuperAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!hasAdmin && !hasSuperAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Per-key quota is the sole source of truth (see _shared/youtube-rotation.ts).

    const { data: pendingJobs, error: fetchError } = await supabase
      .from("fetch_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_PARALLEL_JOBS);

    if (fetchError) throw fetchError;
    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const availableKeys = await getAvailableApiKeys(supabase, Math.min(pendingJobs.length, MAX_PARALLEL_JOBS));
    if (availableKeys.length === 0) {
      return new Response(JSON.stringify({ error: "No available API keys with remaining quota" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quotaCache = new Map<string, number>();
    for (const k of availableKeys) {
      quotaCache.set(k.id, k.quota_used_today);
    }

    const allChannelIds = new Set<string>();

    // Process jobs sequentially to prevent quota race conditions
    const results: { success: boolean; jobId: string }[] = [];
    for (const job of pendingJobs) {
      const key = availableKeys[results.length % availableKeys.length];
      try {
        const result = await processJob(supabase, job, key, quotaCache);
        for (const chId of result.channelIds) allChannelIds.add(chId);
        results.push({ success: true, jobId: job.id });
      } catch (err: any) {
        console.error(`Job ${job.id} failed:`, err.message);
        await supabase.from("fetch_jobs").update({
          status: "failed",
          error_message: err.message,
          last_failure_reason: err.message,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
        if (job.keyword_id) {
          await supabase.from("keywords_search_runs").update({ status: "failed" }).eq("id", job.keyword_id);
        }
        results.push({ success: false, jobId: job.id });
      }
    }

    // Fetch channel details with first available key
    if (allChannelIds.size > 0) {
      const channelKey = availableKeys[0];
      const ids = [...allChannelIds];
      const chunkPromises = [];
      for (let i = 0; i < ids.length; i += 50) {
        chunkPromises.push(fetchChannelDetails(supabase, ids.slice(i, i + 50), channelKey, quotaCache));
      }
      await Promise.all(chunkPromises);
    }

    // Fire-and-forget downstream
    const triggerHeaders = {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    fetch(`${supabaseUrl}/functions/v1/process-video-links`, {
      method: "POST", headers: triggerHeaders,
    }).catch(e => console.error("Failed to trigger process-video-links:", e));

    if (allChannelIds.size > 0) {
      fetch(`${supabaseUrl}/functions/v1/compute-channel-stats`, {
        method: "POST", headers: triggerHeaders,
        body: JSON.stringify({ channel_ids: [...allChannelIds] }),
      }).catch(e => console.error("Failed to trigger compute-channel-stats:", e));
    }

    const keywordIds = [...new Set(pendingJobs.map((j: any) => j.keyword_id).filter(Boolean))];
    if (keywordIds.length > 0) {
      supabase
        .from("keywords_search_runs")
        .select("id, keyword")
        .in("id", keywordIds)
        .is("priority", null)
        .then(({ data: unprioritized }: any) => {
          if (unprioritized && unprioritized.length > 0) {
            fetch(`${supabaseUrl}/functions/v1/analyze-keyword-priority`, {
              method: "POST", headers: triggerHeaders,
              body: JSON.stringify({ keywords: unprioritized }),
            }).catch(e => console.error("Failed to trigger analyze-keyword-priority:", e));
          }
        });
    }

    if (allChannelIds.size > 0) {
      fetch(`${supabaseUrl}/functions/v1/analyze-channel-relevance`, {
        method: "POST", headers: triggerHeaders,
        body: JSON.stringify({ channel_ids: [...allChannelIds] }),
      }).catch(e => console.error("Failed to trigger analyze-channel-relevance:", e));
    }

    // Self-re-trigger if more pending jobs remain
    const { count: remainingCount } = await supabase
      .from("fetch_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (remainingCount && remainingCount > 0) {
      fetch(`${supabaseUrl}/functions/v1/process-fetch-queue`, {
        method: "POST",
        headers: triggerHeaders,
        body: JSON.stringify({}),
      }).catch(e => console.error("Failed to self-re-trigger:", e));
    }

    const succeeded = results.filter(r => r.success).length;
    return new Response(JSON.stringify({ success: true, processed: pendingJobs.length, succeeded, parallel_keys: availableKeys.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
