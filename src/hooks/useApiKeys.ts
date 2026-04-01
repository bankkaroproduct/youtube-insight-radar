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
    mutationFn: async (apiKeys: string[]) => {
      const rows = apiKeys.map((key, i) => ({
        api_key: key.trim(),
        label: `Key #${keys.length + i + 1}`,
      }));
      const { error } = await supabase.from("youtube_api_keys" as any).insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-api-keys"] });
      toast.success("Keys added successfully");
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
      // Re-activate all keys
      const { error: err2 } = await supabase
        .from("youtube_api_keys" as any)
        .update({ is_active: true, last_test_status: null } as any)
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (err2) throw err2;
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
    healthy: keys.filter((k) => k.is_active && k.last_test_status !== "invalid" && k.last_test_status !== "quota_exceeded").length,
    invalid: keys.filter((k) => k.last_test_status === "invalid").length,
    exhausted: keys.filter((k) => k.daily_quota_limit > 0 && k.quota_used_today >= k.daily_quota_limit).length,
    quotaUsed: keys
      .filter((k) => k.is_active)
      .reduce((sum, k) => sum + k.quota_used_today, 0),
  };

  return { keys, isLoading, stats, addKeys, toggleActive, deleteKeys, updateLabel, testKeys, resetQuota };
}
