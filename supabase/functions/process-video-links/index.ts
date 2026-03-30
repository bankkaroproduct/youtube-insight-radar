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

    // Get unprocessed links
    const { data: links, error } = await supabase
      .from("video_links")
      .select("id, original_url, video_id")
      .is("unshortened_url", null)
      .limit(50);

    if (error) throw error;
    if (!links || links.length === 0) {
      return new Response(JSON.stringify({ message: "No unprocessed links" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all affiliate patterns
    const { data: patterns } = await supabase
      .from("affiliate_patterns")
      .select("id, pattern, classification, is_confirmed")
      .eq("is_confirmed", true);

    const confirmedPatterns = patterns || [];

    let processed = 0;
    const affectedChannels = new Set<string>();

    for (const link of links) {
      const originalDomain = extractDomain(link.original_url);
      const isShortened = KNOWN_SHORTENERS.some(s => originalDomain.includes(s));

      let finalUrl = link.original_url;
      if (isShortened) {
        finalUrl = await unshortenUrl(link.original_url);
      }

      const domain = extractDomain(finalUrl);

      // Match against patterns
      let classification = "NEUTRAL";
      let matchedPatternId = null;

      for (const p of confirmedPatterns) {
        if (domain.includes(p.pattern) || finalUrl.includes(p.pattern)) {
          classification = p.classification;
          matchedPatternId = p.id;
          break;
        }
      }

      // If no match and looks like an affiliate, auto-discover
      if (!matchedPatternId && domain && classification === "NEUTRAL") {
        const hasTrackingParams = finalUrl.includes("utm_") || finalUrl.includes("ref=") || finalUrl.includes("aff=") || finalUrl.includes("tag=");
        if (hasTrackingParams || isShortened) {
          // Check if pattern already exists
          const { data: existing } = await supabase
            .from("affiliate_patterns")
            .select("id")
            .eq("pattern", domain)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("affiliate_patterns").insert({
              pattern: domain,
              name: domain,
              classification: "NEUTRAL",
              is_auto_discovered: true,
              is_confirmed: false,
            });
          }
        }
      }

      await supabase.from("video_links").update({
        unshortened_url: finalUrl,
        domain,
        classification,
        matched_pattern_id: matchedPatternId,
      }).eq("id", link.id);

      // Track channel for stats recomputation
      const { data: videoData } = await supabase
        .from("videos")
        .select("channel_id")
        .eq("id", link.video_id)
        .single();
      if (videoData) affectedChannels.add(videoData.channel_id);

      processed++;
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
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
