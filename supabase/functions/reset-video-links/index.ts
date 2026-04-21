import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuper) throw new Error("Admin access required");

    const { before_id } = await req.json().catch(() => ({}));
    const CHUNK = 2000;

    // Refuse to reset if link processing is mid-batch (only on the first chunk).
    if (!before_id) {
      const recentCutoff = new Date(Date.now() - 30_000).toISOString();
      const { count: recentlyUpdated } = await supabase
        .from("video_links")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", recentCutoff);
      if ((recentlyUpdated ?? 0) > 0) {
        return new Response(JSON.stringify({
          error: "Links were updated in the last 30s. Wait for processing to stop before resetting.",
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let idQuery = supabase.from("video_links").select("id").order("id", { ascending: true }).limit(CHUNK);
    if (before_id) idQuery = idQuery.gt("id", before_id);
    const { data: idRows, error: idErr } = await idQuery;
    if (idErr) throw idErr;
    const ids = (idRows || []).map((r) => r.id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ done: true, processed: 0, next_before_id: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase.from("video_links").update({
      unshortened_url: null, domain: null, original_domain: null,
      classification: "NEUTRAL", matched_pattern_id: null, affiliate_platform_id: null,
      retailer_pattern_id: null, is_shortened: null, link_type: null,
      affiliate_platform: null, affiliate_domain: null,
      resolved_retailer: null, resolved_retailer_domain: null,
    }).in("id", ids);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({
      done: ids.length < CHUNK,
      processed: ids.length,
      next_before_id: ids[ids.length - 1],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
