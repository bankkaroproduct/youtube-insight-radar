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
  youtube_total_videos: number | null;
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    const BATCH = 1000;
    let allRows: any[] = [];
    let from = 0;
    try {
      while (true) {
        const { data, error } = await supabase
          .from("channels")
          .select("*")
          .gt("total_videos_fetched", 0)
          .order("total_videos_fetched", { ascending: false })
          .range(from, from + BATCH - 1);

        if (error) throw error;
        const rows = data ?? [];
        allRows = allRows.concat(rows);
        if (rows.length < BATCH) break;
        from += BATCH;
      }
      setChannels(allRows as any[]);
    } catch {
      toast.error("Failed to load channels");
    }
    setIsLoading(false);
  }, []);

  const recomputeStats = useCallback(async (channelIds?: string[]) => {
    try {
      if (channelIds && channelIds.length > 0) {
        // Process specific channels in batches of 5
        for (let i = 0; i < channelIds.length; i += 5) {
          const batch = channelIds.slice(i, i + 5);
          const { error } = await supabase.functions.invoke("compute-channel-stats", {
            body: { channel_ids: batch },
          });
          if (error) throw error;
        }
      } else {
        // Process all channels in auto-batched loop
        let totalUpdated = 0;
        while (true) {
          const { data, error } = await supabase.functions.invoke("compute-channel-stats", {
            body: { batch_size: 5 },
          });
          if (error) throw error;
          totalUpdated += data.updated || 0;
          if (!data.remaining || data.remaining === 0) break;
        }
      }
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
