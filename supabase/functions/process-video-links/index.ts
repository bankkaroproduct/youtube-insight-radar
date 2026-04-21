// Use built-in Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KNOWN_SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
  "buff.ly", "adf.ly", "bl.ink", "lnkd.in", "rb.gy", "cutt.ly",
  "shorturl.at", "link.ck.page", "clk.ink",
  "fkrt.it", "wsli.nk", "tiny.cc", "short.io", "amzn.to",
  "geni.us", "urlgeni.us", "bitli.in", "fktr.in", "fkrt.to",
  "amzlink.to", "amzn.eu", "linktw.in",
];

const AFFILIATE_REDIRECT_DOMAINS = [
  "wishlink.com", "lehlah.club", "haulpack.com",
  "earnkaro.com", "cuelinks.com", "magicpin.in",
  "openinapp.co", "shopmy.us", "geni.us",
];

const JS_REDIRECT_DOMAINS = [
  "wishlink.com", "lehlah.club", "instamojo.com", "link.springer.com",
  "haulpack.com", "earnkaro.com", "cuelinks.com", "magicpin.in",
];

function isJsRedirectDomain(domain: string): boolean {
  return JS_REDIRECT_DOMAINS.some(d => domain.includes(d));
}

// Per-domain extractors for JS redirects (Item 4)
const DOMAIN_EXTRACTORS: Record<string, (html: string) => string | null> = {
  "wishlink.com": (html) => {
    const m = html.match(/data-url=["']([^"']+)["']/) || html.match(/product[Uu]rl["']?\s*[:=]\s*["']([^"']+)["']/);
    return m?.[1] ?? null;
  },
  "earnkaro.com": (html) => {
    const m = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
    return m?.[1] ?? null;
  },
  "cuelinks.com": (html) => {
    const m = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
    return m?.[1] ?? null;
  },
};

function extractRedirectFromHtml(html: string, sourceDomain: string): string | null {
  // Try domain-specific extractor first
  for (const [d, extractor] of Object.entries(DOMAIN_EXTRACTORS)) {
    if (sourceDomain.includes(d)) {
      const result = extractor(html);
      if (result?.startsWith("http")) return result;
    }
  }

  const jsMatch = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
  if (jsMatch && jsMatch[1]?.startsWith("http")) return jsMatch[1];

  const metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'\s>]+)/i);
  if (metaMatch && metaMatch[1]?.startsWith("http")) return metaMatch[1];

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch && canonicalMatch[1]?.startsWith("http")) {
    const canonDomain = extractDomain(canonicalMatch[1]);
    if (canonDomain && !canonDomain.includes(sourceDomain) && !sourceDomain.includes(canonDomain)) {
      return canonicalMatch[1];
    }
  }

  const escapedDomain = sourceDomain.replace(/\./g, "\\.");
  const extLinkRegex = new RegExp(`<a[^>]+href=["'](https?:\\/\\/(?!(?:[^"']*${escapedDomain}))[^"']+)["']`, "i");
  const extMatch = html.match(extLinkRegex);
  if (extMatch && extMatch[1]?.startsWith("http")) return extMatch[1];

  return null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlPartial(url: string, timeoutMs = 8000): Promise<string> {
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkBot/1.0)" },
  }, timeoutMs);
  const reader = resp.body?.getReader();
  if (!reader) return "";
  let html = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (bytes < 20000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytes += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return html;
}

async function resolveJsRedirect(url: string): Promise<string> {
  try {
    const html = await fetchHtmlPartial(url, 8000);
    const domain = extractDomain(url);
    const extracted = extractRedirectFromHtml(html, domain);
    if (extracted) return extracted;
    return url;
  } catch {
    return url;
  }
}

const AFFILIATE_SHORT_DOMAINS: Record<string, string> = {
  "wsli.nk": "Wishlink",
  "fkrt.it": "Flipkart Affiliate",
  "amzn.to": "Amazon Associates",
  "geni.us": "Genius Link",
  "urlgeni.us": "Genius Link",
  "go.shopmy.us": "ShopMy",
  "shopmy.us": "ShopMy",
  "rstyle.me": "LTK (RewardStyle)",
  "howl.link": "Howl",
  "linktw.in": "LinkTwin",
  "amzlink.to": "Amazon Associates",
  "amzn.eu": "Amazon Associates",
  "fktr.in": "Flipkart Affiliate",
  "fkrt.to": "Flipkart Affiliate",
  "bitli.in": "Bitli",
};

