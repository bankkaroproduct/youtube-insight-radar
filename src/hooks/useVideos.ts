import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VideoLink {
  id: string;
  original_url: string;
  unshortened_url: string | null;
  domain: string | null;
  classification: string | null;
  matched_pattern_id: string | null;
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

    // Fetch all video_links for these videos
    const videoIds = videoRows.map((v) => v.id);
    const { data: linksData } = await supabase
      .from("video_links")
      .select("*")
      .in("video_id", videoIds);

    const linksByVideo = new Map<string, VideoLink[]>();
    for (const link of (linksData ?? []) as any[]) {
      const list = linksByVideo.get(link.video_id) || [];
      list.push(link);
      linksByVideo.set(link.video_id, list);
    }

    setVideos(
      videoRows.map((v) => ({
        ...v,
        view_count: v.view_count ?? 0,
        like_count: v.like_count ?? 0,
        comment_count: v.comment_count ?? 0,
        links: linksByVideo.get(v.id) || [],
      }))
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return { videos, isLoading, refresh: fetchVideos };
}
