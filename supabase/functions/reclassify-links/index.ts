import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");

    if (token !== serviceKey) {
      const tmpClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await tmpClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const userId = claims.claims.sub as string;
      const { data: hasAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: hasSuper } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!hasAdmin && !hasSuper) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const pattern_id = body?.pattern_id;
    if (!pattern_id) {
      return new Response(JSON.stringify({ error: "pattern_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: p } = await supabase.from("affiliate_patterns").select("*").eq("id", pattern_id).single();
    if (!p) {
      return new Response(JSON.stringify({ error: "Pattern not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: staleLinks } = await supabase
      .from("video_links")
      .select("id, video_id")
      .eq("matched_pattern_id", p.id)
      .neq("classification", p.classification)
      .limit(10000);

    if (!staleLinks?.length) {
      return new Response(JSON.stringify({ updated: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Bulk update in chunks
    const ids = staleLinks.map(l => l.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await supabase.from("video_links").update({ classification: p.classification }).in("id", chunk);
    }

    // Trigger compute-channel-stats with affected video_ids
    const videoIds = [...new Set(staleLinks.map(l => l.video_id))];
    try {
      await fetch(`${supabaseUrl}/functions/v1/compute-channel-stats`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: videoIds }),
      });
    } catch {}

    return new Response(JSON.stringify({ updated: staleLinks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
