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
    const encryptionSecret = Deno.env.get("API_KEY_ENCRYPTION_KEY");
    if (!encryptionSecret) throw new Error("API_KEY_ENCRYPTION_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuper) throw new Error("Admin access required");

    const { keys, label_prefix, existing_count } = await req.json();
    if (!Array.isArray(keys) || keys.length === 0) throw new Error("keys array required");

    const inserted: { id: string; api_key_last_4: string }[] = [];
    for (let i = 0; i < keys.length; i++) {
      const raw = String(keys[i]).trim();
      if (!raw) continue;
      const { data, error } = await supabase.rpc("insert_encrypted_api_key", {
        _raw_key: raw,
        _label: `${label_prefix || "Key"} #${(existing_count ?? 0) + i + 1}`,
        _secret: encryptionSecret,
      });
      if (error) throw error;
      inserted.push({ id: data as string, api_key_last_4: raw.slice(-4) });
    }

    return new Response(JSON.stringify({ inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
