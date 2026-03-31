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

const SKIP_DOMAINS = new Set([
  "youtube.com", "youtu.be", "google.com", "facebook.com", "twitter.com",
  "instagram.com", "tiktok.com", "reddit.com", "linkedin.com", "pinterest.com",
  "wikipedia.org", "github.com", "discord.gg", "discord.com", "t.me",
  "telegram.org", "wa.me", "whatsapp.com", "apple.com", "play.google.com",
  "apps.apple.com", "medium.com", "blogspot.com", "wordpress.com",
]);

async function unshortenUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return resp.url || url;
  } catch {
    try {
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      return resp.url || url;
    } catch {
      return url;
    }
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

// Process N promises concurrently with a concurrency limit
async function parallelMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get ALL affiliate patterns once
    const { data: patterns } = await supabase
      .from("affiliate_patterns")
      .select("id, pattern, classification, is_confirmed");

    const allPatterns = patterns || [];
    const affectedChannels = new Set<string>();
    let totalProcessed = 0;
    const MAX_TOTAL = 500;
    const BATCH_SIZE = 50;

    // Pre-fetch video→channel mapping for all videos with unprocessed links
    const videoChannelCache = new Map<string, string>();

    while (totalProcessed < MAX_TOTAL) {
      const { data: links, error } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .limit(BATCH_SIZE);

      if (error) throw error;
      if (!links || links.length === 0) break;

      // Pre-fetch all video→channel mappings for this batch in one query
      const uniqueVideoIds = [...new Set(links.map(l => l.video_id))];
      const missingVideoIds = uniqueVideoIds.filter(id => !videoChannelCache.has(id));
      if (missingVideoIds.length > 0) {
        const { data: videoData } = await supabase
          .from("videos")
          .select("id, channel_id")
          .in("id", missingVideoIds);
        for (const v of (videoData || [])) {
          videoChannelCache.set(v.id, v.channel_id);
        }
      }

      // Separate shortened vs non-shortened links
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

      // Parallel unshorten (10 concurrent)
      const unshortenResults = await parallelMap(
        shortenedLinks,
        async (link) => {
          const finalUrl = await unshortenUrl(link.original_url);
          return { ...link, finalUrl };
        },
        10
      );

      // Combine results
      const processedLinks = [
        ...normalLinks.map(l => ({ ...l, finalUrl: l.original_url })),
        ...unshortenResults,
      ];

      // Collect new domains to auto-discover in bulk
      const newDomains = new Set<string>();
      const linkUpdates: { id: string; unshortened_url: string; domain: string; classification: string; matched_pattern_id: string | null }[] = [];

      for (const link of processedLinks) {
        const domain = extractDomain(link.finalUrl);
        let classification = "NEUTRAL";
        let matchedPatternId: string | null = null;

        for (const p of allPatterns) {
          if (domain.includes(p.pattern) || link.finalUrl.includes(p.pattern)) {
            classification = p.is_confirmed ? p.classification : "NEUTRAL";
            matchedPatternId = p.id;
            break;
          }
        }

        if (!matchedPatternId && domain && !SKIP_DOMAINS.has(domain)) {
          // Check if already in allPatterns
          const existing = allPatterns.find(p => p.pattern === domain);
          if (existing) {
            matchedPatternId = existing.id;
          } else {
            newDomains.add(domain);
          }
        }

        linkUpdates.push({ id: link.id, unshortened_url: link.finalUrl, domain, classification, matched_pattern_id: matchedPatternId });

        // Track affected channels
        const chId = videoChannelCache.get(link.video_id);
        if (chId) affectedChannels.add(chId);
      }

      // Batch auto-discover new patterns
      if (newDomains.size > 0) {
        const newPatternRows = [...newDomains].map(d => ({
          pattern: d,
          name: d,
          classification: "NEUTRAL",
          is_auto_discovered: true,
          is_confirmed: false,
        }));
        const { data: inserted } = await supabase
          .from("affiliate_patterns")
          .upsert(newPatternRows, { onConflict: "pattern" })
          .select("id, pattern, classification, is_confirmed");

        if (inserted) {
          for (const p of inserted) {
            allPatterns.push(p);
            // Update linkUpdates that match this domain
            for (const lu of linkUpdates) {
              if (!lu.matched_pattern_id && lu.domain === p.pattern) {
                lu.matched_pattern_id = p.id;
              }
            }
          }
        }
      }

      // Batch update all links - use individual updates via Promise.all since each row has different values
      await Promise.all(
        linkUpdates.map(lu =>
          supabase.from("video_links").update({
            unshortened_url: lu.unshortened_url,
            domain: lu.domain,
            classification: lu.classification,
            matched_pattern_id: lu.matched_pattern_id,
          }).eq("id", lu.id)
        )
      );

      totalProcessed += processedLinks.length;
    }

    // Step 2: Re-classify stale links (batch)
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

        // Batch fetch channels for stale video_ids
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
      .select("id, domain, video_id")
      .is("matched_pattern_id", null)
      .not("domain", "is", null)
      .not("unshortened_url", "is", null)
      .limit(2000);

    if (unmatchedLinks && unmatchedLinks.length > 0) {
      const domainPatternMap = new Map<string, { id: string; classification: string; is_confirmed: boolean }>();
      for (const p of allPatterns) {
        domainPatternMap.set(p.pattern, p);
      }

      const batchUpdates: { id: string; matched_pattern_id: string; classification: string }[] = [];

      for (const link of unmatchedLinks) {
        if (!link.domain || SKIP_DOMAINS.has(link.domain)) continue;

        let matched = domainPatternMap.get(link.domain);
        if (!matched) {
          for (const p of allPatterns) {
            if (link.domain.includes(p.pattern) || p.pattern.includes(link.domain)) {
              matched = p;
              break;
            }
          }
        }

        if (matched) {
          const classification = matched.is_confirmed ? matched.classification : "NEUTRAL";
          batchUpdates.push({ id: link.id, matched_pattern_id: matched.id, classification });
          const ch = videoChannelCache.get(link.video_id);
          if (ch) affectedChannels.add(ch);
        }
      }

      // Batch update unmatched links via Promise.all
      if (batchUpdates.length > 0) {
        await Promise.all(
          batchUpdates.map(u =>
            supabase.from("video_links").update({
              matched_pattern_id: u.matched_pattern_id,
              classification: u.classification,
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
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel_ids: [...affectedChannels] }),
        });
      } catch (e) {
        console.error("Failed to trigger compute-channel-stats:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      affected_channels: [...affectedChannels],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
