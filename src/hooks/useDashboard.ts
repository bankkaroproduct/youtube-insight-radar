import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RecentJob {
  id: string;
  keyword: string;
  status: string;
  videos_found: number | null;
  completed_at: string | null;
}

interface AffiliateSlice { name: string; count: number; }

export function useDashboard() {
  const [counts, setCounts] = useState({ keywords: 0, videos: 0, channels: 0, links: 0 });
  const [recent, setRecent] = useState<RecentJob[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateSlice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [kw, vids, chs, lks, recentJobs, affClassifications] = await Promise.all([
        supabase.from("keywords_search_runs").select("id", { count: "exact", head: true }),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("channels").select("id", { count: "exact", head: true }).gt("total_videos_fetched", 0),
        supabase.from("video_links").select("id", { count: "exact", head: true }),
        supabase
          .from("fetch_jobs")
          .select("id, keyword, status, videos_found, completed_at")
          .in("status", ["completed", "failed", "dead_letter"])
          .order("completed_at", { ascending: false, nullsFirst: false })
          .limit(8),
        supabase.rpc("get_affiliate_classification_stats"),
      ]);
      setCounts({
        keywords: kw.count ?? 0,
        videos: vids.count ?? 0,
        channels: chs.count ?? 0,
        links: lks.count ?? 0,
      });
      setRecent((recentJobs.data as RecentJob[]) ?? []);
      setAffiliates(
        ((affClassifications.data as any[]) ?? []).map((r) => ({
          name: r.classification || "NEUTRAL",
          count: Number(r.count),
        })),
      );
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { counts, recent, affiliates, isLoading, lastUpdated, refresh: load };
}
