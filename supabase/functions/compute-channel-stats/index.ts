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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    let channelIds: string[] = body.channel_ids || [];

    // If no specific channels, compute for all
    if (channelIds.length === 0) {
      const { data } = await supabase.from("channels").select("channel_id");
      channelIds = (data || []).map((c: any) => c.channel_id);
    }

    let updated = 0;

    for (const chId of channelIds) {
      // Get all videos for this channel
      const { data: videos } = await supabase
        .from("videos")
        .select("id, view_count, like_count, comment_count")
        .eq("channel_id", chId);

      if (!videos || videos.length === 0) continue;

      const views = videos.map(v => Number(v.view_count || 0));
      const likes = videos.map(v => Number(v.like_count || 0));
      const comments = videos.map(v => Number(v.comment_count || 0));

      const medianViews = computeMedian(views, 5);
      const medianLikes = computeMedian(likes, 5);
      const medianComments = computeMedian(comments, 5);

      // Get all links for this channel's videos
      const videoIds = videos.map(v => v.id);
      const { data: links } = await supabase
        .from("video_links")
        .select("classification, matched_pattern_id")
        .in("video_id", videoIds)
        .not("classification", "eq", "NEUTRAL");

      const hasOwn = (links || []).some(l => l.classification === "OWN");
      const hasCompetitor = (links || []).some(l => l.classification === "COMPETITOR");

      let affiliateStatus = "NEUTRAL";
      if (hasOwn && hasCompetitor) affiliateStatus = "MIXED";
      else if (hasOwn) affiliateStatus = "WITH_US";
      else if (hasCompetitor) affiliateStatus = "COMPETITOR";

      // Get ALL affiliate names (OWN + COMPETITOR)
      const allPatternIds = [...new Set(
        (links || [])
          .filter(l => l.matched_pattern_id && l.classification !== "NEUTRAL")
          .map(l => l.matched_pattern_id)
      )];

      let affiliateNames: string[] = [];
      if (allPatternIds.length > 0) {
        const { data: patternData } = await supabase
          .from("affiliate_patterns")
          .select("name")
          .in("id", allPatternIds);
        affiliateNames = (patternData || []).map(p => p.name);
      }

      await supabase.from("channels").update({
        total_videos_fetched: videos.length,
        median_views: medianViews,
        median_likes: medianLikes,
        median_comments: medianComments,
        affiliate_status: affiliateStatus,
        affiliate_names: affiliateNames,
        last_analyzed_at: new Date().toISOString(),
      }).eq("channel_id", chId);

      updated++;
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
