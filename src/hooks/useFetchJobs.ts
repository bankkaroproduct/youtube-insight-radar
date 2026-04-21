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
  attempt_count: number;
  max_attempts: number;
  last_failure_reason: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function useFetchJobs() {
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const shownToasts = useRef<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("fetch_jobs")
      .select("*")
      .or(`status.in.(pending,processing,dead_letter),created_at.gte.${twoHoursAgo}`)
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

  const clearFinished = async () => {
    const finishedIds = jobs.filter((j) => j.status === "completed" || j.status === "failed").map((j) => j.id);
    if (finishedIds.length === 0) return;
    const { error } = await supabase.from("fetch_jobs").delete().in("id", finishedIds);
    if (error) {
      toast.error("Failed to clear finished jobs");
    } else {
      setJobs((prev) => prev.filter((j) => !finishedIds.includes(j.id)));
    }
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

  const retryJob = async (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const nextAttempt = (job.attempt_count ?? 0) + 1;
    const newStatus = nextAttempt >= job.max_attempts ? "dead_letter" : "pending";
    const { error } = await supabase.from("fetch_jobs")
      .update({ status: newStatus, attempt_count: nextAttempt, started_at: null, completed_at: null })
      .eq("id", id);
    if (error) return toast.error("Retry failed");
    if (newStatus === "dead_letter") toast.warning("Max attempts reached — moved to dead letter");
    else {
      toast.success("Job queued for retry");
      await supabase.functions.invoke("process-fetch-queue", { body: {} });
    }
  };

  return { jobs, fetchJobs, clearFinished, killAll, retryJob };
}
