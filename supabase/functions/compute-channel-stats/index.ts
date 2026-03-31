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
  if (sorted.length > skipEnds * 2) trimmed = sorted.slice(skipEnds, sorted.length - skipEnds);
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

  // Fetch links with new columns
  const { data: links } = await supabase
    .from("video_links")
    .select("video_id, classification, matched_pattern_id, affiliate_platform_id, retailer_pattern_id, affiliate_platform, resolved_retailer, link_type")
    .in("video_id", videoIds);

  const hasOwn = (links || []).some((l: any) => l.classification === "OWN");
  const hasCompetitor = (links || []).some((l: any) => l.classification === "COMPETITOR");

  let affiliateStatus = "NEUTRAL";
  if (hasOwn && hasCompetitor) affiliateStatus = "MIXED";
  else if (hasOwn) affiliateStatus = "WITH_US";
  else if (hasCompetitor) affiliateStatus = "COMPETITOR";

  // Legacy: collect pattern IDs for affiliate_names
  const allPatternIds = [...new Set(
    (links || []).filter((l: any) => l.matched_pattern_id && l.classification !== "NEUTRAL")
      .map((l: any) => l.matched_pattern_id)
  )];
  const legacyPlatformIds = [...new Set((links || []).map((l: any) => l.affiliate_platform_id).filter(Boolean))];
  const legacyRetailerIds = [...new Set((links || []).map((l: any) => l.retailer_pattern_id).filter(Boolean))];

  const allIds = [...new Set([...allPatternIds, ...legacyPlatformIds, ...legacyRetailerIds])];
  let patternsMap = new Map<string, { name: string; type: string }>();
  if (allIds.length > 0) {
    const { data: patternData } = await supabase.from("affiliate_patterns").select("id, name, type").in("id", allIds);
    for (const p of (patternData || [])) patternsMap.set(p.id, { name: p.name, type: p.type });
  }

  const affiliateNames = allPatternIds.map(id => patternsMap.get(id)?.name).filter(Boolean) as string[];
  const affiliatePlatformNames = [...new Set(legacyPlatformIds.map(id => patternsMap.get(id)?.name).filter(Boolean))] as string[];
  const retailerNames = [...new Set(legacyRetailerIds.map(id => patternsMap.get(id)?.name).filter(Boolean))] as string[];

  // NEW: platform_video_counts from affiliate_platform column
  const platformVideoSets = new Map<string, Set<string>>();
  // NEW: retailer_video_counts from resolved_retailer + direct retailer links
  const retailerVideoSets = new Map<string, Set<string>>();
  // NEW: retailer_via_affiliate (link_type = "both")
  const retailerViaAffiliateSets = new Map<string, Set<string>>();
  // NEW: retailer_direct (link_type = "retailer")
  const retailerDirectSets = new Map<string, Set<string>>();

  for (const l of (links || [])) {
    // Platform counts: use affiliate_platform text field
    if (l.affiliate_platform) {
      if (!platformVideoSets.has(l.affiliate_platform)) platformVideoSets.set(l.affiliate_platform, new Set());
      platformVideoSets.get(l.affiliate_platform)!.add(l.video_id);
    }

    // Retailer counts: resolved_retailer covers both "both" and "retailer" link_types
    if (l.resolved_retailer) {
      if (!retailerVideoSets.has(l.resolved_retailer)) retailerVideoSets.set(l.resolved_retailer, new Set());
      retailerVideoSets.get(l.resolved_retailer)!.add(l.video_id);

      if (l.link_type === "both") {
        if (!retailerViaAffiliateSets.has(l.resolved_retailer)) retailerViaAffiliateSets.set(l.resolved_retailer, new Set());
        retailerViaAffiliateSets.get(l.resolved_retailer)!.add(l.video_id);
      } else if (l.link_type === "retailer") {
        if (!retailerDirectSets.has(l.resolved_retailer)) retailerDirectSets.set(l.resolved_retailer, new Set());
        retailerDirectSets.get(l.resolved_retailer)!.add(l.video_id);
      }
    }

    // Also handle legacy: if no resolved_retailer but has retailer_pattern_id, use legacy name
    if (!l.resolved_retailer && l.retailer_pattern_id) {
      const rName = patternsMap.get(l.retailer_pattern_id)?.name;
      if (rName) {
        if (!retailerVideoSets.has(rName)) retailerVideoSets.set(rName, new Set());
        retailerVideoSets.get(rName)!.add(l.video_id);
        // Legacy links without link_type treated as direct
        if (!retailerDirectSets.has(rName)) retailerDirectSets.set(rName, new Set());
        retailerDirectSets.get(rName)!.add(l.video_id);
      }
    }

    // Also handle legacy platform: if no affiliate_platform but has affiliate_platform_id
    if (!l.affiliate_platform && l.affiliate_platform_id) {
      const pName = patternsMap.get(l.affiliate_platform_id)?.name;
      if (pName) {
        if (!platformVideoSets.has(pName)) platformVideoSets.set(pName, new Set());
        platformVideoSets.get(pName)!.add(l.video_id);
      }
    }
  }

  const platformVideoCounts: Record<string, number> = {};
  const retailerVideoCounts: Record<string, number> = {};
  const retailerViaAffiliateCounts: Record<string, number> = {};
  const retailerDirectCounts: Record<string, number> = {};

  for (const [name, s] of platformVideoSets) platformVideoCounts[name] = s.size;
  for (const [name, s] of retailerVideoSets) retailerVideoCounts[name] = s.size;
  for (const [name, s] of retailerViaAffiliateSets) retailerViaAffiliateCounts[name] = s.size;
  for (const [name, s] of retailerDirectSets) retailerDirectCounts[name] = s.size;

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
    retailer_via_affiliate_counts: retailerViaAffiliateCounts,
    retailer_direct_counts: retailerDirectCounts,
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
      const results = await Promise.allSettled(batch.map(chId => processChannel(supabase, chId)));
      for (const r of results) { if (r.status === "fulfilled" && r.value) updated++; }
    }

    return new Response(JSON.stringify({ success: true, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
