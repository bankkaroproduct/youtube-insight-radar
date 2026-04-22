// Use built-in Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_KEYS_PER_REQUEST = 25;
const GOOGLE_FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = GOOGLE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
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
    if (key_ids.length > MAX_KEYS_PER_REQUEST) {
      throw new Error(`Too many keys in one request. Max ${MAX_KEYS_PER_REQUEST}.`);
    }

    const encryptionSecret = Deno.env.get("API_KEY_ENCRYPTION_KEY");
    if (!encryptionSecret) throw new Error("API_KEY_ENCRYPTION_KEY not configured");

    const { data: keys, error } = await supabase
      .from("youtube_api_keys")
      .select("id")
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
        const { data: rawKey, error: decErr } = await supabase.rpc("get_decrypted_api_key", {
          _key_id: key.id, _secret: encryptionSecret,
        });
        if (decErr || !rawKey) { status = "invalid"; throw new Error("decrypt failed"); }
        // videos.list costs 1 unit (vs search.list = 100)
        const url = `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${rawKey}`;
        const resp = await fetchWithTimeout(url);

        if (resp.ok) {
          status = "valid";
        } else {
          const body = await resp.json();
          const reason = body?.error?.errors?.[0]?.reason;
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
            status = "quota_exceeded";
          } else if (reason === "ipRefererBlocked") {
            status = "restricted";
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
      // Successful API call (valid or restricted-but-responded) consumed 1 unit.
      if (status === "valid" || status === "restricted") {
        const { data: current, error: currentError } = await supabase
          .from("youtube_api_keys")
          .select("quota_used_today")
          .eq("id", key.id)
          .single();
        if (currentError) throw currentError;
        updatePayload.quota_used_today = (current?.quota_used_today ?? 0) + 1;
      }
      const { error: updateError } = await supabase.from("youtube_api_keys").update(updatePayload).eq("id", key.id);
      if (updateError) throw updateError;

      results.push({ id: key.id, status });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message === "Forbidden: admin only" ? 403 : message === "Unauthorized" ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
