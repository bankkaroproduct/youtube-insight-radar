import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  // Read current, then update
  const { data } = await supabase.from("youtube_api_keys").select("quota_used_today").eq("id", keyId).single();
  if (data) {
    await supabase.from("youtube_api_keys").update({
      quota_used_today: data.quota_used_today + units,
      last_used_at: new Date().toISOString(),
    }).eq("id", keyId);
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

        const params = new URLSearchParams({
          part: "snippet",
          q: job.keyword,
          maxResults: "50",
          order: job.order_by || "relevance",
          type: "video",
          key: apiKey.api_key,
        });
        if (job.published_after) params.set("publishedAfter", job.published_after);

        const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
        
        if (!resp.ok) {
          const body = await resp.json();
          const reason = body?.error?.errors?.[0]?.reason;
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
            await markKeyExhausted(supabase, apiKey.id);
            // Retry with next key by re-queuing
            await supabase.from("fetch_jobs").update({
              status: "pending",
              started_at: null,
            }).eq("id", job.id);
            continue;
          }
          throw new Error(body?.error?.message || `YouTube API error: ${resp.status}`);
        }

        // search.list costs 100 units
        await incrementQuota(supabase, apiKey.id, 100);

        const data = await resp.json();
        const videosFound = data.items?.length || 0;

        await supabase.from("fetch_jobs").update({
          status: "completed",
          videos_found: videosFound,
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
