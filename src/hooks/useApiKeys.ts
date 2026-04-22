import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface YouTubeApiKey {
  id: string;
  api_key_last_4: string;
  label: string | null;
  is_active: boolean;
  daily_quota_limit: number;
  quota_used_today: number;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_used_at: string | null;
  created_at: string;
  quota_reset_at: string | null;
}

const TEST_KEYS_BATCH_SIZE = 20;
const TEST_KEYS_BATCH_DELAY_MS = 250;

export function useApiKeys() {
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["youtube-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("youtube_api_keys" as any)
        .select("id, label, is_active, daily_quota_limit, quota_used_today, last_tested_at, last_test_status, last_used_at, created_at, api_key_last_4, quota_reset_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as YouTubeApiKey[];
    },
  });

  const addKeys = useMutation({
    mutationFn: async (apiKeys: string[]): Promise<{ insertedIds: string[]; skipped: number; insertedLast4: Record<string, string> }> => {
      // Dedupe within paste (last-4 is too weak for cross-row dedupe; rely on server-side validation)
      const trimmed = apiKeys.map((k) => k.trim()).filter(Boolean);
      const seen = new Set<string>();
      const fresh: string[] = [];
      for (const k of trimmed) {
        if (seen.has(k)) continue;
        seen.add(k);
        fresh.push(k);
      }
      const skipped = trimmed.length - fresh.length;
      if (fresh.length === 0) throw new Error("No valid keys to add");

      const { data, error } = await supabase.functions.invoke("add-api-keys", {
        body: { keys: fresh, label_prefix: "Key", existing_count: keys.length },
      });
      if (error) throw error;
      const inserted = (data?.inserted ?? []) as { id: string; api_key_last_4: string }[];
      const insertedIds = inserted.map((r) => r.id);
      const insertedLast4: Record<string, string> = {};
      for (const r of inserted) insertedLast4[r.id] = r.api_key_last_4;
      try {
        await supabase.rpc("log_audit" as any, {
          _action: "api_keys_added",
          _target_type: "youtube_api_keys",
          _target_id: null,
          _details: { count: inserted.length, last4s: inserted.map((r) => r.api_key_last_4) },
        } as any);
      } catch { /* silent */ }
      return { insertedIds, skipped, insertedLast4 };
    },
    onSuccess: async ({ insertedIds, skipped, insertedLast4 }) => {
      queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
      if (skipped > 0) toast.message(`Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.`);
      if (insertedIds.length === 0) return;
      try {
        const results = await testKeys(insertedIds);
        const valid = results.filter((r) => r.status === "valid").length;
        const invalid = results.filter((r) => r.status === "invalid").length;
        const restricted = results.filter((r) => r.status === "restricted").length;
        toast.success(`Added ${insertedIds.length} key${insertedIds.length === 1 ? "" : "s"}: ${valid} valid, ${invalid} invalid, ${restricted} restricted`);
        if (invalid > 0) {
          const masked = results
            .filter((r) => r.status === "invalid")
            .map((r) => `…${insertedLast4[r.id] ?? "????"}`)
            .join(", ");
          if (masked) toast.error(`Invalid keys: ${masked}`);
        }
      } catch (e: any) {
        toast.error(`Auto-test failed: ${e.message}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("youtube_api_keys" as any)
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] }),
  });

  const deleteKeys = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("youtube_api_keys" as any)
        .delete()
        .in("id", ids);
      if (error) throw error;
      try {
        await supabase.rpc("log_audit" as any, {
          _action: "api_keys_deleted",
          _target_type: "youtube_api_keys",
          _target_id: null,
          _details: { count: ids.length, ids },
        } as any);
      } catch { /* silent */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
      toast.success("Keys deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetQuota = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reset_daily_quotas" as any);
      if (error) throw error;
      try {
        await supabase.rpc("log_audit" as any, {
          _action: "api_quota_reset",
          _target_type: "youtube_api_keys",
          _target_id: null,
          _details: null,
        } as any);
      } catch { /* silent */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
      toast.success("Quota reset and all keys re-activated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase
        .from("youtube_api_keys" as any)
        .update({ label } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] }),
  });

  const testKeys = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    const results: { id: string; status: string }[] = [];

    for (let index = 0; index < uniqueIds.length; index += TEST_KEYS_BATCH_SIZE) {
      const batch = uniqueIds.slice(index, index + TEST_KEYS_BATCH_SIZE);
      const { data, error } = await supabase.functions.invoke("test-api-key", {
        body: { key_ids: batch },
      });

      if (error) {
        throw error;
      }

      results.push(...((data?.results ?? []) as { id: string; status: string }[]));

      if (index + TEST_KEYS_BATCH_SIZE < uniqueIds.length) {
        await new Promise((resolve) => setTimeout(resolve, TEST_KEYS_BATCH_DELAY_MS));
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
    return results;
  };

  const activeKeys = keys.filter((k) => k.is_active && k.last_test_status !== "invalid" && k.last_test_status !== "restricted");
  const remainingCallsToday = activeKeys.reduce((sum, k) => {
    if (k.daily_quota_limit === 0) return sum + Math.max(0, 10000 - k.quota_used_today);
    return sum + Math.max(0, k.daily_quota_limit - k.quota_used_today);
  }, 0);

  const nextResetAt = (() => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0, 0));
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  })();

  const healthy = keys.filter((k) =>
    k.is_active &&
    k.last_test_status === "valid" &&
    !(k.daily_quota_limit > 0 && k.quota_used_today >= k.daily_quota_limit)
  ).length;
  const untested = keys.filter((k) => k.is_active && k.last_test_status == null).length;

  const stats = {
    total: keys.length,
    activeCount: activeKeys.length,
    healthy,
    untested,
    invalid: keys.filter((k) => k.last_test_status === "invalid").length,
    restricted: keys.filter((k) => k.last_test_status === "restricted").length,
    exhausted: keys.filter((k) => k.daily_quota_limit > 0 && k.quota_used_today >= k.daily_quota_limit).length,
    quotaUsed: keys
      .filter((k) => k.is_active)
      .reduce((sum, k) => sum + k.quota_used_today, 0),
    remainingCallsToday,
    nextResetAt,
  };

  return { keys, isLoading, stats, addKeys, toggleActive, deleteKeys, updateLabel, testKeys, resetQuota };
}
