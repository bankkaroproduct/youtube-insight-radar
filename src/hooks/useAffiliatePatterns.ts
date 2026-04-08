import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PatternType = "affiliate_platform" | "retailer";

export interface AffiliatePattern {
  id: string;
  pattern: string;
  name: string;
  classification: string;
  type: string;
  is_auto_discovered: boolean;
  is_confirmed: boolean;
  created_at: string;
}

export function useAffiliatePatterns() {
  const [patterns, setPatterns] = useState<AffiliatePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPatterns = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("affiliate_patterns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load patterns");
    } else {
      setPatterns((data as any[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  const addPattern = async (pattern: string, name: string, classification: string, type: PatternType = "affiliate_platform") => {
    const { error } = await supabase.from("affiliate_patterns").upsert({
      pattern,
      name,
      classification,
      type,
      is_auto_discovered: false,
      is_confirmed: true,
    } as any, { onConflict: "pattern" });
    if (error) {
      toast.error("Failed to add pattern: " + error.message);
    } else {
      toast.success("Pattern added");
      fetchPatterns();
    }
  };

  const confirmPattern = async (id: string, classification: string, name?: string, type?: PatternType) => {
    const updates: { is_confirmed: boolean; classification: string; name?: string; type?: string } = { is_confirmed: true, classification };
    if (name) updates.name = name;
    if (type) updates.type = type;
    const { error } = await supabase
      .from("affiliate_patterns")
      .update(updates)
      .eq("id", id);
    if (error) {
      toast.error("Failed to confirm pattern");
    } else {
      toast.success("Pattern confirmed");
      fetchPatterns();
    }
  };

  const updatePatternType = async (id: string, type: PatternType) => {
    const { error } = await supabase
      .from("affiliate_patterns")
      .update({ type } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update type");
    } else {
      toast.success("Type updated");
      fetchPatterns();
    }
  };

  const deletePattern = async (id: string) => {
    const { error } = await supabase.from("affiliate_patterns").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete pattern");
    } else {
      toast.success("Pattern deleted");
      fetchPatterns();
    }
  };

  const processLinks = async () => {
    try {
      const { error } = await supabase.functions.invoke("process-video-links");
      if (error) throw error;
      toast.success("Link processing triggered");
      fetchPatterns();
    } catch (e: any) {
      toast.error("Failed to process links: " + e.message);
    }
  };

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const confirmedPatterns = patterns.filter(p => p.is_confirmed);
  const discoveredPatterns = patterns.filter(p => !p.is_confirmed);
  const platformPatterns = confirmedPatterns.filter(p => p.type?.toLowerCase() === "affiliate_platform");
  const retailerPatterns = confirmedPatterns.filter(p => p.type?.toLowerCase() === "retailer");

  const uniqueNames = [...new Set(confirmedPatterns.map(p => p.name).filter(Boolean))].sort();

  return {
    patterns,
    confirmedPatterns,
    discoveredPatterns,
    platformPatterns,
    retailerPatterns,
    uniqueNames,
    isLoading,
    addPattern,
    confirmPattern,
    updatePatternType,
    deletePattern,
    processLinks,
    refresh: fetchPatterns,
  };
}
