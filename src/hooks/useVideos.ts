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

const BATCH_SIZE = 1000;

async function fetchAllRows<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  let allRows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    allRows = allRows.concat(rows);
    if (rows.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return allRows;
}

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);

    try {
      const videoRows = await fetchAllRows<any>((from, to) =>
        supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      if (videoRows.length === 0) {
        setVideos([]);
        setIsLoading(false);
        return;
      }

      const videoIds = videoRows.map((v) => v.id);

      // Chunk videoIds into groups of 200 to avoid URL length limits on .in() queries
      const ID_CHUNK = 200;
      const idChunks: string[][] = [];
      for (let i = 0; i < videoIds.length; i += ID_CHUNK) {
        idChunks.push(videoIds.slice(i, i + ID_CHUNK));
      }

      // Fetch links and video_keywords in chunked batches, parallelized
      const [linksData, vkData] = await Promise.all([
        Promise.all(
          idChunks.map((chunk) =>
            fetchAllRows<any>((from, to) =>
              supabase.from("video_links").select("*").in("video_id", chunk).range(from, to)
            )
          )
        ).then((results) => results.flat()),
        Promise.all(
          idChunks.map((chunk) =>
            fetchAllRows<any>((from, to) =>
              supabase.from("video_keywords").select("video_id, keyword_id, search_rank").in("video_id", chunk).range(from, to)
            )
          )
        ).then((results) => results.flat()),
      ]);

      const keywordIds = [...new Set(vkData.map((vk) => vk.keyword_id).filter(Boolean))];
      let keywordsMap = new Map<string, string>();
      if (keywordIds.length > 0) {
        const kwRows = await fetchAllRows<any>((from, to) =>
          supabase
            .from("keywords_search_runs")
            .select("id, keyword")
            .in("id", keywordIds)
            .range(from, to)
        );
        for (const k of kwRows) {
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
    } catch (error) {
      toast.error("Failed to load videos");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return { videos, isLoading, refresh: fetchVideos };
}
