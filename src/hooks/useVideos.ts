import { useState, useEffect, useCallback, useRef } from "react";
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

export interface VideoFilters {
  title: string;
  channel: string;
  keyword: string;
  classification: string;
}

const PAGE_SIZE = 50;

async function resolveFilteredVideoIds(filters: VideoFilters): Promise<string[] | null> {
  // Returns null if no cross-table filters active (meaning "no restriction")
  // Returns array of video IDs if keyword or classification filters are active
  const needsKeywordFilter = filters.keyword.trim().length > 0;
  const needsClassificationFilter = filters.classification.length > 0;

  if (!needsKeywordFilter && !needsClassificationFilter) return null;

  const sets: Set<string>[] = [];

  if (needsKeywordFilter) {
    // Find keyword IDs matching the filter
    const { data: kwRows } = await supabase
      .from("keywords_search_runs")
      .select("id")
      .ilike("keyword", `%${filters.keyword.trim()}%`);
    const kwIds = kwRows?.map(k => k.id) ?? [];
    if (kwIds.length === 0) return []; // No matching keywords → no videos

    // Find video IDs linked to those keywords
    const { data: vkRows } = await supabase
      .from("video_keywords")
      .select("video_id")
      .in("keyword_id", kwIds);
    sets.push(new Set((vkRows ?? []).map(vk => vk.video_id)));
  }

  if (needsClassificationFilter) {
    const { data: linkRows } = await supabase
      .from("video_links")
      .select("video_id")
      .eq("classification", filters.classification);
    sets.push(new Set((linkRows ?? []).map(l => l.video_id)));
  }

  // Intersect all sets
  if (sets.length === 0) return null;
  let result = sets[0];
  for (let i = 1; i < sets.length; i++) {
    result = new Set([...result].filter(id => sets[i].has(id)));
  }
  return [...result];
}

export function useVideos(filters?: VideoFilters) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<VideoStats>({
    totalVideos: 0, totalLinks: 0, uniqueChannels: 0, uniquePlatforms: 0, uniqueRetailers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const fetchIdRef = useRef(0);

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
    } catch {
      toast.error("Failed to load video stats");
    }
    setIsStatsLoading(false);
  }, []);

  const fetchPage = useCallback(async (pageNum: number, currentFilters?: VideoFilters) => {
    const thisId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      const f = currentFilters ?? { title: "", channel: "", keyword: "", classification: "" };

      // Resolve cross-table filter IDs first
      const filteredIds = await resolveFilteredVideoIds(f);
      // If cross-table filters returned empty array, no results possible
      if (filteredIds !== null && filteredIds.length === 0) {
        if (thisId === fetchIdRef.current) {
          setVideos([]);
          setTotalCount(0);
          setHasMore(false);
          setIsLoading(false);
        }
        return;
      }

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Build filtered count query
      let countQuery = supabase.from("videos").select("*", { count: "exact", head: true });
      if (f.title.trim()) countQuery = countQuery.ilike("title", `%${f.title.trim()}%`);
      if (f.channel.trim()) countQuery = countQuery.ilike("channel_name", `%${f.channel.trim()}%`);
      if (filteredIds !== null) countQuery = countQuery.in("id", filteredIds);

      // Build data query
      let dataQuery = supabase.from("videos").select("*").order("created_at", { ascending: false }).range(from, to);
      if (f.title.trim()) dataQuery = dataQuery.ilike("title", `%${f.title.trim()}%`);
      if (f.channel.trim()) dataQuery = dataQuery.ilike("channel_name", `%${f.channel.trim()}%`);
      if (filteredIds !== null) dataQuery = dataQuery.in("id", filteredIds);

      const [countRes, dataRes] = await Promise.all([countQuery, dataQuery]);

      if (thisId !== fetchIdRef.current) return; // stale request

      if (dataRes.error) throw dataRes.error;
      const videoRows = dataRes.data ?? [];

      setTotalCount(countRes.count ?? 0);

      if (videoRows.length === 0) {
        setVideos([]);
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      setHasMore(videoRows.length === PAGE_SIZE);
      const videoIds = videoRows.map((v) => v.id);

      const [linksRes, vkRes] = await Promise.all([
        supabase.from("video_links").select("*").in("video_id", videoIds),
        supabase.from("video_keywords").select("video_id, keyword_id, search_rank").in("video_id", videoIds),
      ]);

      if (thisId !== fetchIdRef.current) return;

      const linksData = linksRes.data ?? [];
      const vkData = vkRes.data ?? [];

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

      if (thisId !== fetchIdRef.current) return;

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
      if (thisId === fetchIdRef.current) {
        toast.error("Failed to load videos");
      }
    }
    if (thisId === fetchIdRef.current) {
      setIsLoading(false);
    }
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(p);
    fetchPage(p, filters);
  }, [fetchPage, filters]);

  const refresh = useCallback(() => {
    fetchStats();
    fetchPage(page, filters);
  }, [fetchStats, fetchPage, page, filters]);

  // Re-fetch when filters change, reset to page 0
  const prevFiltersRef = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify(filters ?? {});
    if (prevFiltersRef.current !== key) {
      prevFiltersRef.current = key;
      setPage(0);
      fetchPage(0, filters);
    }
  }, [filters, fetchPage]);

  useEffect(() => {
    fetchStats();
    fetchPage(0, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videos, stats, isLoading, isStatsLoading, refresh, page, totalCount, hasMore, goToPage, pageSize: PAGE_SIZE };
}
