// Shared YouTube API key rotation utilities.
// Single source of truth for per-key quota tracking, rotation, and retry.

export async function getAvailableApiKeys(supabase: any, count: number) {
  // Self-healing: reset quotas if they're stale (pg_cron may not be running).
  try {
    await supabase.rpc("reset_daily_quotas_if_stale");
  } catch (e) {
    console.error("[getAvailableApiKeys] reset_daily_quotas_if_stale failed:", e);
  }

  const { data, error } = await supabase
    .from("youtube_api_keys")
    .select("id, api_key_last_4, quota_used_today, daily_quota_limit")
    .eq("is_active", true)
    .or("last_test_status.is.null,last_test_status.neq.restricted")
    .order("quota_used_today", { ascending: true })
    .limit(count);
  if (error || !data) return [];
  return data;
}

// Rotate the current key. Marks status, optionally deactivates, and returns next available key (or null).
export async function rotateKey(
  supabase: any,
  currentKey: any,
  reason: string,
  quotaCache: Map<string, number>,
): Promise<any | null> {
  const deactivate = reason === "invalid" || reason === "quota_exceeded";
  console.log(`[rotateKey] Rotating key ${currentKey?.id} reason=${reason} deactivate=${deactivate}`);
  try {
    await supabase.from("youtube_api_keys").update({
      last_test_status: reason,
      last_tested_at: new Date().toISOString(),
      ...(deactivate ? { is_active: false } : {}),
    }).eq("id", currentKey.id);
  } catch (e) {
    console.error("[rotateKey] Failed to mark key:", e);
  }

  const replacements = await getAvailableApiKeys(supabase, 5);
  const next = replacements.find((k: any) => k.id !== currentKey.id);
  if (!next) {
    console.log("[rotateKey] No replacement key available");
    return null;
  }
  quotaCache.set(next.id, next.quota_used_today);
  console.log(`[rotateKey] Rotated to key ${next.id}`);
  return next;
}

export async function incrementQuota(
  supabase: any,
  keyId: string,
  units: number,
  quotaCache: Map<string, number>,
) {
  let current = quotaCache.get(keyId);
  if (current === undefined) {
    // Read-before-write: seed cache from DB so we don't reset quota_used_today to `units`.
    const { data } = await supabase
      .from("youtube_api_keys")
      .select("quota_used_today")
      .eq("id", keyId)
      .single();
    current = data?.quota_used_today ?? 0;
  }
  const newVal = (current as number) + units;
  quotaCache.set(keyId, newVal);
  await supabase.from("youtube_api_keys").update({
    quota_used_today: newVal,
    last_used_at: new Date().toISOString(),
  }).eq("id", keyId);
}

// Lazy decryption cache: keyId -> raw API key. Lives for the lifetime of the
// edge function instance, so we don't re-decrypt on every page.
const rawKeyCache = new Map<string, string>();

export async function getRawApiKey(supabase: any, keyId: string): Promise<string | null> {
  const cached = rawKeyCache.get(keyId);
  if (cached) return cached;
  const secret = Deno.env.get("API_KEY_ENCRYPTION_KEY");
  if (!secret) {
    console.error("[getRawApiKey] API_KEY_ENCRYPTION_KEY not set");
    return null;
  }
  const { data, error } = await supabase.rpc("get_decrypted_api_key", { _key_id: keyId, _secret: secret });
  if (error || !data) {
    console.error(`[getRawApiKey] decrypt failed for ${keyId}:`, error);
    return null;
  }
  const raw = String(data);
  rawKeyCache.set(keyId, raw);
  return raw;
}

// Wrapper: call YouTube API with rotation + retry on transient errors.
export async function fetchYouTubeWithRotation(
  supabase: any,
  url: (apiKey: string) => string,
  currentKey: any,
  quotaCache: Map<string, number>,
): Promise<{ resp: Response | null; key: any; exhausted: boolean }> {
  let key = currentKey;
  let attempt = 0;
  const backoffs = [500, 1500];

  while (true) {
    const rawKey = await getRawApiKey(supabase, key.id);
    if (!rawKey) {
      const next = await rotateKey(supabase, key, "invalid", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    let resp: Response;
    try {
      resp = await fetch(url(rawKey));
    } catch (netErr) {
      console.error(`[fetchYouTubeWithRotation] Network error on key ${key.id}:`, netErr);
      if (attempt < backoffs.length) {
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
        attempt++;
        continue;
      }
      const next = await rotateKey(supabase, key, "invalid", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    if (resp.ok) return { resp, key, exhausted: false };

    let body: any = {};
    try { body = await resp.clone().json(); } catch (_) { /* ignore */ }
    const reason = body?.error?.errors?.[0]?.reason;
    const message = body?.error?.message || "";

    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      const next = await rotateKey(supabase, key, "quota_exceeded", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    if (reason === "keyInvalid" || reason === "API_KEY_INVALID" ||
        (reason === "badRequest" && /api key/i.test(message))) {
      const next = await rotateKey(supabase, key, "invalid", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    if (reason === "ipRefererBlocked") {
      const next = await rotateKey(supabase, key, "restricted", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    if (resp.status >= 500) {
      if (attempt < backoffs.length) {
        console.log(`[fetchYouTubeWithRotation] ${resp.status} on key ${key.id}, retrying after ${backoffs[attempt]}ms`);
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
        attempt++;
        continue;
      }
      const next = await rotateKey(supabase, key, "invalid", quotaCache);
      if (!next) return { resp: null, key, exhausted: true };
      key = next;
      attempt = 0;
      continue;
    }

    throw new Error(message || `YouTube API error: ${resp.status}`);
  }
}
