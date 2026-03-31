import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function computeMedian(values: number[], skipEnds: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let trimmed = sorted;
  if (sorted.length > skipEnds * 2) {
    trimmed = sorted.slice(skipEnds, sorted.length - skipEnds);
  }
  if (trimmed.length === 0) return 0;
  const mid = Math.floor(trimmed.length / 2);
  return trimmed.length % 2 === 0
    ? Math.round((trimmed[mid - 1] + trimmed[mid]) / 2)
    : trimmed[mid];
}

async function processChannel(supabase: any, chId: string): Promise<boolean> {
  const { data: videos } = await supabase
    .from("videos")
    .select("id, view_count, like_count, comment_count")
    .eq("channel_id", chId);

  if (!videos || videos.length === 0) return false;

  const views = videos.map((v: any) => Number(v.view_count || 0));
  const likes = videos.map((v: any) => Number(v.like_count || 0));
  const comments = videos.map((v: any) => Number(v.comment_count || 0));

  const videoIds = videos.map((v: any) => v.id);
  const { data: links } = await supabase
    .from("video_links")
    .select("video_id, classification, matched_pattern_id, affiliate_platform_id, retailer_pattern_id")
    .in("video_id", videoIds)
    .not("classification", "eq", "NEUTRAL");

  const hasOwn = (links || []).some((l: any) => l.classification === "OWN");
  const hasCompetitor = (links || []).some((l: any) => l.classification === "COMPETITOR");

  let affiliateStatus = "NEUTRAL";
  if (hasOwn && hasCompetitor) affiliateStatus = "MIXED";
  else if (hasOwn) affiliateStatus = "WITH_US";
  else if (hasCompetitor) affiliateStatus = "COMPETITOR";

  // Collect all pattern IDs (legacy)
  const allPatternIds = [...new Set(
    (links || [])
      .filter((l: any) => l.matched_pattern_id && l.classification !== "NEUTRAL")
      .map((l: any) => l.matched_pattern_id)
  )];

  // Collect platform and retailer pattern IDs separately
  const platformIds = [...new Set(
    (links || []).map((l: any) => l.affiliate_platform_id).filter(Boolean)
  )];
  const retailerIds = [...new Set(
    (links || []).map((l: any) => l.retailer_pattern_id).filter(Boolean)
  )];

  // Fetch all pattern names in one query
  const allIds = [...new Set([...allPatternIds, ...platformIds, ...retailerIds])];
  let patternsMap = new Map<string, { name: string; type: string }>();
  if (allIds.length > 0) {
    const { data: patternData } = await supabase
      .from("affiliate_patterns")
      .select("id, name, type")
      .in("id", allIds);
    for (const p of (patternData || [])) {
      patternsMap.set(p.id, { name: p.name, type: p.type });
    }
  }

  const affiliateNames = allPatternIds.map(id => patternsMap.get(id)?.name).filter(Boolean) as string[];
  const affiliatePlatformNames = [...new Set(platformIds.map(id => patternsMap.get(id)?.name).filter(Boolean))] as string[];
  const retailerNames = [...new Set(retailerIds.map(id => patternsMap.get(id)?.name).filter(Boolean))] as string[];

  // Count distinct videos per platform and per retailer
  const platformVideoCounts: Record<string, number> = {};
  const retailerVideoCounts: Record<string, number> = {};

  // Group by platform: count distinct video_ids per platform_id
  const platformVideoSets = new Map<string, Set<string>>();
  const retailerVideoSets = new Map<string, Set<string>>();

  for (const l of (links || [])) {
    if (l.affiliate_platform_id) {
      const name = patternsMap.get(l.affiliate_platform_id)?.name;
      if (name) {
        if (!platformVideoSets.has(name)) platformVideoSets.set(name, new Set());
        platformVideoSets.get(name)!.add(l.video_id);
      }
    }
    if (l.retailer_pattern_id) {
      const name = patternsMap.get(l.retailer_pattern_id)?.name;
      if (name) {
        if (!retailerVideoSets.has(name)) retailerVideoSets.set(name, new Set());
        retailerVideoSets.get(name)!.add(l.video_id);
      }
    }
  }

  for (const [name, videoSet] of platformVideoSets) {
    platformVideoCounts[name] = videoSet.size;
  }
  for (const [name, videoSet] of retailerVideoSets) {
    retailerVideoCounts[name] = videoSet.size;
  }

  await supabase.from("channels").update({
    total_videos_fetched: videos.length,
    median_views: computeMedian(views, 5),
    median_likes: computeMedian(likes, 5),
    median_comments: computeMedian(comments, 5),
    affiliate_status: affiliateStatus,
    affiliate_names: affiliateNames,
    affiliate_platform_names: affiliatePlatformNames,
    retailer_names: retailerNames,
    platform_video_counts: platformVideoCounts,
    retailer_video_counts: retailerVideoCounts,
    last_analyzed_at: new Date().toISOString(),
  }).eq("channel_id", chId);

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    let channelIds: string[] = body.channel_ids || [];

    if (channelIds.length === 0) {
      const { data } = await supabase.from("channels").select("channel_id");
      channelIds = (data || []).map((c: any) => c.channel_id);
    }

    let updated = 0;
    const CONCURRENCY = 10;
    for (let i = 0; i < channelIds.length; i += CONCURRENCY) {
      const batch = channelIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(chId => processChannel(supabase, chId))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) updated++;
      }
    }

    return new Response(JSON.stringify({ success: true, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
