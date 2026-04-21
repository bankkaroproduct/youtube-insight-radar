// Use built-in Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_KEYWORDS_PER_JOB = 5;
const MAX_CONCURRENT_JOBS = 2;

Deno.serve(async (req) => {
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

    // Per-key quota is enforced inside process-fetch-queue (see _shared/youtube-rotation.ts).

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

    // Check cache by (keyword, order_by, published_after). Freshness window 24h.
    const freshnessCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const normalizedJobs = jobs.map(j => ({
      ...j,
      _cacheKeyword: j.keyword.toLowerCase().trim(),
      _orderBy: j.orderBy || "relevance",
      _publishedAfter: j.publishedAfter || null,
    }));

    const keywordTexts = [...new Set(normalizedJobs.map(j => j._cacheKeyword))];
    const { data: cachedRows } = await supabase
      .from("keyword_cache")
      .select("keyword, order_by, published_after, video_ids, fetched_at")
      .in("keyword", keywordTexts)
      .gte("fetched_at", freshnessCutoff);

    const cacheLookup = new Map<string, any>();
    for (const r of cachedRows || []) {
      const key = `${r.keyword}|${r.order_by}|${r.published_after || "null"}`;
      cacheLookup.set(key, r);
    }

    const cachedJobs: typeof normalizedJobs = [];
    const freshJobs: typeof normalizedJobs = [];
    for (const j of normalizedJobs) {
      const key = `${j._cacheKeyword}|${j._orderBy}|${j._publishedAfter || "null"}`;
      const cached = cacheLookup.get(key);
      if (cached && Array.isArray(cached.video_ids) && cached.video_ids.length > 0) {
        cachedJobs.push(j);
      } else {
        freshJobs.push(j);
      }
    }

    // For cached jobs: tag existing videos with the new keyword_id, no YouTube call.
    let cachedTagged = 0;
    for (const j of cachedJobs) {
      if (!j.keyword_id) continue;
      const key = `${j._cacheKeyword}|${j._orderBy}|${j._publishedAfter || "null"}`;
      const cached = cacheLookup.get(key);
      const ytVideoIds: string[] = cached.video_ids;

      const { data: existingVideos } = await supabase
        .from("videos")
        .select("id, video_id")
        .in("video_id", ytVideoIds);

      if (existingVideos && existingVideos.length > 0) {
        // Preserve cached order as rank by sorting existingVideos by index in ytVideoIds.
        const orderIndex = new Map<string, number>();
        ytVideoIds.forEach((vid, idx) => orderIndex.set(vid, idx));
        const vkRows = existingVideos
          .map((v) => ({
            video_id: v.id,
            keyword_id: j.keyword_id,
            search_rank: (orderIndex.get(v.video_id) ?? 0) + 1,
          }));
        await supabase.from("video_keywords").upsert(vkRows, { onConflict: "video_id,keyword_id" });
        cachedTagged += vkRows.length;
      }

      await supabase.from("keywords_search_runs").update({
        status: "completed",
        run_date: new Date().toISOString().split("T")[0],
      }).eq("id", j.keyword_id);
    }

    const skippedCount = cachedJobs.length;

    if (freshJobs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        queued: 0,
        skipped: skippedCount,
        cached_tagged: cachedTagged,
        message: `All ${skippedCount} keyword(s) used cached results. Tagged ${cachedTagged} video-keyword mappings.`,
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