const RETAILER_DOMAINS: Record<string, string> = {
  "amazon.in": "Amazon",
  "amazon.com": "Amazon",
  "flipkart.com": "Flipkart",
  "myntra.com": "Myntra",
  "ajio.com": "AJIO",
  "meesho.com": "Meesho",
  "nykaa.com": "Nykaa",
  "snapdeal.com": "Snapdeal",
  "tatacliq.com": "Tata CLiQ",
  "reliancedigital.in": "Reliance Digital",
  "croma.com": "Croma",
};

const SKIP_DOMAINS = new Set([
  "youtube.com", "youtu.be", "google.com", "facebook.com", "twitter.com",
  "instagram.com", "tiktok.com", "reddit.com", "linkedin.com", "pinterest.com",
  "wikipedia.org", "github.com", "discord.gg", "discord.com", "t.me",
  "telegram.org", "wa.me", "whatsapp.com", "apple.com", "play.google.com",
  "apps.apple.com", "medium.com", "blogspot.com", "wordpress.com",
  "mobile.twitter.com", "wa.link", "x.com",
]);

function lookupRetailer(domain: string): { name: string; domain: string } | null {
  for (const [d, name] of Object.entries(RETAILER_DOMAINS)) {
    if (domain.includes(d)) return { name, domain: d };
  }
  return null;
}

async function fallbackUnshorten(url: string): Promise<string> {
  try {
    const resp = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 5000);
    let resolved = resp.url || url;
    const resolvedDomain = extractDomain(resolved);
    if (isJsRedirectDomain(resolvedDomain) && resolved === url) {
      resolved = await resolveJsRedirect(resolved);
    }
    return resolved;
  } catch {
    try {
      const resp = await fetchWithTimeout(url, { method: "GET", redirect: "follow" }, 5000);
      let resolved = resp.url || url;
      const resolvedDomain = extractDomain(resolved);
      if (isJsRedirectDomain(resolvedDomain) && resolved === url) {
        resolved = await resolveJsRedirect(resolved);
      }
      return resolved;
    } catch {
      return url;
    }
  }
}

const unshortenKeys = [
  Deno.env.get("UNSHORTEN_API_KEY"),
  Deno.env.get("UNSHORTEN_API_KEY_2"),
].filter(Boolean) as string[];
let unshortenKeyIndex = 0;
function getNextUnshortenKey(): string {
  const key = unshortenKeys[unshortenKeyIndex % unshortenKeys.length];
  unshortenKeyIndex++;
  return key;
}

async function unshortenUrl(url: string): Promise<string> {
  if (unshortenKeys.length === 0) return fallbackUnshorten(url);
  const apiKey = getNextUnshortenKey();
  try {
    const resp = await fetchWithTimeout(
      `https://unshorten.me/api/v2/unshorten?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Token ${apiKey}` } },
      5000
    );
    if (resp.status === 401 || resp.status === 429) return fallbackUnshorten(url);
    const data = await resp.json();
    if (data.success && data.unshortened_url) {
      let resolved = data.unshortened_url;
      const resolvedDomain = extractDomain(resolved);
      if (isJsRedirectDomain(resolvedDomain) && !lookupRetailer(resolvedDomain)) {
        resolved = await resolveJsRedirect(resolved);
      }
      return resolved;
    }
    return fallbackUnshorten(url);
  } catch {
    return fallbackUnshorten(url);
  }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_name", "gclid", "fbclid", "mc_cid", "mc_eid",
  "ref", "ref_src", "ref_url", "referrer", "source", "igshid",
  "_branch_match_id", "si", "feature",
]);

