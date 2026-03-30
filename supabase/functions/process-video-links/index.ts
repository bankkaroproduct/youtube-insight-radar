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
      signal: AbortSignal.timeout(10000),
    });
    return resp.url || url;
  } catch {
    try {
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get ALL affiliate patterns once (confirmed AND unconfirmed)
    const { data: patterns } = await supabase
      .from("affiliate_patterns")
      .select("id, pattern, classification, is_confirmed");

    const allPatterns = patterns || [];
    const affectedChannels = new Set<string>();
    let totalProcessed = 0;
    const MAX_TOTAL = 500;
    const BATCH_SIZE = 50;

    // Loop through batches until no more unprocessed links or we hit the cap
    while (totalProcessed < MAX_TOTAL) {
      const { data: links, error } = await supabase
        .from("video_links")
        .select("id, original_url, video_id")
        .is("unshortened_url", null)
        .limit(BATCH_SIZE);

      if (error) throw error;
      if (!links || links.length === 0) break;

      for (const link of links) {
        const originalDomain = extractDomain(link.original_url);
        const isShortened = KNOWN_SHORTENERS.some(s => originalDomain.includes(s));

        let finalUrl = link.original_url;
        if (isShortened) {
          finalUrl = await unshortenUrl(link.original_url);
        }

        const domain = extractDomain(finalUrl);

        let classification = "NEUTRAL";
        let matchedPatternId = null;

        for (const p of allPatterns) {
          if (domain.includes(p.pattern) || finalUrl.includes(p.pattern)) {
            classification = p.is_confirmed ? p.classification : "NEUTRAL";
            matchedPatternId = p.id;
            break;
          }
        }

        if (!matchedPatternId && domain && !SKIP_DOMAINS.has(domain)) {
          const { data: existing } = await supabase
            .from("affiliate_patterns")
            .select("id")
            .eq("pattern", domain)
            .limit(1);

          if (!existing || existing.length === 0) {
            const { data: inserted } = await supabase.from("affiliate_patterns").insert({
              pattern: domain,
              name: domain,
              classification: "NEUTRAL",
              is_auto_discovered: true,
              is_confirmed: false,
            }).select("id").single();

            if (inserted) {
              matchedPatternId = inserted.id;
              allPatterns.push({
                id: inserted.id,
                pattern: domain,
                classification: "NEUTRAL",
                is_confirmed: false,
              });
            }
          } else {
            matchedPatternId = existing[0].id;
          }
        }

        await supabase.from("video_links").update({
          unshortened_url: finalUrl,
          domain,
          classification,
          matched_pattern_id: matchedPatternId,
        }).eq("id", link.id);

        const { data: videoData } = await supabase
          .from("videos")
          .select("channel_id")
          .eq("id", link.video_id)
          .single();
        if (videoData) affectedChannels.add(videoData.channel_id);

        totalProcessed++;
      }
    }

    // Step 2: Re-classify already-processed links where pattern confirmation changed
    const confirmedPatterns = allPatterns.filter(p => p.is_confirmed);
    for (const p of confirmedPatterns) {
      const { data: staleLinks } = await supabase
        .from("video_links")
        .select("id, video_id")
        .eq("matched_pattern_id", p.id)
        .neq("classification", p.classification)
        .limit(1000);

      if (staleLinks && staleLinks.length > 0) {
        const staleIds = staleLinks.map(l => l.id);
        await supabase
          .from("video_links")
          .update({ classification: p.classification })
          .in("id", staleIds);

        const staleVideoIds = [...new Set(staleLinks.map(l => l.video_id))];
        for (const vid of staleVideoIds) {
          const { data: vd } = await supabase
            .from("videos")
            .select("channel_id")
            .eq("id", vid)
            .single();
          if (vd) affectedChannels.add(vd.channel_id);
        }
      }
    }

    // Step 3: NEW - Match previously-unmatched links by domain against known patterns
    // This fixes links that were processed BEFORE their pattern existed
    const { data: unmatchedLinks } = await supabase
      .from("video_links")
      .select("id, domain, video_id")
      .is("matched_pattern_id", null)
      .not("domain", "is", null)
      .not("unshortened_url", "is", null)
      .limit(2000);

    if (unmatchedLinks && unmatchedLinks.length > 0) {
      // Build a domain->pattern lookup
      const domainPatternMap = new Map<string, { id: string; classification: string; is_confirmed: boolean }>();
      for (const p of allPatterns) {
        domainPatternMap.set(p.pattern, p);
      }

      for (const link of unmatchedLinks) {
        if (!link.domain || SKIP_DOMAINS.has(link.domain)) continue;

        // Try exact match first, then substring
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
          await supabase.from("video_links").update({
            matched_pattern_id: matched.id,
            classification,
          }).eq("id", link.id);

          const { data: vd } = await supabase
            .from("videos")
            .select("channel_id")
            .eq("id", link.video_id)
            .single();
          if (vd) affectedChannels.add(vd.channel_id);
        }
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
