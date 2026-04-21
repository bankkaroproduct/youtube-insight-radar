import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface YouTubeApiKey {
  id: string;
  api_key: string;
  label: string | null;
  is_active: boolean;
  daily_quota_limit: number;
  quota_used_today: number;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_used_at: string | null;
  created_at: string;
}

export function useApiKeys() {
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["youtube-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("youtube_api_keys" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as YouTubeApiKey[];
    },
  });

  const addKeys = useMutation({
    mutationFn: async (apiKeys: string[]): Promise<{ insertedIds: string[]; skipped: number }> => {
      const existing = new Set(keys.map((k) => k.api_key));
      const trimmed = apiKeys.map((k) => k.trim()).filter(Boolean);
      const seen = new Set<string>();
      const fresh: string[] = [];
      for (const k of trimmed) {
        if (existing.has(k) || seen.has(k)) continue;
        seen.add(k);
        fresh.push(k);
      }
      const skipped = trimmed.length - fresh.length;
      if (fresh.length === 0) {
        throw new Error("All pasted keys already exist");
      }
      const rows = fresh.map((key, i) => ({
        api_key: key,
        label: `Key #${keys.length + i + 1}`,
      }));
      const { data, error } = await supabase
        .from("youtube_api_keys" as any)
        .insert(rows as any)
        .select("id, api_key");
      if (error) throw error;
      const insertedIds = ((data as any[]) || []).map((r) => r.id);
      return { insertedIds, skipped };
    },
    onSuccess: async ({ insertedIds, skipped }) => {
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
          const { data: invalidKeys } = await supabase
            .from("youtube_api_keys" as any)
            .select("api_key")
            .in("id", results.filter((r) => r.status === "invalid").map((r) => r.id));
          const masked = ((invalidKeys as any[]) || [])
            .map((k) => `…${(k.api_key as string).slice(-4)}`)
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
    const { data, error } = await supabase.functions.invoke("test-api-key", {
      body: { key_ids: ids },
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
    return data.results as { id: string; status: string }[];
  };

  const stats = {
    total: keys.length,
    healthy: keys.filter((k) => k.is_active && k.last_test_status !== "invalid" && k.last_test_status !== "quota_exceeded" && k.last_test_status !== "restricted").length,
    invalid: keys.filter((k) => k.last_test_status === "invalid").length,
    restricted: keys.filter((k) => k.last_test_status === "restricted").length,
    exhausted: keys.filter((k) => k.daily_quota_limit > 0 && k.quota_used_today >= k.daily_quota_limit).length,
    quotaUsed: keys
      .filter((k) => k.is_active)
      .reduce((sum, k) => sum + k.quota_used_today, 0),
  };

  return { keys, isLoading, stats, addKeys, toggleActive, deleteKeys, updateLabel, testKeys, resetQuota };
}
