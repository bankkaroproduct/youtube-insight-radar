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
];

// Known affiliate platform domains → platform name
const AFFILIATE_PLATFORM_MAP: Record<string, string> = {
  "wsli.nk": "Wishlink",
  "fkrt.it": "Flipkart Affiliate",
  "amzn.to": "Amazon Associates",
};

// Known retailer domains → retailer name
const RETAILER_DOMAIN_MAP: Record<string, string> = {
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

function lookupRetailer(domain: string): string | null {
  if (!domain) return null;
  for (const [d, name] of Object.entries(RETAILER_DOMAIN_MAP)) {
    if (domain === d || domain.endsWith("." + d)) return name;
  }
  return null;
}

function lookupAffiliatePlatform(domain: string): string | null {
  return AFFILIATE_PLATFORM_MAP[domain] || null;
}

async function fallbackUnshorten(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    return resp.url || url;
  } catch {
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) });
      return resp.url || url;
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
    if (data.success && data.unshortened_url) return data.unshortened_url;
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
  id: string;
  pattern: string;
  classification: string;
  is_confirmed: boolean;
  type: string;
}

function matchPattern(domain: string, url: string, patterns: Pattern[], filterType?: string): Pattern | null {
  for (const p of patterns) {
    if (filterType && p.type !== filterType) continue;
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
      .select("id, pattern, classification, is_confirmed, type");

    const allPatterns: Pattern[] = (patterns || []) as Pattern[];
    const affectedChannels = new Set<string>();
    let totalProcessed = 0;
    const MAX_TOTAL = 500;
    const BATCH_SIZE = 50;
    const videoChannelCache = new Map<string, string>();

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
        if (KNOWN_SHORTENERS.some(s => domain.includes(s))) {
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
        // New fields
        link_type: string | null;
        affiliate_platform: string | null;
        affiliate_domain: string | null;
        resolved_retailer: string | null;
        resolved_retailer_domain: string | null;
        is_shortened: boolean;
      }

      const linkUpdates: LinkUpdate[] = [];

      for (const link of processedLinks) {
        const originalDomain = extractDomain(link.original_url);
        const unshortenedDomain = extractDomain(link.finalUrl);
        const isShortened = KNOWN_SHORTENERS.some(s => originalDomain.includes(s));

        // Determine affiliate platform from original domain
        const affiliatePlatformName = isShortened ? lookupAffiliatePlatform(originalDomain) : null;
        // Determine retailer from resolved domain
        const retailerName = lookupRetailer(unshortenedDomain);

        // Determine link_type
        let linkType: string | null = null;
        if (isShortened && retailerName) linkType = "both";
        else if (isShortened) linkType = "affiliate";
        else if (retailerName) linkType = "retailer";

        // Legacy pattern matching for classification (OWN/COMPETITOR/NEUTRAL)
        let platformMatch: Pattern | null = null;
        if (isShortened) {
          platformMatch = matchPattern(originalDomain, link.original_url, allPatterns, "affiliate_platform");
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

        // Auto-discover new domains
        if (!platformMatch && isShortened && originalDomain && !SKIP_DOMAINS.has(originalDomain)) {
          if (!allPatterns.find(p => p.pattern === originalDomain)) newPlatformDomains.add(originalDomain);
        }
        if (!retailerMatch && unshortenedDomain && !SKIP_DOMAINS.has(unshortenedDomain)) {
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
          link_type: linkType,
          affiliate_platform: affiliatePlatformName,
          affiliate_domain: isShortened ? originalDomain : null,
          resolved_retailer: retailerName,
          resolved_retailer_domain: retailerName ? unshortenedDomain : null,
          is_shortened: isShortened,
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
          .from("affiliate_patterns").upsert(rows, { onConflict: "pattern" })
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
          .from("affiliate_patterns").upsert(rows, { onConflict: "pattern" })
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

      // Batch update all links with new fields
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
            link_type: lu.link_type,
            affiliate_platform: lu.affiliate_platform,
            affiliate_domain: lu.affiliate_domain,
            resolved_retailer: lu.resolved_retailer,
            resolved_retailer_domain: lu.resolved_retailer_domain,
            is_shortened: lu.is_shortened,
          }).eq("id", lu.id)
        )
      );

      totalProcessed += processedLinks.length;
    }

    // Step 2: Re-classify stale links
    const confirmedPatterns = allPatterns.filter(p => p.is_confirmed);
    for (const p of confirmedPatterns) {
      const { data: staleLinks } = await supabase
        .from("video_links").select("id, video_id")
        .eq("matched_pattern_id", p.id).neq("classification", p.classification).limit(1000);

      if (staleLinks && staleLinks.length > 0) {
        await supabase.from("video_links").update({ classification: p.classification })
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
      .from("video_links").select("id, domain, original_domain, video_id")
      .is("matched_pattern_id", null).not("domain", "is", null).not("unshortened_url", "is", null).limit(2000);

    if (unmatchedLinks && unmatchedLinks.length > 0) {
      const batchUpdates: any[] = [];
      for (const link of unmatchedLinks) {
        if (!link.domain || SKIP_DOMAINS.has(link.domain)) continue;
        const retailerMatch = matchPattern(link.domain, "", allPatterns, "retailer");
        const platformMatch = link.original_domain ? matchPattern(link.original_domain, "", allPatterns, "affiliate_platform") : null;
        const anyMatch = retailerMatch || platformMatch || matchPattern(link.domain, "", allPatterns);
        if (anyMatch) {
          const classification = anyMatch.is_confirmed ? anyMatch.classification : "NEUTRAL";
          batchUpdates.push({
            id: link.id,
            matched_pattern_id: anyMatch.id,
            classification,
            affiliate_platform_id: platformMatch?.id || null,
            retailer_pattern_id: retailerMatch?.id || null,
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
            }).eq("id", u.id)
          )
        );
      }
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

    return new Response(JSON.stringify({
      success: true, processed: totalProcessed, affected_channels: [...affectedChannels],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
