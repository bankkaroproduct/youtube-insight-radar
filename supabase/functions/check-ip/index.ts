import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

function matchesCidr(ip: string, cidr: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(cidr)) return false;
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

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

    // Fetch all active whitelist entries
    const { data: entries } = await supabase
      .from("ip_whitelist")
      .select("ip_address")
      .eq("is_active", true);

    // If no active entries, allow all (opt-in feature)
    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ allowed: true, ip: clientIp, reason: "no_whitelist" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = clientIp !== "unknown" && entries.some((e) => matchesCidr(clientIp, e.ip_address));

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
