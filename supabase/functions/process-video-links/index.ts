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

// Known affiliate redirect domains that MUST always be unshortened to reveal retailer
const AFFILIATE_REDIRECT_DOMAINS = [
  "wishlink.com", "lehlah.club", "haulpack.com",
  "earnkaro.com", "cuelinks.com", "magicpin.in",
  "openinapp.co", "shopmy.us", "geni.us",
];

// Domains that use JS-based redirects (not HTTP 3xx) — need HTML parsing
const JS_REDIRECT_DOMAINS = [
  "wishlink.com", "lehlah.club", "instamojo.com", "link.springer.com",
  "haulpack.com", "earnkaro.com", "cuelinks.com", "magicpin.in",
];

function isJsRedirectDomain(domain: string): boolean {
  return JS_REDIRECT_DOMAINS.some(d => domain.includes(d));
}

function extractRedirectFromHtml(html: string, sourceDomain: string): string | null {
  // Pattern 1: window.location.href = "URL" or window.location = "URL"
  const jsMatch = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
  if (jsMatch && jsMatch[1]?.startsWith("http")) return jsMatch[1];

  // Pattern 2: <meta http-equiv="refresh" content="...url=URL">
  const metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'\s>]+)/i);
  if (metaMatch && metaMatch[1]?.startsWith("http")) return metaMatch[1];

  // Pattern 3: <link rel="canonical" href="URL">
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch && canonicalMatch[1]?.startsWith("http")) {
    const canonDomain = extractDomain(canonicalMatch[1]);
    // Only use canonical if it points to a different domain
    if (canonDomain && !canonDomain.includes(sourceDomain) && !sourceDomain.includes(canonDomain)) {
      return canonicalMatch[1];
    }
  }

  // Pattern 4: First external <a href> not pointing back to source domain
  const escapedDomain = sourceDomain.replace(/\./g, "\\.");
  const extLinkRegex = new RegExp(`<a[^>]+href=["'](https?:\\/\\/(?!(?:[^"']*${escapedDomain}))[^"']+)["']`, "i");
  const extMatch = html.match(extLinkRegex);
  if (extMatch && extMatch[1]?.startsWith("http")) return extMatch[1];

  return null;
}

async function resolveJsRedirect(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkBot/1.0)" },
    });
    const html = await resp.text();
    const domain = extractDomain(url);
    const extracted = extractRedirectFromHtml(html, domain);
    if (extracted) return extracted;
    return url;
  } catch {
    return url;
  }
}

// Affiliate short domains → platform name
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

// Retailer domains → retailer name
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
    const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    let resolved = resp.url || url;
    // If we landed on a JS-redirect domain, parse HTML for the real destination
    if (isJsRedirectDomain(extractDomain(resolved))) {
      resolved = await resolveJsRedirect(resolved);
    }
    return resolved;
  } catch {
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) });
      let resolved = resp.url || url;
      if (isJsRedirectDomain(extractDomain(resolved))) {
        resolved = await resolveJsRedirect(resolved);
      }
      return resolved;
    } catch {
      return url;
    }
  }
}

