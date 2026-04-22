import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const CHANNELS_PAGE_SIZE = 50;

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

export interface ChannelFilters {
  name: string;
  status: string;
  category: string;
  relevance: string;
  country: string;
}

function applyFilters(q: any, filters: ChannelFilters) {
  if (filters.name) q = q.ilike("channel_name", `%${filters.name}%`);
  if (filters.status) {
    if (filters.status === "NEUTRAL") {
      q = q.or("affiliate_status.is.null,affiliate_status.eq.NEUTRAL");
    } else {
      q = q.eq("affiliate_status", filters.status);
    }
  }
  if (filters.category) q = q.ilike("youtube_category", `%${filters.category}%`);
  if (filters.country) q = q.ilike("country", `%${filters.country}%`);
  if (filters.relevance === "yes") q = q.eq("is_relevant", true);
  if (filters.relevance === "no") q = q.eq("is_relevant", false);
  if (filters.relevance === "unchecked") q = q.is("is_relevant", null);
  return q;
}

function sortColumn(sortKey: string | null): string {
  switch (sortKey) {
    case "subscribers": return "subscriber_count";
    case "videos": return "total_videos_fetched";
    case "views": return "median_views";
    case "likes": return "median_likes";
    case "status": return "affiliate_status";
    case "category": return "youtube_category";
    case "country": return "country";
    case "name": return "channel_name";
    case "relevance": return "is_relevant";
    default: return "total_videos_fetched";
  }
}

export function useChannels(
  filters: ChannelFilters,
  page: number,
  sortKey: string | null,
  sortDir: "asc" | "desc",
) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const thisId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      const from = page * CHANNELS_PAGE_SIZE;
      const to = from + CHANNELS_PAGE_SIZE - 1;
      let q: any = supabase
        .from("channels")
        .select("*", { count: "exact" })
        .gt("total_videos_fetched", 0);
      q = applyFilters(q, filters);
      q = q
        .order(sortColumn(sortKey), { ascending: sortDir === "asc", nullsFirst: false })
        .order("channel_id", { ascending: true })
        .range(from, to);

      const { data, count, error } = await q;
      if (thisId !== fetchIdRef.current) return;
      if (error) throw error;
      setChannels((data as Channel[]) ?? []);
      setTotalCount(count ?? 0);
    } catch {
      if (thisId === fetchIdRef.current) toast.error("Failed to load channels");
    } finally {
      if (thisId === fetchIdRef.current) setIsLoading(false);
    }
  }, [filters, page, sortKey, sortDir]);

  useEffect(() => { load(); }, [load]);

  const isRecomputingRef = useRef(false);
  const stopRecomputeRef = useRef(false);
  const [isRecomputing, setIsRecomputing] = useState(false);

  const stopRecompute = useCallback(() => {
    stopRecomputeRef.current = true;
    toast.message("Stopping recompute after current batch…");
  }, []);

  const recomputeStats = useCallback(async (channelIds?: string[]) => {
    if (isRecomputingRef.current) {
      toast.message("Recompute already in progress");
      return;
    }
    isRecomputingRef.current = true;
    stopRecomputeRef.current = false;
    setIsRecomputing(true);
    const t = toast.loading("Recomputing channel stats…");
    let processed = 0;
    let failed = 0;
    let batchNum = 0;
    try {
      if (channelIds && channelIds.length > 0) {
        for (let i = 0; i < channelIds.length; i += 5) {
          if (stopRecomputeRef.current) break;
          const batch = channelIds.slice(i, i + 5);
          try {
            const { error } = await supabase.functions.invoke("compute-channel-stats", {
              body: { channel_ids: batch },
            });
            if (error) throw error;
            processed += batch.length;
          } catch (e: any) {
            failed += batch.length;
            console.error("[recomputeStats] batch failed:", e?.message);
          }
          batchNum++;
          toast.loading(
            `Recomputing… ${processed} done${failed ? `, ${failed} failed` : ""} (${i + batch.length}/${channelIds.length})`,
            { id: t },
          );
          if (batchNum % 10 === 0) load();
        }
      } else {
        while (!stopRecomputeRef.current) {
          let remaining: number | undefined;
          try {
            const { data, error } = await supabase.functions.invoke("compute-channel-stats", {
              body: { batch_size: 5 },
            });
            if (error) throw error;
            processed += 5;
            remaining = data?.remaining;
          } catch (e: any) {
            failed += 5;
            console.error("[recomputeStats] batch failed:", e?.message);
          }
          batchNum++;
          toast.loading(
            `Recomputing… ${processed} done${failed ? `, ${failed} failed` : ""}${remaining !== undefined ? ` (~${remaining} left)` : ""}`,
            { id: t },
          );
          if (batchNum % 10 === 0) load();
          if (remaining === 0) break;
        }
      }
      const stoppedMsg = stopRecomputeRef.current ? " (stopped)" : "";
      toast.success(
        `Recompute done${stoppedMsg}. ${processed} updated${failed ? `, ${failed} failed` : ""}.`,
        { id: t },
      );
      load();
    } catch (e: any) {
      toast.error("Failed to compute stats: " + e.message, { id: t });
    } finally {
      isRecomputingRef.current = false;
      stopRecomputeRef.current = false;
      setIsRecomputing(false);
    }
  }, [load]);

  return { channels, totalCount, isLoading, refresh: load, recomputeStats, isRecomputing, stopRecompute };
}

/** Fetches ALL channels matching the filters across pages. For CSV export. */
export async function fetchAllChannelsForExport(filters: ChannelFilters): Promise<Channel[]> {
  const BATCH = 1000;
  let all: Channel[] = [];
  let from = 0;
  while (true) {
    let q: any = supabase
      .from("channels")
      .select("*")
      .gt("total_videos_fetched", 0);
    q = applyFilters(q, filters);
    q = q
      .order("total_videos_fetched", { ascending: false })
      .order("channel_id", { ascending: true })
      .range(from, from + BATCH - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data as Channel[]) ?? [];
    all = all.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return all;
}
