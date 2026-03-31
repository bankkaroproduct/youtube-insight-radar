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

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);

    const { data: videosData, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Failed to load videos");
      setIsLoading(false);
      return;
    }

    const videoRows = (videosData as any[]) ?? [];

    if (videoRows.length === 0) {
      setVideos([]);
      setIsLoading(false);
      return;
    }

    const videoIds = videoRows.map((v) => v.id);

    const [linksResult, vkResult] = await Promise.all([
      supabase.from("video_links").select("*").in("video_id", videoIds),
      supabase.from("video_keywords").select("video_id, keyword_id, search_rank").in("video_id", videoIds),
    ]);

    const linksData = (linksResult.data ?? []) as any[];
    const vkData = (vkResult.data ?? []) as any[];

    // Collect all pattern IDs (matched, platform, retailer)
    const allPatternIds = new Set<string>();
    for (const l of linksData) {
      if (l.matched_pattern_id) allPatternIds.add(l.matched_pattern_id);
      if (l.affiliate_platform_id) allPatternIds.add(l.affiliate_platform_id);
      if (l.retailer_pattern_id) allPatternIds.add(l.retailer_pattern_id);
    }

    let patternsMap = new Map<string, string>();
    if (allPatternIds.size > 0) {
      const { data: patternsData } = await supabase
        .from("affiliate_patterns")
        .select("id, name")
        .in("id", [...allPatternIds]);
      for (const p of (patternsData ?? []) as any[]) {
        patternsMap.set(p.id, p.name);
      }
    }

    const keywordIds = [...new Set(vkData.map((vk) => vk.keyword_id).filter(Boolean))];
    let keywordsMap = new Map<string, string>();
    if (keywordIds.length > 0) {
      const { data: kwData } = await supabase
        .from("keywords_search_runs")
        .select("id, keyword")
        .in("id", keywordIds);
      for (const k of (kwData ?? []) as any[]) {
        keywordsMap.set(k.id, k.keyword);
      }
    }

    const linksByVideo = new Map<string, VideoLink[]>();
    for (const link of linksData) {
      const list = linksByVideo.get(link.video_id) || [];
      list.push({
        ...link,
        affiliate_name: link.matched_pattern_id
          ? patternsMap.get(link.matched_pattern_id) || null
          : null,
        platform_name: link.affiliate_platform_id
          ? patternsMap.get(link.affiliate_platform_id) || null
          : null,
        retailer_name: link.retailer_pattern_id
          ? patternsMap.get(link.retailer_pattern_id) || null
          : null,
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
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return { videos, isLoading, refresh: fetchVideos };
}
