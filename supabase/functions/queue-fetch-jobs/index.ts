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

    const inserts = jobs.map((j) => ({
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

    return new Response(JSON.stringify({ success: true, queued: inserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
