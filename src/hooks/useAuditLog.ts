import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export const AUDIT_PAGE_SIZE = 50;

export function useAuditLog(page: number, actionFilter: string) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      let q: any = supabase.from("audit_log").select("*", { count: "exact" });
      if (actionFilter) q = q.eq("action", actionFilter);
      q = q
        .order("created_at", { ascending: false })
        .range(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE - 1);
      const { data, count } = await q;
      setEntries((data as AuditEntry[]) ?? []);
      setTotalCount(count ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, totalCount, isLoading, refresh: load };
}
