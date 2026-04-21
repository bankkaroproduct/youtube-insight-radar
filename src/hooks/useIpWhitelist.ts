import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type IpEntry = Database["public"]["Tables"]["ip_whitelist"]["Row"];

export function isValidIpOrCidr(input: string): boolean {
  const trimmed = input.trim();
  const ipv4Cidr = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
  if (!ipv4Cidr.test(trimmed)) return false;
  const [ipPart] = trimmed.split("/");
  return ipPart.split(".").every((octet) => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

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
    if (!isValidIpOrCidr(ipAddress)) {
      toast.error("Invalid IP address or CIDR range");
      return false;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from("ip_whitelist")
      .insert({
        ip_address: ipAddress.trim(),
        description: description?.trim() || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        toast.error("This IP is already in the whitelist");
      } else {
        toast.error("Failed to add IP: " + error.message);
      }
      return false;
    }
    try {
      await supabase.rpc("log_audit", {
        _action: "ip_whitelist_added",
        _target_type: "ip_whitelist",
        _target_id: inserted?.id ?? ipAddress.trim(),
        _details: { ip_address: ipAddress.trim(), description: description?.trim() || null, is_active: true },
      });
    } catch { /* logging must not break the user-facing op */ }
    toast.success(`Added IP ${ipAddress}`);
    await fetchEntries();
    return true;
  };

  const removeIp = async (id: string) => {
    const target = entries.find((e) => e.id === id);
    const { error } = await supabase.from("ip_whitelist").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove IP");
      return;
    }
    try {
      await supabase.rpc("log_audit", {
        _action: "ip_whitelist_removed",
        _target_type: "ip_whitelist",
        _target_id: id,
        _details: { ip_address: target?.ip_address ?? null, description: target?.description ?? null },
      });
    } catch { /* noop */ }
    toast.success("IP removed");
    await fetchEntries();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const target = entries.find((e) => e.id === id);
    const { error } = await supabase
      .from("ip_whitelist")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update IP status");
      return;
    }
    try {
      await supabase.rpc("log_audit", {
        _action: "ip_whitelist_toggled",
        _target_type: "ip_whitelist",
        _target_id: id,
        _details: { ip_address: target?.ip_address ?? null, is_active: isActive },
      });
    } catch { /* noop */ }
    await fetchEntries();
  };

  useEffect(() => {
    fetchEntries();
    detectCurrentIp();
  }, [fetchEntries, detectCurrentIp]);

  return { entries, isLoading, currentIp, addIp, removeIp, toggleActive, refresh: fetchEntries };
}

export async function checkIpAccess(): Promise<{ allowed: boolean; ip: string; error?: boolean }> {
  try {
    const res = await supabase.functions.invoke("check-ip");
    if (!res.data) return { allowed: false, ip: "unknown", error: true };
    return res.data;
  } catch {
    return { allowed: false, ip: "unknown", error: true };
  }
}
