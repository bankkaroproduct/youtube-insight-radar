import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type IpEntry = Database["public"]["Tables"]["ip_whitelist"]["Row"];

export function useIpWhitelist() {
  const [entries, setEntries] = useState<IpEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIp, setCurrentIp] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("ip_whitelist")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load IP whitelist");
    } else {
      setEntries(data ?? []);
    }
    setIsLoading(false);
  }, []);

  const detectCurrentIp = useCallback(async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await supabase.functions.invoke("check-ip");
      if (res.data?.ip) {
        setCurrentIp(res.data.ip);
      }
    } catch {
      // silent
    }
  }, []);

  const addIp = async (ipAddress: string, description?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("ip_whitelist").insert({
      ip_address: ipAddress.trim(),
      description: description?.trim() || null,
      created_by: user?.id ?? null,
    });
    if (error) {
      if (error.code === "23505") {
        toast.error("This IP is already in the whitelist");
      } else {
        toast.error("Failed to add IP: " + error.message);
      }
      return false;
    }
    toast.success(`Added IP ${ipAddress}`);
    await fetchEntries();
    return true;
  };

  const removeIp = async (id: string) => {
    const { error } = await supabase.from("ip_whitelist").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove IP");
      return;
    }
    toast.success("IP removed");
    await fetchEntries();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("ip_whitelist")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update IP status");
      return;
    }
    await fetchEntries();
  };

  useEffect(() => {
    fetchEntries();
    detectCurrentIp();
  }, [fetchEntries, detectCurrentIp]);

  return { entries, isLoading, currentIp, addIp, removeIp, toggleActive, refresh: fetchEntries };
}

export async function checkIpAccess(): Promise<{ allowed: boolean; ip: string }> {
  try {
    const res = await supabase.functions.invoke("check-ip");
    return res.data ?? { allowed: true, ip: "unknown" };
  } catch {
    return { allowed: true, ip: "unknown" };
  }
}
