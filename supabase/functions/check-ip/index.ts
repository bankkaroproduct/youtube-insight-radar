import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if whitelist has any active entries
    const { count } = await supabase
      .from("ip_whitelist")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // If no active entries, allow all (opt-in feature)
    if (!count || count === 0) {
      return new Response(
        JSON.stringify({ allowed: true, ip: clientIp, reason: "no_whitelist" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if IP is whitelisted
    const { data } = await supabase
      .from("ip_whitelist")
      .select("id")
      .eq("ip_address", clientIp)
      .eq("is_active", true)
      .limit(1);

    const allowed = (data?.length ?? 0) > 0;

    return new Response(
      JSON.stringify({ allowed, ip: clientIp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ allowed: false, ip: "unknown", error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
