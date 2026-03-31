import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAGES = 3;

async function getNextApiKey(supabase: any) {
  const { data, error } = await supabase
    .from("youtube_api_keys")
    .select("id, api_key, quota_used_today, daily_quota_limit")
    .eq("is_active", true)
    .order("quota_used_today", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return null;
  if (data.quota_used_today >= data.daily_quota_limit) return null;
  return data;
}

async function markKeyExhausted(supabase: any, keyId: string) {
  await supabase.from("youtube_api_keys").update({
    is_active: false,
    last_test_status: "quota_exceeded",
    last_tested_at: new Date().toISOString(),
  }).eq("id", keyId);
}

async function incrementQuota(supabase: any, keyId: string, units: number) {
  const { data } = await supabase.from("youtube_api_keys").select("quota_used_today").eq("id", keyId).single();
  if (data) {
    await supabase.from("youtube_api_keys").update({
      quota_used_today: data.quota_used_today + units,
      last_used_at: new Date().toISOString(),
    }).eq("id", keyId);
  }
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

async function fetchChannelDetails(supabase: any, channelIds: string[], apiKeyData: any) {
  if (channelIds.length === 0) return;
  
  try {
    const params = new URLSearchParams({
      part: "snippet,statistics,brandingSettings,topicDetails",
      id: channelIds.join(","),
      key: apiKeyData.api_key,
    });

    const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
    if (!resp.ok) return;

    await incrementQuota(supabase, apiKeyData.id, 1);

    const data = await resp.json();
    for (const ch of (data.items || [])) {
      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const topicDetails = ch.topicDetails || {};

      const updateData: any = {
        subscriber_count: parseInt(stats.subscriberCount || "0"),
        description: snippet.description || null,
      };

      // Extract YouTube category from topicDetails.topicCategories
      const topicCategories = topicDetails.topicCategories || [];
      if (topicCategories.length > 0) {
        // topicCategories are Wikipedia URLs like "https://en.wikipedia.org/wiki/Entertainment"
        const categoryNames = topicCategories.map((url: string) => {
          const parts = url.split("/");
          return decodeURIComponent(parts[parts.length - 1]).replace(/_/g, " ");
        });
        updateData.youtube_category = categoryNames.join(", ");
      }

      // Try to extract contact email from description
      const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      const descEmails = (snippet.description || "").match(emailRegex);
      if (descEmails && descEmails.length > 0) {
        updateData.contact_email = descEmails[0];
      }

      // Extract Instagram URL from description
      const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/[^\s<>"')\]]+/gi;
      const igMatches = (snippet.description || "").match(igRegex);
      if (igMatches && igMatches.length > 0) {
        updateData.instagram_url = igMatches[0];
      }

      // Extract country from snippet
      if (snippet.country) {
        updateData.country = snippet.country;
      }

      await supabase.from("channels").update(updateData).eq("channel_id", ch.id);
    }
  } catch (e) {
    console.error("Failed to fetch channel details:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: pendingJobs, error: fetchError } = await supabase
      .from("fetch_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (fetchError) throw fetchError;
    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allChannelIds = new Set<string>();

    for (const job of pendingJobs) {
      await supabase.from("fetch_jobs").update({
        status: "processing",
        started_at: new Date().toISOString(),
      }).eq("id", job.id);

      try {
        const apiKey = await getNextApiKey(supabase);
        if (!apiKey) {
          await supabase.from("fetch_jobs").update({
            status: "failed",
            error_message: "No available API keys with remaining quota",
            completed_at: new Date().toISOString(),
          }).eq("id", job.id);
          continue;
        }

        let allVideoIds: string[] = [];
        // Map videoId -> search rank (1-indexed position across all pages)
        const videoRankMap = new Map<string, number>();
        let nextPageToken: string | null = null;
        let globalIndex = 0;

        // Paginate up to MAX_PAGES pages
        for (let page = 0; page < MAX_PAGES; page++) {
          const params = new URLSearchParams({
            part: "snippet",
            q: job.keyword,
            maxResults: "50",
            order: job.order_by || "relevance",
            type: "video",
            key: apiKey.api_key,
          });
          if (job.published_after) params.set("publishedAfter", job.published_after);
          if (nextPageToken) params.set("pageToken", nextPageToken);

          const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);

          if (!resp.ok) {
            const body = await resp.json();
            const reason = body?.error?.errors?.[0]?.reason;
            if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
              await markKeyExhausted(supabase, apiKey.id);
              if (page === 0) {
                await supabase.from("fetch_jobs").update({ status: "pending", started_at: null }).eq("id", job.id);
              }
              break;
            }
            throw new Error(body?.error?.message || `YouTube API error: ${resp.status}`);
          }

          await incrementQuota(supabase, apiKey.id, 100);

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
          continue;
        }

        // Step 2: Get video details (in chunks of 50)
        for (let i = 0; i < allVideoIds.length; i += 50) {
          const chunk = allVideoIds.slice(i, i + 50);
          const detailKey = await getNextApiKey(supabase);
          const activeKey = detailKey || apiKey;

          const detailParams = new URLSearchParams({
            part: "snippet,statistics",
            id: chunk.join(","),
            key: activeKey.api_key,
          });

          const detailResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
          if (detailResp.ok) {
            await incrementQuota(supabase, activeKey.id, 1);
            const detailData = await detailResp.json();

            for (const video of (detailData.items || [])) {
              const snippet = video.snippet || {};
              const stats = video.statistics || {};

              if (snippet.channelId) allChannelIds.add(snippet.channelId);

              const { data: insertedVideo } = await supabase.from("videos").upsert({
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
              }, { onConflict: "video_id" }).select("id").single();

              if (insertedVideo) {
                if (job.keyword_id) {
                  const rank = videoRankMap.get(video.id) || null;
                  await supabase.from("video_keywords").upsert({
                    video_id: insertedVideo.id,
                    keyword_id: job.keyword_id,
                    search_rank: rank,
                  }, { onConflict: "video_id,keyword_id" });
                }

                const urls = extractUrls(snippet.description || "");
                if (urls.length > 0) {
                  for (const url of urls) {
                    await supabase.from("video_links").upsert({
                      video_id: insertedVideo.id,
                      original_url: url,
                    }, { onConflict: "video_id,original_url" });
                  }
                }
              }

              await supabase.from("channels").upsert({
                channel_id: snippet.channelId || "",
                channel_name: snippet.channelTitle || "",
                channel_url: `https://www.youtube.com/channel/${snippet.channelId}`,
              }, { onConflict: "channel_id" });
            }
          }
        }

        await supabase.from("fetch_jobs").update({
          status: "completed",
          videos_found: allVideoIds.length,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);

        if (job.keyword_id) {
          await supabase.from("keywords_search_runs").update({
            status: "completed",
            run_date: new Date().toISOString().split("T")[0],
          }).eq("id", job.keyword_id);
        }
      } catch (jobError) {
        await supabase.from("fetch_jobs").update({
          status: "failed",
          error_message: jobError.message,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);

        if (job.keyword_id) {
          await supabase.from("keywords_search_runs").update({ status: "failed" }).eq("id", job.keyword_id);
        }
      }
    }

    // After all jobs, fetch channel details for newly discovered channels
    if (allChannelIds.size > 0) {
      const channelKey = await getNextApiKey(supabase);
      if (channelKey) {
        const ids = [...allChannelIds];
        for (let i = 0; i < ids.length; i += 50) {
          await fetchChannelDetails(supabase, ids.slice(i, i + 50), channelKey);
        }
      }
    }

    // Auto-trigger process-video-links
    try {
      const fnUrl = `${supabaseUrl}/functions/v1/process-video-links`;
      await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      console.error("Failed to trigger process-video-links:", e);
    }

    // Auto-trigger compute-channel-stats for all discovered channels
    try {
      const fnUrl = `${supabaseUrl}/functions/v1/compute-channel-stats`;
      await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel_ids: [...allChannelIds] }),
      });
    } catch (e) {
      console.error("Failed to trigger compute-channel-stats:", e);
    }

    // Auto-trigger analyze-keyword-priority for keywords without priority
    try {
      const keywordIds = [...new Set(pendingJobs.map(j => j.keyword_id).filter(Boolean))];
      if (keywordIds.length > 0) {
        const { data: unprioritized } = await supabase
          .from("keywords_search_runs")
          .select("id, keyword")
          .in("id", keywordIds)
          .is("priority", null);

        if (unprioritized && unprioritized.length > 0) {
          const fnUrl = `${supabaseUrl}/functions/v1/analyze-keyword-priority`;
          await fetch(fnUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ keywords: unprioritized }),
          });
        }
      }
    } catch (e) {
      console.error("Failed to trigger analyze-keyword-priority:", e);
    }

    // Auto-trigger analyze-channel-relevance for new channels
    if (allChannelIds.size > 0) {
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/analyze-channel-relevance`;
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel_ids: [...allChannelIds] }),
        });
      } catch (e) {
        console.error("Failed to trigger analyze-channel-relevance:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: pendingJobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
