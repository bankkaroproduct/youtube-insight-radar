import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Channel {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string | null;
  subscriber_count: number;
  total_videos_fetched: number;
  median_views: number;
  median_likes: number;
  median_comments: number;
  affiliate_status: string;
  affiliate_names: string[];
  affiliate_platform_names: string[];
  retailer_names: string[];
  last_analyzed_at: string | null;
  created_at: string;
  description: string | null;
  contact_email: string | null;
  youtube_category: string | null;
  is_relevant: boolean | null;
  relevance_reasoning: string | null;
  last_relevance_check_at: string | null;
  instagram_url: string | null;
  country: string | null;
  platform_video_counts: Record<string, number> | null;
  retailer_video_counts: Record<string, number> | null;
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .order("total_videos_fetched", { ascending: false });

    if (error) {
      toast.error("Failed to load channels");
    } else {
      setChannels((data as any[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  const recomputeStats = useCallback(async (channelIds?: string[]) => {
    try {
      const { error } = await supabase.functions.invoke("compute-channel-stats", {
        body: { channel_ids: channelIds || [] },
      });
      if (error) throw error;
      toast.success("Channel stats recomputed");
      fetchChannels();
    } catch (e: any) {
      toast.error("Failed to compute stats: " + e.message);
    }
  }, [fetchChannels]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return { channels, isLoading, refresh: fetchChannels, recomputeStats };
}
