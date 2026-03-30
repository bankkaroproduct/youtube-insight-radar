import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCompetitorNames() {
  const [names, setNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNames = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("competitor_names")
      .select("name")
      .order("name");

    if (error) {
      toast.error("Failed to load competitor names");
    } else {
      setNames((data ?? []).map((d: any) => d.name));
    }
    setIsLoading(false);
  }, []);

  const addName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (names.includes(trimmed)) return; // already exists
    const { error } = await supabase.from("competitor_names").insert({ name: trimmed });
    if (error) {
      if (error.code === "23505") {
        // unique violation — already exists, just refresh
        await fetchNames();
        return;
      }
      toast.error("Failed to add name: " + error.message);
      return;
    }
    toast.success(`Added "${trimmed}"`);
    await fetchNames();
  };

  useEffect(() => {
    fetchNames();
  }, [fetchNames]);

  return { names, isLoading, addName, refresh: fetchNames };
}
