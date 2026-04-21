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
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
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

      const [kw, vids, chs, lks, recentJobs, aff] = results;

      setCounts({
        keywords: kw.status === "fulfilled" ? (kw.value as any).count ?? 0 : 0,
        videos: vids.status === "fulfilled" ? (vids.value as any).count ?? 0 : 0,
        channels: chs.status === "fulfilled" ? (chs.value as any).count ?? 0 : 0,
        links: lks.status === "fulfilled" ? (lks.value as any).count ?? 0 : 0,
      });
      if (recentJobs.status === "fulfilled") {
        setRecent(((recentJobs.value as any).data as RecentJob[]) ?? []);
      }
      if (aff.status === "fulfilled") {
        setAffiliates(
          (((aff.value as any).data as any[]) ?? []).map((r) => ({
            name: r.classification || "NEUTRAL",
            count: Number(r.count),
          })),
        );
      }

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) setError(`${failed.length} dashboard widget(s) failed to load`);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { counts, recent, affiliates, isLoading, lastUpdated, error, refresh: load };
}
