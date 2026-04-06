import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VideoLink {
  id: string;
  original_url: string;
  unshortened_url: string | null;
  domain: string | null;
  original_domain: string | null;
  classification: string | null;
  matched_pattern_id: string | null;
  affiliate_platform_id: string | null;
  retailer_pattern_id: string | null;
  affiliate_name: string | null;
  platform_name: string | null;
  retailer_name: string | null;
}

export interface VideoKeyword {
  id: string;
  keyword: string;
  search_rank: number | null;
}

export interface Video {
  id: string;
  video_id: string;
  keyword_id: string | null;
  channel_id: string;
  channel_name: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  links: VideoLink[];
  keywords: VideoKeyword[];
  best_rank: number | null;
}

export interface VideoStats {
  totalVideos: number;
  totalLinks: number;
  uniqueChannels: number;
  uniquePlatforms: number;
  uniqueRetailers: number;
}

const PAGE_SIZE = 50;

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<VideoStats>({
    totalVideos: 0, totalLinks: 0, uniqueChannels: 0, uniquePlatforms: 0, uniqueRetailers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // --- Fetch stats with 5 parallel lightweight queries ---
  const fetchStats = useCallback(async () => {
    setIsStatsLoading(true);
    try {
      const [videosRes, linksRes, channelsRes, platformsRes, retailersRes] = await Promise.all([
        supabase.from("videos").select("*", { count: "exact", head: true }),
        supabase.from("video_links").select("*", { count: "exact", head: true }),
        supabase.from("channels").select("*", { count: "exact", head: true }),
        supabase.from("video_links").select("affiliate_platform").not("affiliate_platform", "is", null),
        supabase.from("video_links").select("resolved_retailer").not("resolved_retailer", "is", null),
      ]);

      const uniquePlatforms = new Set(platformsRes.data?.map((p: any) => p.affiliate_platform)).size;
      const uniqueRetailers = new Set(retailersRes.data?.map((r: any) => r.resolved_retailer)).size;

      setStats({
        totalVideos: videosRes.count ?? 0,
        totalLinks: linksRes.count ?? 0,
        uniqueChannels: channelsRes.count ?? 0,
        uniquePlatforms,
        uniqueRetailers,
      });
      setTotalCount(videosRes.count ?? 0);
    } catch {
      toast.error("Failed to load video stats");
    }
    setIsStatsLoading(false);
  }, []);

  // --- Fetch a single page of videos with their links and keywords ---
  const fetchPage = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: videoRows, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      if (!videoRows || videoRows.length === 0) {
        setVideos([]);
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      setHasMore(videoRows.length === PAGE_SIZE);
      const videoIds = videoRows.map((v) => v.id);

      // Fetch links and video_keywords for just this page in parallel
      const [linksRes, vkRes] = await Promise.all([
        supabase.from("video_links").select("*").in("video_id", videoIds),
        supabase.from("video_keywords").select("video_id, keyword_id, search_rank").in("video_id", videoIds),
      ]);

      const linksData = linksRes.data ?? [];
      const vkData = vkRes.data ?? [];

      // Fetch keyword names
      const keywordIds = [...new Set(vkData.map((vk) => vk.keyword_id).filter(Boolean))];
      let keywordsMap = new Map<string, string>();
      if (keywordIds.length > 0) {
        const { data: kwRows } = await supabase
          .from("keywords_search_runs")
          .select("id, keyword")
          .in("id", keywordIds);
        for (const k of kwRows ?? []) {
          keywordsMap.set(k.id, k.keyword);
        }
      }

      const linksByVideo = new Map<string, VideoLink[]>();
      for (const link of linksData) {
        const list = linksByVideo.get(link.video_id) || [];
        list.push({
          ...link,
          affiliate_name: link.affiliate_platform || link.resolved_retailer || null,
          platform_name: link.affiliate_platform || null,
          retailer_name: link.resolved_retailer || null,
        });
        linksByVideo.set(link.video_id, list);
      }

      const keywordsByVideo = new Map<string, VideoKeyword[]>();
      const bestRankByVideo = new Map<string, number>();
      for (const vk of vkData) {
        const list = keywordsByVideo.get(vk.video_id) || [];
        const kwName = keywordsMap.get(vk.keyword_id);
        if (kwName) {
          list.push({ id: vk.keyword_id, keyword: kwName, search_rank: vk.search_rank ?? null });
        }
        keywordsByVideo.set(vk.video_id, list);
        if (vk.search_rank != null) {
          const current = bestRankByVideo.get(vk.video_id);
          if (current == null || vk.search_rank < current) {
            bestRankByVideo.set(vk.video_id, vk.search_rank);
          }
        }
      }

      setVideos(
        videoRows.map((v) => ({
          ...v,
          view_count: v.view_count ?? 0,
          like_count: v.like_count ?? 0,
          comment_count: v.comment_count ?? 0,
          links: linksByVideo.get(v.id) || [],
          keywords: keywordsByVideo.get(v.id) || [],
          best_rank: bestRankByVideo.get(v.id) ?? null,
        }))
      );
    } catch {
      toast.error("Failed to load videos");
    }
    setIsLoading(false);
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(p);
    fetchPage(p);
  }, [fetchPage]);

  const refresh = useCallback(() => {
    fetchStats();
    fetchPage(page);
  }, [fetchStats, fetchPage, page]);

  useEffect(() => {
    fetchStats();
    fetchPage(0);
  }, [fetchStats, fetchPage]);

  return { videos, stats, isLoading, isStatsLoading, refresh, page, totalCount, hasMore, goToPage, pageSize: PAGE_SIZE };
}
