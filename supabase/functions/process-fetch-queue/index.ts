import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Pick pending jobs
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
      // Mark as processing
      await supabase.from("fetch_jobs").update({
        status: "processing",
        started_at: new Date().toISOString(),
      }).eq("id", job.id);

      try {
        // Placeholder: YouTube API search would go here
        // For now, mark as completed with 0 videos
        await supabase.from("fetch_jobs").update({
          status: "completed",
          videos_found: 0,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);

        // Update keyword status
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
