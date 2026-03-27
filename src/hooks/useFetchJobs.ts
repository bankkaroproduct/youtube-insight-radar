import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FetchJob {
  id: string;
  keyword_id: string | null;
  keyword: string;
  status: string;
  videos_found: number | null;
  order_by: string;
  published_after: string | null;
  variations_searched: string[] | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function useFetchJobs() {
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const shownToasts = useRef<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("fetch_jobs")
      .select("*")
      .or(`status.in.(pending,processing),created_at.gte.${twoHoursAgo}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setJobs(data as FetchJob[]);
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel("fetch-jobs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fetch_jobs" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newJob = payload.new as FetchJob;
          setJobs((prev) => [newJob, ...prev].slice(0, 20));
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as FetchJob;
          setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
          if (!shownToasts.current.has(updated.id)) {
            if (updated.status === "completed") {
              shownToasts.current.add(updated.id);
              toast.success(`Fetch complete: "${updated.keyword}" — ${updated.videos_found ?? 0} videos`);
            } else if (updated.status === "failed") {
              shownToasts.current.add(updated.id);
              toast.error(`Fetch failed: "${updated.keyword}"`);
            }
          }
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setJobs((prev) => prev.filter((j) => j.id !== old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const visibleJobs = jobs.filter((j) => !clearedIds.has(j.id));

  const clearFinished = () => {
    const finishedIds = jobs.filter((j) => j.status === "completed" || j.status === "failed").map((j) => j.id);
    setClearedIds((prev) => new Set([...prev, ...finishedIds]));
  };

  const killAll = async () => {
    const { error } = await supabase.functions.invoke("queue-fetch-jobs", {
      body: { action: "kill-all" },
    });
    if (error) toast.error("Failed to kill jobs");
    else {
      toast.success("All active jobs cancelled");
      fetchJobs();
    }
  };

  return { jobs: visibleJobs, fetchJobs, clearFinished, killAll };
}