function normalizeForCache(url: string): string {
  try {
    const u = new URL(url);
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.set(k, v);
    }
    u.search = keep.toString();
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

interface Pattern {
  id: string; pattern: string; name: string; classification: string; is_confirmed: boolean; type: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth guard
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const tmpClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await tmpClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const userId = claims.claims.sub as string;
      const { data: hasAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: hasSuperAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!hasAdmin && !hasSuperAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: patterns } = await supabase
      .from("affiliate_patterns")
      .select("id, pattern, name, classification, is_confirmed, type");

    const allPatterns: Pattern[] = (patterns || []) as Pattern[];

    // Local clones (don't mutate module-level)
    const localAffiliateShortDomains: Record<string, string> = { ...AFFILIATE_SHORT_DOMAINS };
    const localRetailerDomains: Record<string, string> = { ...RETAILER_DOMAINS };

    const affiliatePlatformDomains = new Set<string>();
    for (const p of allPatterns) {
      if (!p.is_confirmed || !p.name) continue;
      const pType = (p.type || "").toLowerCase();
      if (pType === "affiliate_platform") {
        if (!localAffiliateShortDomains[p.pattern]) localAffiliateShortDomains[p.pattern] = p.name;
        affiliatePlatformDomains.add(p.pattern);
      }
      if (pType === "retailer" && !localRetailerDomains[p.pattern]) {
        localRetailerDomains[p.pattern] = p.name;
      }
    }
    for (const d of Object.keys(localAffiliateShortDomains)) affiliatePlatformDomains.add(d);

    function localLookupAffiliatePlatform(domain: string): string | null {
      for (const [d, name] of Object.entries(localAffiliateShortDomains)) {
        if (domain.includes(d)) return name;
      }
      return null;
    }
    function localLookupRetailer(domain: string): { name: string; domain: string } | null {
      for (const [d, name] of Object.entries(localRetailerDomains)) {
        if (domain.includes(d)) return { name, domain: d };
      }
      return null;
    }

    function needsUnshortening(domain: string): boolean {
      if (KNOWN_SHORTENERS.some(s => domain.includes(s))) return true;
      if (AFFILIATE_REDIRECT_DOMAINS.some(s => domain.includes(s))) return true;
      for (const apDomain of affiliatePlatformDomains) {
        if (domain.includes(apDomain)) return true;
      }
      return false;
    }

    // Item 3: Pattern lookup tables built once per invocation
    const patternsByExactDomain = new Map<string, Pattern>();
    const patternsByType: Record<string, Pattern[]> = { affiliate_platform: [], retailer: [], social: [], neutral: [] };
    const rebuildPatternIndex = () => {
      patternsByExactDomain.clear();
      for (const k of Object.keys(patternsByType)) patternsByType[k] = [];
      for (const p of allPatterns) {
        patternsByExactDomain.set(p.pattern, p);
        const t = (p.type || "").toLowerCase();
        if (patternsByType[t]) patternsByType[t].push(p);
      }
    };
    rebuildPatternIndex();

    function matchFast(domain: string, filterType?: string): Pattern | null {
      if (!domain) return null;
      const exact = patternsByExactDomain.get(domain);
      if (exact && (!filterType || exact.type?.toLowerCase() === filterType)) return exact;
      const pool = filterType ? (patternsByType[filterType] ?? allPatterns) : allPatterns;
      for (const p of pool) {
        if (domain.endsWith(p.pattern) || domain.includes(p.pattern)) return p;
      }
      return null;
    }

    let requestedBatchSize: number | null = null;
    let isManualBatch = false;
    try {
      const body = await req.json();
      if (body?.batch_size && typeof body.batch_size === "number") {
        requestedBatchSize = Math.min(Math.max(body.batch_size, 1), 2000);
        isManualBatch = true;
      }
    } catch {}

    const affectedChannels = new Set<string>();
    let totalProcessed = 0;
    let totalCached = 0;
    let totalResolved = 0;
    let totalFailed = 0;
    let dbErrors = 0;
    const MAX_TOTAL = requestedBatchSize || 500;
    const BATCH_SIZE = 50;

    // Helper: per-row UPDATE with error tracking. Avoids upsert NOT-NULL pitfalls and
    // keeps statements small enough to fit under the Postgres statement timeout.
    async function updateLinksByIds(
      updates: Array<{ id: string } & Record<string, any>>,
      label: string,
    ): Promise<void> {
      if (updates.length === 0) return;
      // Run in parallel chunks of 25 to stay well under timeout while keeping throughput.
      const PAR = 25;
      for (let i = 0; i < updates.length; i += PAR) {
        const slice = updates.slice(i, i + PAR);
        const results = await Promise.all(
          slice.map(({ id, ...payload }) =>
            supabase.from("video_links").update(payload).eq("id", id),
          ),
        );
        for (let j = 0; j < results.length; j++) {
          const { error } = results[j];
          if (error) {
            dbErrors++;
            console.error(`[${label}] update failed`, {
              id: slice[j].id,
              error: error.message,
            });
          }
        }
      }
    }
    const videoChannelCache = new Map<string, string>();

    // Item 5: Local quota counter
    const { data: rlRow } = await supabase
      .from("rate_limits")
      .select("requests_today, quota_limit, last_reset")
      .eq("key", "unshorten_api")
      .single();
    const nowDate = new Date();
    const lastReset = rlRow ? new Date(rlRow.last_reset) : nowDate;
    const needsReset = lastReset.toDateString() !== nowDate.toDateString();
    let localUsed = needsReset ? 0 : (rlRow?.requests_today ?? 0);
    const localLimit = rlRow?.quota_limit ?? 500;

    function localCheckQuota(): boolean {
      if (localUsed + 1 > localLimit) return false;
      localUsed++;
      return true;
    }

    // Item 2: Per-domain circuit breaker
    const domainCircuit = new Map<string, { fails: number; openUntil: number }>();
    function circuitAllows(domain: string): boolean {
      const c = domainCircuit.get(domain);
      if (!c) return true;
      if (c.fails < 3) return true;
      return Date.now() > c.openUntil;
    }
    function recordFailure(domain: string) {
      const c = domainCircuit.get(domain) ?? { fails: 0, openUntil: 0 };
      c.fails++;
      if (c.fails >= 3) c.openUntil = Date.now() + 5 * 60_000;
      domainCircuit.set(domain, c);
    }
    function recordSuccess(domain: string) {
      domainCircuit.delete(domain);
    }

    // Item 9: Per-domain metrics
    const metricsByDomain: Record<string, { count: number; resolved: number; failed: number; cached: number; totalMs: number }> = {};
    function recordMetric(domain: string, outcome: "resolved" | "failed" | "cached", ms: number) {
      if (!metricsByDomain[domain]) metricsByDomain[domain] = { count: 0, resolved: 0, failed: 0, cached: 0, totalMs: 0 };
      metricsByDomain[domain].count++;
      metricsByDomain[domain][outcome]++;
      metricsByDomain[domain].totalMs += ms;
    }

    const urlCache = new Map<string, string>();
    const cacheWritesQueue: Array<{
      normalized_url: string;
      unshortened_url: string;
      final_domain: string | null;
      resolution_method: string;
    }> = [];

    // Item 7: Recursive chain resolution
    async function resolveFullChain(url: string, maxHops = 3): Promise<string> {
      let current = url;
      for (let i = 0; i < maxHops; i++) {
        const next = unshortenKeys.length > 0 && localCheckQuota()
          ? await unshortenUrl(current)
          : await fallbackUnshorten(current);
        if (next === current) return current;
        const nextDomain = extractDomain(next);
        if (lookupRetailer(nextDomain) || localLookupRetailer(nextDomain)) return next;
        if (!needsUnshortening(nextDomain)) return next;
        current = next;
      }
      return current;
    }

    // Step 0: Fast-path skip-domain links
    {
      const { data: skipLinks } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .in("resolution_status", ["pending"])
        .limit(5000);

      if (skipLinks && skipLinks.length > 0) {
        const skipUpdates: { id: string; original_url: string; video_id: string }[] = [];
        for (const link of skipLinks) {
          const domain = extractDomain(link.original_url);
          if (SKIP_DOMAINS.has(domain)) skipUpdates.push(link);
        }
        if (skipUpdates.length > 0) {
          console.log(`Fast-pathing ${skipUpdates.length} skip-domain links`);
          const skipRows = skipUpdates.map(link => {
            const domain = extractDomain(link.original_url);
            return {
              id: link.id,
              unshortened_url: link.original_url,
              domain,
              original_domain: domain,
              classification: "NEUTRAL",
              is_shortened: false,
              link_type: "unknown",
              resolution_status: "resolved",
            };
          });
          await updateLinksByIds(skipRows, "skip-fastpath");
          totalProcessed += skipUpdates.length;
        }
      }
    }

    // Item 10: resolveOne extracted; handles cache, quota, circuit, recursive chain
    interface LinkRow { id: string; original_url: string; video_id: string; domain: string; }

    async function resolveOne(link: LinkRow): Promise<{ id: string; original_url: string; video_id: string; finalUrl: string; domain: string; outcome: "cached" | "resolved" | "failed"; method: string; error?: string }> {
      const start = Date.now();
      const domain = link.domain;

      // In-memory cache hit
      const cached = urlCache.get(link.original_url);
      if (cached) {
        recordMetric(domain, "cached", Date.now() - start);
        return { ...link, finalUrl: cached, outcome: "cached", method: "memory" };
      }

      // Circuit breaker
      if (!circuitAllows(domain)) {
        recordMetric(domain, "failed", Date.now() - start);
        return { ...link, finalUrl: link.original_url, outcome: "failed", method: "circuit_open", error: "circuit breaker open" };
      }

      try {
        const finalUrl = await resolveFullChain(link.original_url);
        urlCache.set(link.original_url, finalUrl);
        const resolved = finalUrl !== link.original_url;
        const method = unshortenKeys.length > 0 ? "api" : "fallback";

        if (resolved) {
          recordSuccess(domain);
          cacheWritesQueue.push({
            normalized_url: normalizeForCache(link.original_url),
            unshortened_url: finalUrl,
            final_domain: extractDomain(finalUrl) || null,
            resolution_method: method,
          });
          recordMetric(domain, "resolved", Date.now() - start);
          return { ...link, finalUrl, outcome: "resolved", method };
        } else {
          recordFailure(domain);
          recordMetric(domain, "failed", Date.now() - start);
          return { ...link, finalUrl, outcome: "failed", method, error: "no resolution" };
        }
      } catch (e: any) {
        recordFailure(domain);
        recordMetric(domain, "failed", Date.now() - start);
        return { ...link, finalUrl: link.original_url, outcome: "failed", method: "error", error: e?.message || "unknown" };
      }
    }

    while (totalProcessed < MAX_TOTAL) {
      const { data: links, error } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .in("resolution_status", ["pending"])
        .limit(BATCH_SIZE);

      if (error) throw error;
      if (!links || links.length === 0) break;

      const uniqueVideoIds = [...new Set(links.map(l => l.video_id))];
      const missingVideoIds = uniqueVideoIds.filter(id => !videoChannelCache.has(id));
      if (missingVideoIds.length > 0) {
        const { data: videoData } = await supabase.from("videos").select("id, channel_id").in("id", missingVideoIds);
        for (const v of (videoData || [])) videoChannelCache.set(v.id, v.channel_id);
      }

      // Item 8: Enrich once with domain
      const enriched: LinkRow[] = links.map(l => ({ ...l, domain: extractDomain(l.original_url) }));

      const shortenedLinks: LinkRow[] = [];
      const normalLinks: LinkRow[] = [];
      const skipLinks: LinkRow[] = [];
      for (const link of enriched) {
        if (SKIP_DOMAINS.has(link.domain)) skipLinks.push(link);
        else if (needsUnshortening(link.domain)) shortenedLinks.push(link);
        else normalLinks.push(link);
      }

      if (skipLinks.length > 0) {
        const skipRows = skipLinks.map(link => ({
          id: link.id,
          unshortened_url: link.original_url,
          domain: link.domain,
          original_domain: link.domain,
          classification: "NEUTRAL",
          is_shortened: false,
          link_type: "unknown",
          resolution_status: "resolved",
        }));
        await updateLinksByIds(skipRows, "skip-batch");
        totalProcessed += skipLinks.length;
      }

      // Cross-run cache lookup
      if (shortenedLinks.length > 0) {
        const urlsToCheck = shortenedLinks
          .map(l => ({ link: l, norm: normalizeForCache(l.original_url) }))
          .filter(x => !urlCache.has(x.link.original_url));

        if (urlsToCheck.length > 0) {
          const normSet = [...new Set(urlsToCheck.map(x => x.norm))];
          const CACHE_CHUNK = 100;
          for (let i = 0; i < normSet.length; i += CACHE_CHUNK) {
            const chunk = normSet.slice(i, i + CACHE_CHUNK);
            const { data: cached } = await supabase
              .from("url_resolution_cache")
              .select("normalized_url, unshortened_url")
              .in("normalized_url", chunk);
            if (cached) {
              const byNorm = new Map(cached.map((c: any) => [c.normalized_url, c.unshortened_url]));
              for (const { link, norm } of urlsToCheck) {
                const hit = byNorm.get(norm);
                if (hit) urlCache.set(link.original_url, hit);
              }
            }
          }
        }
      }

      // Item 1: Split into API vs fallback pools
      const apiPool: LinkRow[] = [];
      const fallbackPool: LinkRow[] = [];
      for (const link of shortenedLinks) {
        // Cache hits don't need API/fallback distinction; route to API pool (will short-circuit on cache hit)
        if (urlCache.has(link.original_url)) {
          apiPool.push(link);
          continue;
        }
        // If quota is exhausted or no API keys, use fallback pool
        if (unshortenKeys.length === 0 || localUsed >= localLimit) {
          fallbackPool.push(link);
        } else {
          apiPool.push(link);
        }
      }

      const unshortenResults: Array<LinkRow & { finalUrl: string; outcome: string }> = [];
      const failedResults: Array<{ id: string; error: string }> = [];

      // API pool: 10 parallel, 200ms between batches
      for (let i = 0; i < apiPool.length; i += 10) {
        const batch = apiPool.slice(i, i + 10);
        const results = await Promise.all(batch.map(resolveOne));
        for (const r of results) {
          unshortenResults.push(r);
          if (r.outcome === "cached") totalCached++;
          else if (r.outcome === "resolved") totalResolved++;
          else { totalFailed++; failedResults.push({ id: r.id, error: r.error || "unknown" }); }
        }
        if (i + 10 < apiPool.length) await new Promise(r => setTimeout(r, 200));
      }
      // Fallback pool: 25 parallel, no delay
      for (let i = 0; i < fallbackPool.length; i += 25) {
        const batch = fallbackPool.slice(i, i + 25);
        const results = await Promise.all(batch.map(resolveOne));
        for (const r of results) {
          unshortenResults.push(r);
          if (r.outcome === "cached") totalCached++;
          else if (r.outcome === "resolved") totalResolved++;
          else { totalFailed++; failedResults.push({ id: r.id, error: r.error || "unknown" }); }
        }
      }

      // Flush cache writes
      if (cacheWritesQueue.length > 0) {
        const unique = new Map(cacheWritesQueue.map(c => [c.normalized_url, c]));
        const rows = [...unique.values()];
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          await supabase.from("url_resolution_cache").upsert(chunk, { onConflict: "normalized_url" });
        }
        cacheWritesQueue.length = 0;
      }

      const processedLinks = [
        ...normalLinks.map(l => ({ ...l, finalUrl: l.original_url, outcome: "resolved" as const })),
        ...unshortenResults,
      ];

      const newPlatformDomains = new Set<string>();
      const newRetailerDomains = new Set<string>();

      interface LinkUpdate {
        id: string;
        unshortened_url: string;
        domain: string;
        original_domain: string;
        classification: string;
        matched_pattern_id: string | null;
        affiliate_platform_id: string | null;
        retailer_pattern_id: string | null;
        is_shortened: boolean;
        link_type: string;
        affiliate_platform: string | null;
        affiliate_domain: string | null;
        resolved_retailer: string | null;
        resolved_retailer_domain: string | null;
        resolution_status: string;
      }

      const linkUpdates: LinkUpdate[] = [];
      const failedById = new Map(failedResults.map(f => [f.id, f.error]));

      for (const link of processedLinks) {
        const originalDomain = link.domain;
        const unshortenedDomain = extractDomain(link.finalUrl);
        const isShortened = originalDomain !== unshortenedDomain;

        const affiliatePlatformName = localLookupAffiliatePlatform(originalDomain);
        const platformMatch: Pattern | null = matchFast(originalDomain, "affiliate_platform");

        let retailerLookup: { name: string; domain: string } | null = null;
        if (isShortened) retailerLookup = localLookupRetailer(unshortenedDomain);
        else if (!affiliatePlatformName && !platformMatch) retailerLookup = localLookupRetailer(originalDomain);

        let linkType = "unknown";
        let resolvedRetailer: string | null = null;
        let resolvedRetailerDomain: string | null = null;

        if (affiliatePlatformName || platformMatch) {
          linkType = "affiliate";
          if (retailerLookup) {
            linkType = "both";
            resolvedRetailer = retailerLookup.name;
            resolvedRetailerDomain = retailerLookup.domain;
          }
        } else if (retailerLookup) {
          linkType = "retailer";
          resolvedRetailer = retailerLookup.name;
          resolvedRetailerDomain = retailerLookup.domain;
        }

        const retailerMatch = matchFast(unshortenedDomain, "retailer");

        let classification = "NEUTRAL";
        let matchedPatternId: string | null = null;

        if (retailerMatch && retailerMatch.is_confirmed) {
          classification = retailerMatch.classification;
          matchedPatternId = retailerMatch.id;
        } else if (platformMatch && platformMatch.is_confirmed) {
          classification = platformMatch.classification;
          matchedPatternId = platformMatch.id;
        } else {
          const anyMatch = matchFast(unshortenedDomain);
          if (anyMatch) {
            classification = anyMatch.is_confirmed ? anyMatch.classification : "NEUTRAL";
            matchedPatternId = anyMatch.id;
          }
        }

        if (!platformMatch && !retailerMatch && originalDomain && !SKIP_DOMAINS.has(originalDomain)) {
          if (!patternsByExactDomain.has(originalDomain)) {
            if (isShortened || affiliatePlatformName || AFFILIATE_REDIRECT_DOMAINS.some(s => originalDomain.includes(s))) {
              newPlatformDomains.add(originalDomain);
            } else {
              newRetailerDomains.add(originalDomain);
            }
          }
        }
        if (!retailerMatch && isShortened && unshortenedDomain && unshortenedDomain !== originalDomain && !SKIP_DOMAINS.has(unshortenedDomain)) {
          if (!patternsByExactDomain.has(unshortenedDomain)) newRetailerDomains.add(unshortenedDomain);
        }

        // Item 6: Resolution status tracking
        const isFailed = failedById.has(link.id);
        const resolution_status = isFailed ? "pending" : "resolved"; // increment handled below for failed

        linkUpdates.push({
          id: link.id,
          unshortened_url: link.finalUrl,
          domain: unshortenedDomain,
          original_domain: originalDomain,
          classification,
          matched_pattern_id: matchedPatternId,
          affiliate_platform_id: platformMatch?.id || null,
          retailer_pattern_id: retailerMatch?.id || null,
          is_shortened: isShortened,
          link_type: linkType,
          affiliate_platform: affiliatePlatformName || (platformMatch ? platformMatch.name : null),
          affiliate_domain: (affiliatePlatformName || platformMatch) ? originalDomain : null,
          resolved_retailer: resolvedRetailer,
          resolved_retailer_domain: resolvedRetailerDomain,
          resolution_status,
        });

        const chId = videoChannelCache.get(link.video_id);
        if (chId) affectedChannels.add(chId);
      }

      // Auto-discover new platform patterns
      if (newPlatformDomains.size > 0) {
        const rows = [...newPlatformDomains].map(d => ({
          pattern: d, name: d, classification: "NEUTRAL",
          is_auto_discovered: true, is_confirmed: false, type: "affiliate_platform",
        }));
        const { data: inserted } = await supabase
          .from("affiliate_patterns")
          .upsert(rows, { onConflict: "pattern" })
          .select("id, pattern, name, classification, is_confirmed, type");
        if (inserted) {
          for (const p of inserted) {
            allPatterns.push(p as Pattern);
            for (const lu of linkUpdates) {
              if (!lu.affiliate_platform_id && lu.original_domain === p.pattern) lu.affiliate_platform_id = p.id;
            }
          }
          rebuildPatternIndex();
        }
      }

      if (newRetailerDomains.size > 0) {
        const rows = [...newRetailerDomains].map(d => ({
          pattern: d, name: d, classification: "NEUTRAL",
          is_auto_discovered: true, is_confirmed: false, type: "retailer",
        }));
        const { data: inserted } = await supabase
          .from("affiliate_patterns")
          .upsert(rows, { onConflict: "pattern" })
          .select("id, pattern, name, classification, is_confirmed, type");
        if (inserted) {
          for (const p of inserted) {
            allPatterns.push(p as Pattern);
            for (const lu of linkUpdates) {
              if (!lu.retailer_pattern_id && lu.domain === p.pattern) lu.retailer_pattern_id = p.id;
            }
          }
          rebuildPatternIndex();
        }
      }

      // Bulk upsert main link updates (only for non-failed; failed get separate handling)
      const successRows = linkUpdates.filter(lu => lu.resolution_status === "resolved");
      await updateLinksByIds(successRows, "success-rows");

      // Item 6: Increment resolution_attempts for failed; mark as 'failed' if attempts >= 3
      const failedIds = linkUpdates.filter(lu => lu.resolution_status === "pending").map(lu => lu.id);
      if (failedIds.length > 0) {
        // Read current attempt counts
        const { data: currentAttempts } = await supabase
          .from("video_links")
          .select("id, resolution_attempts")
          .in("id", failedIds);
        const attemptMap = new Map((currentAttempts || []).map((r: any) => [r.id, r.resolution_attempts || 0]));
        const failureRows = failedIds.map(id => {
          const nextAttempts = (attemptMap.get(id) || 0) + 1;
          const status = nextAttempts >= 3 ? "failed" : "pending";
          return {
            id,
            resolution_attempts: nextAttempts,
            resolution_status: status,
            last_resolution_error: failedById.get(id) || "unknown",
          };
        });
        await updateLinksByIds(failureRows, "failure-rows");
      }

      totalProcessed += processedLinks.length;
    }

    // Step 2: Re-classify stale links
    const confirmedPatterns = allPatterns.filter(p => p.is_confirmed);
    for (const p of confirmedPatterns) {
      const { data: staleLinks } = await supabase
        .from("video_links")
        .select("id, video_id")
        .eq("matched_pattern_id", p.id)
        .neq("classification", p.classification)
        .limit(1000);

      if (staleLinks && staleLinks.length > 0) {
        await supabase.from("video_links").update({ classification: p.classification }).in("id", staleLinks.map(l => l.id));
        const staleVideoIds = [...new Set(staleLinks.map(l => l.video_id))];
        const missingIds = staleVideoIds.filter(id => !videoChannelCache.has(id));
        if (missingIds.length > 0) {
          const { data: vds } = await supabase.from("videos").select("id, channel_id").in("id", missingIds);
          for (const v of (vds || [])) videoChannelCache.set(v.id, v.channel_id);
        }
        for (const vid of staleVideoIds) {
          const ch = videoChannelCache.get(vid);
          if (ch) affectedChannels.add(ch);
        }
      }
    }

    // Step 3: Match previously-unmatched links by domain
    const { data: unmatchedLinks } = await supabase
      .from("video_links")
      .select("id, domain, original_domain, video_id")
      .is("matched_pattern_id", null)
      .not("domain", "is", null)
      .not("unshortened_url", "is", null)
      .limit(2000);

    if (unmatchedLinks && unmatchedLinks.length > 0) {
      const batchUpdates: any[] = [];
      for (const link of unmatchedLinks) {
        if (!link.domain || SKIP_DOMAINS.has(link.domain)) continue;
        const retailerMatch = matchFast(link.domain, "retailer");
        const platformMatch = link.original_domain ? matchFast(link.original_domain, "affiliate_platform") : null;
        const anyMatch = retailerMatch || platformMatch || matchFast(link.domain);
        if (anyMatch) {
          let linkType: string | null = null;
          let affiliatePlatformName: string | null = null;
          let resolvedRetailerName: string | null = null;
          if (platformMatch) { affiliatePlatformName = platformMatch.name; linkType = "affiliate"; }
          if (retailerMatch) { resolvedRetailerName = retailerMatch.name; linkType = platformMatch ? "both" : "retailer"; }
          batchUpdates.push({
            id: link.id,
            matched_pattern_id: anyMatch.id,
            classification: anyMatch.is_confirmed ? anyMatch.classification : "NEUTRAL",
            affiliate_platform_id: platformMatch?.id || null,
            retailer_pattern_id: retailerMatch?.id || null,
            affiliate_platform: affiliatePlatformName,
            resolved_retailer: resolvedRetailerName,
            link_type: linkType,
          });
          const ch = videoChannelCache.get(link.video_id);
          if (ch) affectedChannels.add(ch);
        }
      }
      if (batchUpdates.length > 0) {
        await updateLinksByIds(batchUpdates, "step3-unmatched");
      }
    }

    // Item 5: Persist local quota counter at end
    try {
      if (needsReset) {
        await supabase.from("rate_limits").update({ requests_today: localUsed, last_reset: nowDate.toISOString() }).eq("key", "unshorten_api");
      } else {
        await supabase.from("rate_limits").update({ requests_today: localUsed }).eq("key", "unshorten_api");
      }
    } catch (e) {
      console.error("Failed to persist rate_limits:", e);
    }

    // Auto-trigger compute-channel-stats
    if (affectedChannels.size > 0) {
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/compute-channel-stats`;
        await fetch(fnUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel_ids: [...affectedChannels] }),
        });
      } catch (e) {
        console.error("Failed to trigger compute-channel-stats:", e);
      }
    }

    const { count: remaining } = await supabase
      .from("video_links")
      .select("id", { count: "exact", head: true })
      .is("unshortened_url", null)
      .in("resolution_status", ["pending"]);

    if (!isManualBatch && remaining && remaining > 0) {
      console.log(`Re-triggering: ${remaining} links still unprocessed`);
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/process-video-links`;
        fetch(fnUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
      } catch {}
    }

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      remaining: remaining || 0,
      affected_channels: [...affectedChannels],
      cached: totalCached,
      resolved: totalResolved,
      failed: totalFailed,
      db_errors: dbErrors,
      metricsByDomain,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
