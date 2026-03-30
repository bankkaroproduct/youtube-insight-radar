import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AffiliatePattern {
  id: string;
  pattern: string;
  name: string;
  classification: string;
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

  const addPattern = async (pattern: string, name: string, classification: string) => {
    const { error } = await supabase.from("affiliate_patterns").insert({
      pattern,
      name,
      classification,
      is_auto_discovered: false,
      is_confirmed: true,
    });
    if (error) {
      toast.error("Failed to add pattern: " + error.message);
    } else {
      toast.success("Pattern added");
      fetchPatterns();
    }
  };

  const confirmPattern = async (id: string, classification: string, name?: string) => {
    const updates: Record<string, any> = { is_confirmed: true, classification };
    if (name) updates.name = name;
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

  return {
    patterns,
    confirmedPatterns,
    discoveredPatterns,
    isLoading,
    addPattern,
    confirmPattern,
    deletePattern,
    processLinks,
    refresh: fetchPatterns,
  };
}
