import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

function extractRedirectFromHtml(html: string, sourceDomain: string): string | null {
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

// Fetch with AbortController timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Stream only first 20KB of HTML body
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

function lookupAffiliatePlatform(domain: string): string | null {
  for (const [d, name] of Object.entries(AFFILIATE_SHORT_DOMAINS)) {
    if (domain.includes(d)) return name;
  }
  return null;
}

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
    // Only do JS redirect parsing if we landed on a JS-redirect domain AND it's still the same as input
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
      // Only parse JS redirect if the resolved URL is still on a JS-redirect domain
      // AND it's not already a known retailer (optimization: skip HTML fetch when not needed)
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

interface Pattern {
  id: string; pattern: string; name: string; classification: string; is_confirmed: boolean; type: string;
}

function matchPattern(domain: string, url: string, patterns: Pattern[], filterType?: string): Pattern | null {
  for (const p of patterns) {
    if (filterType && p.type?.toLowerCase() !== filterType) continue;
    if (domain.includes(p.pattern) || url.includes(p.pattern)) return p;
  }
  return null;
}

// Batched parallel processing: groups of RESOLVE_BATCH with delay between
const RESOLVE_BATCH = 10;
const RESOLVE_DELAY_MS = 200;

// Rate limit helper for unshorten API
async function checkUnshortenQuota(supabase: any, cost: number): Promise<boolean> {
  const { data } = await supabase
    .from("rate_limits")
    .select("requests_today, quota_limit, last_reset")
    .eq("key", "unshorten_api")
    .single();
  if (!data) return true;
  const lastReset = new Date(data.last_reset);
  const now = new Date();
  let current = data.requests_today;
  if (lastReset.toDateString() !== now.toDateString()) {
    await supabase.from("rate_limits").update({ requests_today: 0, last_reset: now.toISOString() }).eq("key", "unshorten_api");
    current = 0;
  }
  if (current + cost > data.quota_limit) return false;
  await supabase.from("rate_limits").update({ requests_today: current + cost }).eq("key", "unshorten_api");
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth guard: require service role key or valid admin JWT
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

    // Clone module-level constants into local variables to avoid cross-invocation mutation
    const localAffiliateShortDomains: Record<string, string> = { ...AFFILIATE_SHORT_DOMAINS };
    const localRetailerDomains: Record<string, string> = { ...RETAILER_DOMAINS };

    const affiliatePlatformDomains = new Set<string>();
    for (const p of allPatterns) {
      if (!p.is_confirmed || !p.name) continue;
      const pType = (p.type || "").toLowerCase();
      if (pType === "affiliate_platform") {
        if (!localAffiliateShortDomains[p.pattern]) {
          localAffiliateShortDomains[p.pattern] = p.name;
        }
        affiliatePlatformDomains.add(p.pattern);
      }
      if (pType === "retailer" && !localRetailerDomains[p.pattern]) {
        localRetailerDomains[p.pattern] = p.name;
      }
    }
    for (const d of Object.keys(localAffiliateShortDomains)) {
      affiliatePlatformDomains.add(d);
    }

    // Use local clones for lookups within this request
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
    const MAX_TOTAL = requestedBatchSize || 500;
    const BATCH_SIZE = 50;
    const videoChannelCache = new Map<string, string>();

    // In-memory URL cache: original_url → resolved_url
    const urlCache = new Map<string, string>();

    // Step 0: Fast-path skip-domain links
    {
      const { data: skipLinks } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .limit(5000);

      if (skipLinks && skipLinks.length > 0) {
        const skipUpdates: { id: string; original_url: string; video_id: string }[] = [];
        for (const link of skipLinks) {
          const domain = extractDomain(link.original_url);
          if (SKIP_DOMAINS.has(domain)) {
            skipUpdates.push(link);
          }
        }
        if (skipUpdates.length > 0) {
          console.log(`Fast-pathing ${skipUpdates.length} skip-domain links`);
          // Batch DB writes in chunks of 50
          for (let i = 0; i < skipUpdates.length; i += 50) {
            const chunk = skipUpdates.slice(i, i + 50);
            await Promise.all(
              chunk.map(link => {
                const domain = extractDomain(link.original_url);
                return supabase.from("video_links").update({
                  unshortened_url: link.original_url,
                  domain,
                  original_domain: domain,
                  classification: "NEUTRAL",
                  is_shortened: false,
                  link_type: "unknown",
                }).eq("id", link.id);
              })
            );
          }
          totalProcessed += skipUpdates.length;
        }
      }
    }

    while (totalProcessed < MAX_TOTAL) {
      const { data: links, error } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .limit(BATCH_SIZE);

      if (error) throw error;
      if (!links || links.length === 0) break;

      const uniqueVideoIds = [...new Set(links.map(l => l.video_id))];
      const missingVideoIds = uniqueVideoIds.filter(id => !videoChannelCache.has(id));
      if (missingVideoIds.length > 0) {
        const { data: videoData } = await supabase.from("videos").select("id, channel_id").in("id", missingVideoIds);
        for (const v of (videoData || [])) videoChannelCache.set(v.id, v.channel_id);
      }

      const shortenedLinks: typeof links = [];
      const normalLinks: typeof links = [];
      const skipLinks: typeof links = [];
      for (const link of links) {
        const domain = extractDomain(link.original_url);
        if (SKIP_DOMAINS.has(domain)) {
          skipLinks.push(link);
        } else if (needsUnshortening(domain)) {
          shortenedLinks.push(link);
        } else {
          normalLinks.push(link);
        }
      }

      // Fast-path skip-domain links found in main loop
      if (skipLinks.length > 0) {
        await Promise.all(
          skipLinks.map(link => {
            const domain = extractDomain(link.original_url);
            return supabase.from("video_links").update({
              unshortened_url: link.original_url,
              domain,
              original_domain: domain,
              classification: "NEUTRAL",
              is_shortened: false,
              link_type: "unknown",
            }).eq("id", link.id);
          })
        );
        totalProcessed += skipLinks.length;
      }

      // DB-level cache: pre-populate from previously resolved links with same original_url
      if (shortenedLinks.length > 0) {
        const urlsToResolve = shortenedLinks
          .map(l => l.original_url)
          .filter(u => !urlCache.has(u));
        
        if (urlsToResolve.length > 0) {
          const uniqueUrls = [...new Set(urlsToResolve)];
          // Query DB for previously resolved versions of these URLs
          const { data: cachedRows } = await supabase
            .from("video_links")
            .select("original_url, unshortened_url")
            .in("original_url", uniqueUrls.slice(0, 100)) // limit IN clause size
            .not("unshortened_url", "is", null)
            .neq("unshortened_url", "");
          
          if (cachedRows) {
            for (const row of cachedRows) {
              if (row.unshortened_url && row.unshortened_url !== row.original_url) {
                urlCache.set(row.original_url, row.unshortened_url);
              }
            }
          }
        }
      }

      // Resolve shortened links in batches of RESOLVE_BATCH with delay
      const unshortenResults: Array<typeof links[0] & { finalUrl: string }> = [];

      for (let i = 0; i < shortenedLinks.length; i += RESOLVE_BATCH) {
        const batch = shortenedLinks.slice(i, i + RESOLVE_BATCH);
        const batchResults = await Promise.all(
          batch.map(async (link) => {
            // Check in-memory cache first
            const cached = urlCache.get(link.original_url);
            if (cached) {
              totalCached++;
              return { ...link, finalUrl: cached };
            }
            // Resolve via API (with rate limit check)
            try {
              const quotaOk = await checkUnshortenQuota(supabase, 1);
              if (!quotaOk) {
                // Quota exhausted - use fallback (HTTP redirect, no API)
                const finalUrl = await fallbackUnshorten(link.original_url);
                urlCache.set(link.original_url, finalUrl);
                if (finalUrl !== link.original_url) totalResolved++;
                else totalFailed++;
                return { ...link, finalUrl };
              }
              const finalUrl = await unshortenUrl(link.original_url);
              urlCache.set(link.original_url, finalUrl);
              if (finalUrl !== link.original_url) {
                totalResolved++;
              } else {
                totalFailed++;
              }
              return { ...link, finalUrl };
            } catch {
              totalFailed++;
              return { ...link, finalUrl: link.original_url };
            }
          })
        );
        unshortenResults.push(...batchResults);
        // Rate limit delay between batches
        if (i + RESOLVE_BATCH < shortenedLinks.length) {
          await new Promise(r => setTimeout(r, RESOLVE_DELAY_MS));
        }
      }

      const processedLinks = [
        ...normalLinks.map(l => ({ ...l, finalUrl: l.original_url })),
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
      }

      const linkUpdates: LinkUpdate[] = [];

      for (const link of processedLinks) {
        const originalDomain = extractDomain(link.original_url);
        const unshortenedDomain = extractDomain(link.finalUrl);
        const isShortened = originalDomain !== unshortenedDomain;

        const affiliatePlatformName = localLookupAffiliatePlatform(originalDomain);
        let platformMatch: Pattern | null = matchPattern(originalDomain, link.original_url, allPatterns, "affiliate_platform");

        let retailerLookup: { name: string; domain: string } | null = null;
        if (isShortened) {
          retailerLookup = localLookupRetailer(unshortenedDomain);
        } else if (!affiliatePlatformName && !platformMatch) {
          retailerLookup = localLookupRetailer(originalDomain);
        }

        let linkType: string = "unknown";
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

        let retailerMatch = matchPattern(unshortenedDomain, link.finalUrl, allPatterns, "retailer");

        let classification = "NEUTRAL";
        let matchedPatternId: string | null = null;

        if (retailerMatch && retailerMatch.is_confirmed) {
          classification = retailerMatch.classification;
          matchedPatternId = retailerMatch.id;
        } else if (platformMatch && platformMatch.is_confirmed) {
          classification = platformMatch.classification;
          matchedPatternId = platformMatch.id;
        } else {
          const anyMatch = matchPattern(unshortenedDomain, link.finalUrl, allPatterns);
          if (anyMatch) {
            classification = anyMatch.is_confirmed ? anyMatch.classification : "NEUTRAL";
            matchedPatternId = anyMatch.id;
          }
        }

        if (!platformMatch && !retailerMatch && originalDomain && !SKIP_DOMAINS.has(originalDomain)) {
          if (!allPatterns.find(p => p.pattern === originalDomain)) {
            if (isShortened || affiliatePlatformName || AFFILIATE_REDIRECT_DOMAINS.some(s => originalDomain.includes(s))) {
              newPlatformDomains.add(originalDomain);
            } else {
              newRetailerDomains.add(originalDomain);
            }
          }
        }
        if (!retailerMatch && isShortened && unshortenedDomain && unshortenedDomain !== originalDomain && !SKIP_DOMAINS.has(unshortenedDomain)) {
          if (!allPatterns.find(p => p.pattern === unshortenedDomain)) newRetailerDomains.add(unshortenedDomain);
        }

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
        });

        const chId = videoChannelCache.get(link.video_id);
        if (chId) affectedChannels.add(chId);
      }

      // Batch auto-discover new platform patterns
      if (newPlatformDomains.size > 0) {
        const rows = [...newPlatformDomains].map(d => ({
          pattern: d, name: d, classification: "NEUTRAL",
          is_auto_discovered: true, is_confirmed: false, type: "affiliate_platform",
        }));
        const { data: inserted } = await supabase
          .from("affiliate_patterns")
          .upsert(rows, { onConflict: "pattern" })
          .select("id, pattern, classification, is_confirmed, type");
        if (inserted) {
          for (const p of inserted) {
            allPatterns.push(p as Pattern);
            for (const lu of linkUpdates) {
              if (!lu.affiliate_platform_id && lu.original_domain === p.pattern) lu.affiliate_platform_id = p.id;
            }
          }
        }
      }

      // Batch auto-discover new retailer patterns
      if (newRetailerDomains.size > 0) {
        const rows = [...newRetailerDomains].map(d => ({
          pattern: d, name: d, classification: "NEUTRAL",
          is_auto_discovered: true, is_confirmed: false, type: "retailer",
        }));
        const { data: inserted } = await supabase
          .from("affiliate_patterns")
          .upsert(rows, { onConflict: "pattern" })
          .select("id, pattern, classification, is_confirmed, type");
        if (inserted) {
          for (const p of inserted) {
            allPatterns.push(p as Pattern);
            for (const lu of linkUpdates) {
              if (!lu.retailer_pattern_id && lu.domain === p.pattern) lu.retailer_pattern_id = p.id;
            }
          }
        }
      }

      // Batch DB writes in chunks of 50
      for (let i = 0; i < linkUpdates.length; i += 50) {
        const chunk = linkUpdates.slice(i, i + 50);
        await Promise.all(
          chunk.map(lu =>
            supabase.from("video_links").update({
              unshortened_url: lu.unshortened_url,
              domain: lu.domain,
              original_domain: lu.original_domain,
              classification: lu.classification,
              matched_pattern_id: lu.matched_pattern_id,
              affiliate_platform_id: lu.affiliate_platform_id,
              retailer_pattern_id: lu.retailer_pattern_id,
              is_shortened: lu.is_shortened,
              link_type: lu.link_type,
              affiliate_platform: lu.affiliate_platform,
              affiliate_domain: lu.affiliate_domain,
              resolved_retailer: lu.resolved_retailer,
              resolved_retailer_domain: lu.resolved_retailer_domain,
            }).eq("id", lu.id)
          )
        );
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
        await supabase
          .from("video_links")
          .update({ classification: p.classification })
          .in("id", staleLinks.map(l => l.id));

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
      const batchUpdates: { id: string; matched_pattern_id: string; classification: string; affiliate_platform_id: string | null; retailer_pattern_id: string | null; affiliate_platform: string | null; resolved_retailer: string | null; link_type: string | null }[] = [];

      for (const link of unmatchedLinks) {
        if (!link.domain || SKIP_DOMAINS.has(link.domain)) continue;
        const retailerMatch = matchPattern(link.domain, "", allPatterns, "retailer");
        const platformMatch = link.original_domain ? matchPattern(link.original_domain, "", allPatterns, "affiliate_platform") : null;
        const anyMatch = retailerMatch || platformMatch || matchPattern(link.domain, "", allPatterns);
        if (anyMatch) {
          let linkType: string | null = null;
          let affiliatePlatformName: string | null = null;
          let resolvedRetailerName: string | null = null;

          if (platformMatch) {
            affiliatePlatformName = platformMatch.name;
            linkType = "affiliate";
          }
          if (retailerMatch) {
            resolvedRetailerName = retailerMatch.name;
            linkType = platformMatch ? "both" : "retailer";
          }

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
        for (let i = 0; i < batchUpdates.length; i += 50) {
          const chunk = batchUpdates.slice(i, i + 50);
          await Promise.all(
            chunk.map(u =>
              supabase.from("video_links").update({
                matched_pattern_id: u.matched_pattern_id,
                classification: u.classification,
                affiliate_platform_id: u.affiliate_platform_id,
                retailer_pattern_id: u.retailer_pattern_id,
                affiliate_platform: u.affiliate_platform,
                resolved_retailer: u.resolved_retailer,
                link_type: u.link_type,
              }).eq("id", u.id)
            )
          );
        }
      }
    }

    // Auto-trigger compute-channel-stats for affected channels
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

    // Self-re-trigger if more unprocessed links remain (only for automatic runs)
    const { count: remaining } = await supabase
      .from("video_links")
      .select("id", { count: "exact", head: true })
      .is("unshortened_url", null);

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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
