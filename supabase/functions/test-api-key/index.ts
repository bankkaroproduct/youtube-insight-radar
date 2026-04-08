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

    // Verify admin — auth is REQUIRED
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: hasSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!hasAdmin && !hasSuperAdmin) throw new Error("Forbidden: admin only");

    const { key_ids } = await req.json();
    if (!key_ids || !Array.isArray(key_ids) || key_ids.length === 0) {
      throw new Error("key_ids array is required");
    }

    const { data: keys, error } = await supabase
      .from("youtube_api_keys")
      .select("id, api_key")
      .in("id", key_ids);

    if (error) throw error;
    if (!keys || keys.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const key of keys) {
      let status = "valid";
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${key.api_key}`;
        const resp = await fetch(url);

        if (resp.ok) {
          status = "valid";
        } else {
          const body = await resp.json();
          const reason = body?.error?.errors?.[0]?.reason;
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
            status = "quota_exceeded";
          } else if (resp.status === 400 || resp.status === 403) {
            status = "invalid";
          } else {
            status = "invalid";
          }
        }
      } catch {
        status = "invalid";
      }

      const updatePayload: Record<string, unknown> = {
        last_tested_at: new Date().toISOString(),
        last_test_status: status,
      };
      if (status === "invalid") {
        updatePayload.is_active = false;
      }
      await supabase.from("youtube_api_keys").update(updatePayload).eq("id", key.id);

      results.push({ id: key.id, status });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message === "Forbidden: admin only" ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