async function unshortenUrl(url: string): Promise<string> {
  const apiKey = Deno.env.get("UNSHORTEN_API_KEY");
  if (!apiKey) return fallbackUnshorten(url);
  try {
    const resp = await fetch(
      `https://unshorten.me/api/v2/unshorten?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Token ${apiKey}` }, signal: AbortSignal.timeout(5000) }
    );
    if (resp.status === 401 || resp.status === 429) return fallbackUnshorten(url);
    const data = await resp.json();
    if (data.success && data.unshortened_url) {
      let resolved = data.unshortened_url;
      // If unshorten.me resolved to a JS-redirect domain, parse HTML too
      if (isJsRedirectDomain(extractDomain(resolved))) {
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

async function parallelMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i]); }
  });
  await Promise.all(workers);
  return results;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: patterns } = await supabase
      .from("affiliate_patterns")
      .select("id, pattern, name, classification, is_confirmed, type");

    const allPatterns: Pattern[] = (patterns || []) as Pattern[];

    // Build dynamic lookup maps from DB patterns (confirmed ones take priority)
    const affiliatePlatformDomains = new Set<string>();
    for (const p of allPatterns) {
      if (!p.is_confirmed || !p.name) continue;
      const pType = (p.type || "").toLowerCase();
      if (pType === "affiliate_platform") {
        if (!AFFILIATE_SHORT_DOMAINS[p.pattern]) {
          AFFILIATE_SHORT_DOMAINS[p.pattern] = p.name;
        }
        affiliatePlatformDomains.add(p.pattern);
      }
      if (pType === "retailer" && !RETAILER_DOMAINS[p.pattern]) {
        RETAILER_DOMAINS[p.pattern] = p.name;
      }
    }
    // Also add hardcoded affiliate domains
    for (const d of Object.keys(AFFILIATE_SHORT_DOMAINS)) {
      affiliatePlatformDomains.add(d);
    }

    // A URL needs unshortening if domain is a known shortener OR a known affiliate platform
    function needsUnshortening(domain: string): boolean {
      if (KNOWN_SHORTENERS.some(s => domain.includes(s))) return true;
      if (AFFILIATE_REDIRECT_DOMAINS.some(s => domain.includes(s))) return true;
      for (const apDomain of affiliatePlatformDomains) {
        if (domain.includes(apDomain)) return true;
      }
      return false;
    }

    const affectedChannels = new Set<string>();
    let totalProcessed = 0;
    const MAX_TOTAL = 500;
    const BATCH_SIZE = 50;
    const videoChannelCache = new Map<string, string>();

    // Step 0: Fast-path skip-domain links (youtube, social, etc.) — no unshortening needed
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
          await Promise.all(
            skipUpdates.map(link => {
              const domain = extractDomain(link.original_url);
              return supabase.from("video_links").update({
                unshortened_url: link.original_url,
                domain: domain,
                original_domain: domain,
                classification: "NEUTRAL",
                is_shortened: false,
                link_type: "unknown",
              }).eq("id", link.id);
            })
          );
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
      for (const link of links) {
        const domain = extractDomain(link.original_url);
        if (needsUnshortening(domain)) {
          shortenedLinks.push(link);
        } else {
          normalLinks.push(link);
        }
      }

      const unshortenResults = await parallelMap(
        shortenedLinks,
        async (link) => ({ ...link, finalUrl: await unshortenUrl(link.original_url) }),
        10
      );

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
        // New text columns
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

        // Platform identified from original_url domain (always, regardless of isShortened)
        const affiliatePlatformName = lookupAffiliatePlatform(originalDomain);
        // Also check DB patterns for platform match on original domain (always)
        let platformMatch: Pattern | null = matchPattern(originalDomain, link.original_url, allPatterns, "affiliate_platform");

        // Retailer identified from unshortened_url domain (resolved destination)
        // If shortened, check unshortened domain; if not shortened but platform matched, skip retailer (same domain)
        // If not shortened and no platform, check original domain for retailer
        let retailerLookup: { name: string; domain: string } | null = null;
        if (isShortened) {
          retailerLookup = lookupRetailer(unshortenedDomain);
        } else if (!affiliatePlatformName && !platformMatch) {
          // Not a platform URL, check if it's a direct retailer link
          retailerLookup = lookupRetailer(originalDomain);
        }

        let linkType: string = "unknown";
        let resolvedRetailer: string | null = null;
        let resolvedRetailerDomain: string | null = null;

        if (affiliatePlatformName || platformMatch) {
          // Original URL is an affiliate platform
          linkType = "affiliate";
          if (retailerLookup) {
            linkType = "both";
            resolvedRetailer = retailerLookup.name;
            resolvedRetailerDomain = retailerLookup.domain;
          }
        } else if (retailerLookup) {
          // Direct retailer link
          linkType = "retailer";
          resolvedRetailer = retailerLookup.name;
          resolvedRetailerDomain = retailerLookup.domain;
        }

        // Retailer pattern match from DB
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

        // Auto-discover new domains with smarter type assignment
        if (!platformMatch && !retailerMatch && originalDomain && !SKIP_DOMAINS.has(originalDomain)) {
          if (!allPatterns.find(p => p.pattern === originalDomain)) {
            if (isShortened || affiliatePlatformName || AFFILIATE_REDIRECT_DOMAINS.some(s => originalDomain.includes(s))) {
              // Original domain redirects somewhere → it's a platform
              newPlatformDomains.add(originalDomain);
            } else {
              // No redirect, no platform match → discover as retailer
              newRetailerDomains.add(originalDomain);
            }
          }
        }
        // If shortened and unshortened domain is different, also discover retailer destination
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

      // Batch update all links — now includes new text columns
      await Promise.all(
        linkUpdates.map(lu =>
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
        await Promise.all(
          batchUpdates.map(u =>
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

    // Self-re-trigger if more unprocessed links remain
    const { count: remaining } = await supabase
      .from("video_links")
      .select("id", { count: "exact", head: true })
      .is("unshortened_url", null);

    if (remaining && remaining > 0) {
      console.log(`Re-triggering: ${remaining} links still unprocessed`);
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/process-video-links`;
        fetch(fnUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {}); // fire-and-forget
      } catch {}
    }

    return new Response(JSON.stringify({
      success: true, processed: totalProcessed, remaining: remaining || 0, affected_channels: [...affectedChannels],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
