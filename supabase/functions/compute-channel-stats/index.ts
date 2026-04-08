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
    .select("video_id, classification, affiliate_platform, resolved_retailer, link_type")
    .in("video_id", videoIds)
    .not("classification", "eq", "NEUTRAL");

  const hasOwn = (links || []).some((l: any) => l.classification === "OWN");
  const hasCompetitor = (links || []).some((l: any) => l.classification === "COMPETITOR");

  let affiliateStatus = "NEUTRAL";
  if (hasOwn && hasCompetitor) affiliateStatus = "MIXED";
  else if (hasOwn) affiliateStatus = "WITH_US";
  else if (hasCompetitor) affiliateStatus = "COMPETITOR";

  const platformVideoSets = new Map<string, Set<string>>();
  const retailerVideoSets = new Map<string, Set<string>>();
  const retailerViaAffiliateSets = new Map<string, Set<string>>();
  const retailerDirectSets = new Map<string, Set<string>>();

  const allPlatformNames = new Set<string>();
  const allRetailerNames = new Set<string>();

  const { data: allLinks } = await supabase
    .from("video_links")
    .select("video_id, affiliate_platform, resolved_retailer, link_type")
    .in("video_id", videoIds);

  for (const l of (allLinks || [])) {
    if (l.affiliate_platform) {
      allPlatformNames.add(l.affiliate_platform);
      if (!platformVideoSets.has(l.affiliate_platform)) platformVideoSets.set(l.affiliate_platform, new Set());
      platformVideoSets.get(l.affiliate_platform)!.add(l.video_id);
    }
    if (l.resolved_retailer) {
      allRetailerNames.add(l.resolved_retailer);
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
  }

  const platformVideoCounts: Record<string, number> = {};
  const retailerVideoCounts: Record<string, number> = {};
  const retailerViaAffiliateCounts: Record<string, number> = {};
  const retailerDirectCounts: Record<string, number> = {};

  for (const [name, videoSet] of platformVideoSets) platformVideoCounts[name] = videoSet.size;
  for (const [name, videoSet] of retailerVideoSets) retailerVideoCounts[name] = videoSet.size;
  for (const [name, videoSet] of retailerViaAffiliateSets) retailerViaAffiliateCounts[name] = videoSet.size;
  for (const [name, videoSet] of retailerDirectSets) retailerDirectCounts[name] = videoSet.size;

  const affiliateNames = [...new Set(
    (links || [])
      .map((l: any) => l.affiliate_platform || l.resolved_retailer)
      .filter(Boolean)
  )];

  await supabase.from("channels").update({
    total_videos_fetched: videos.length,
    median_views: computeMedian(views, 5),
    median_likes: computeMedian(likes, 5),
    median_comments: computeMedian(comments, 5),
    affiliate_status: affiliateStatus,
    affiliate_names: affiliateNames,
    affiliate_platform_names: [...allPlatformNames],
    retailer_names: [...allRetailerNames],
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

    const body = await req.json().catch(() => ({}));
    let channelIds: string[] = body.channel_ids || [];
    const batchSize = body.batch_size || 3;
    // Track run start time to accurately count remaining channels
    const runStartTime = body.run_start || new Date().toISOString();

    // If no specific channels, pick the next batch that needs recomputing
    if (channelIds.length === 0) {
      const { data } = await supabase
        .from("channels")
        .select("channel_id")
        .order("last_analyzed_at", { ascending: true, nullsFirst: true })
        .limit(batchSize);
      channelIds = (data || []).map((c: any) => c.channel_id);
    }

    if (channelIds.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    // Process sequentially to stay within CPU limits
    for (const chId of channelIds) {
      try {
        const ok = await processChannel(supabase, chId);
        if (ok) updated++;
      } catch (e) {
        console.error(`Failed channel ${chId}:`, e.message);
      }
    }

    // Count remaining channels not yet analyzed or analyzed before this run started
    const { count } = await supabase
      .from("channels")
      .select("channel_id", { count: "exact", head: true })
      .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${runStartTime}`);

    return new Response(JSON.stringify({ success: true, updated, remaining: count || 0, batch_size: channelIds.length, run_start: runStartTime }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
