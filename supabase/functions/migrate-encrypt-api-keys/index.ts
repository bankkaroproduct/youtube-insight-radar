import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const secret = Deno.env.get("API_KEY_ENCRYPTION_KEY");
    if (!secret) throw new Error("API_KEY_ENCRYPTION_KEY missing");

    // Auth: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuper) throw new Error("Admin only");

    const { data: count, error } = await supabase.rpc("backfill_encrypt_api_keys", { _secret: secret });
    if (error) throw error;

    return new Response(JSON.stringify({ encrypted: count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
