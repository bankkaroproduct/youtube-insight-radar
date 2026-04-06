import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_KEYWORDS_PER_JOB = 5;
const MAX_CONCURRENT_JOBS = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    // Check admin role
    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: hasSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!hasAdmin && !hasSuperAdmin) throw new Error("Admin access required");

    const body = await req.json();

    // Kill all action
    if (body.action === "kill-all") {
      await supabase
        .from("fetch_jobs")
        .update({ status: "failed", error_message: "Cancelled by user", completed_at: new Date().toISOString() })
        .in("status", ["pending", "processing"]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Per-user concurrency limit
    const { data: runningJobs } = await supabase
      .from("fetch_jobs")
      .select("id")
      .in("status", ["pending", "processing"]);

    // Count jobs that belong to this user (fetch_jobs doesn't have user_id, so we limit globally)
    if (runningJobs && runningJobs.length >= MAX_CONCURRENT_JOBS * 5) {
      return new Response(
        JSON.stringify({ error: `Too many jobs in queue (${runningJobs.length}). Wait for current jobs to finish.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check YouTube API quota before accepting jobs
    const { data: ytQuota } = await supabase
      .from("rate_limits")
      .select("requests_today, quota_limit, last_reset")
      .eq("key", "youtube_api")
      .single();

    if (ytQuota) {
      // Auto-reset if last_reset is not today
      const lastReset = new Date(ytQuota.last_reset);
      const now = new Date();
      if (lastReset.toDateString() !== now.toDateString()) {
        await supabase.from("rate_limits").update({ requests_today: 0, last_reset: now.toISOString() }).eq("key", "youtube_api");
        ytQuota.requests_today = 0;
      }
      if (ytQuota.requests_today >= ytQuota.quota_limit) {
        return new Response(
          JSON.stringify({ error: "YouTube API quota exhausted for today. Resets at midnight." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Queue jobs
    const jobs = body.jobs as Array<{
      keyword: string;
      keyword_id: string;
      category: string;
      businessAim: string;
      orderBy: string;
      publishedAfter?: string;
    }>;

    if (!jobs || jobs.length === 0) throw new Error("No jobs provided");

    // Enforce max keywords per submission
    if (jobs.length > MAX_KEYWORDS_PER_JOB * 10) {
      return new Response(
        JSON.stringify({ error: `Too many keywords (${jobs.length}). Maximum 50 per submission.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check keyword cache - skip keywords fetched in last 24 hours
    const keywordTexts = jobs.map(j => j.keyword.toLowerCase().trim());
    const { data: cachedKeywords } = await supabase
      .from("keyword_cache")
      .select("keyword")
      .in("keyword", keywordTexts)
      .gte("fetched_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const cachedSet = new Set((cachedKeywords || []).map((c: any) => c.keyword));
    const freshJobs = jobs.filter(j => !cachedSet.has(j.keyword.toLowerCase().trim()));
    const skippedCount = jobs.length - freshJobs.length;

    if (freshJobs.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        queued: 0, 
        skipped: skippedCount,
        message: `All ${skippedCount} keyword(s) were already fetched in the last 24 hours.`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Split into batches of MAX_KEYWORDS_PER_JOB for queuing
    const inserts = freshJobs.map((j) => ({
      keyword_id: j.keyword_id,
      keyword: j.keyword,
      status: "pending",
      order_by: j.orderBy || "relevance",
      published_after: j.publishedAfter || null,
    }));

    const { error: insertError } = await supabase.from("fetch_jobs").insert(inserts);
    if (insertError) throw insertError;

    // Trigger processing of queued jobs
    try {
      await fetch(`${supabaseUrl}/functions/v1/process-fetch-queue`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
    } catch (_) {
      // Non-critical: jobs will be picked up on next invocation
    }

    const splitCount = Math.ceil(freshJobs.length / MAX_KEYWORDS_PER_JOB);
    return new Response(JSON.stringify({ 
      success: true, 
      queued: freshJobs.length, 
      skipped: skippedCount,
      batches: splitCount,
      message: skippedCount > 0 
        ? `Queued ${freshJobs.length} keyword(s), skipped ${skippedCount} (recently fetched).${splitCount > 1 ? ` Split into ${splitCount} batches.` : ''}`
        : `Queued ${freshJobs.length} keyword(s).${splitCount > 1 ? ` Split into ${splitCount} batches.` : ''}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
