import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface KeywordSearchRun {
  id: string;
  keyword: string;
  category: string;
  business_aim: string;
  source: string;
  source_name: string | null;
  user_id: string | null;
  status: string;
  priority: string | null;
  estimated_volume: string | null;
  last_priority_fetch_at: string | null;
  run_date: string;
  created_at: string;
}

export interface ChannelCategory {
  id: string;
  name: string;
  description: string | null;
  business_aim: string;
}

export interface KeywordFilters {
  keyword: string;
  category: string;
  businessAim: string;
  status: string;
  source: string;
  uploadedBy: string;
  priority: string;
}

const defaultFilters: KeywordFilters = {
  keyword: "",
  category: "",
  businessAim: "",
  status: "",
  source: "",
  uploadedBy: "",
  priority: "",
};

export function useKeywords() {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<KeywordSearchRun[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [filters, setFilters] = useState<KeywordFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfiles, setUserProfiles] = useState<{ user_id: string; full_name: string | null }[]>([]);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("channel_categories").select("*").order("name");
    if (data) setCategories(data);
  }, []);

  const fetchKeywords = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("keywords_search_runs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load keywords");
    } else {
      setKeywords(data ?? []);
    }
    setIsLoading(false);
  }, []);

  const fetchUserProfiles = useCallback(async () => {
    const { data } = await supabase.from("user_profiles").select("user_id, full_name");
    if (data) setUserProfiles(data);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchKeywords();
    fetchUserProfiles();
  }, [fetchCategories, fetchKeywords, fetchUserProfiles]);

  const addKeyword = async (keyword: string, category: string) => {
    if (!user) return;
    const { error } = await supabase.from("keywords_search_runs").insert({
      keyword,
      category,
      business_aim: "General",
      source: "manual",
      user_id: user.id,
    });
    if (error) {
      toast.error("Failed to add keyword: " + error.message);
    } else {
      toast.success("Keyword added");
      fetchKeywords();
    }
  };

  const addKeywordsBulk = async (rows: { keyword: string; category: string; business_aim: string }[], sourceName: string) => {
    if (!user) return;
    const inserts = rows.map((r) => ({
      keyword: r.keyword,
      category: r.category,
      business_aim: r.business_aim || "General",
      source: "excel",
      source_name: sourceName,
      user_id: user.id,
    }));
    const { error } = await supabase.from("keywords_search_runs").insert(inserts);
    if (error) {
      toast.error("Failed to import keywords: " + error.message);
    } else {
      toast.success(`Imported ${inserts.length} keywords`);
      fetchKeywords();
    }
  };

  const deleteKeyword = async (id: string) => {
    const { error } = await supabase.from("keywords_search_runs").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete keyword");
    } else {
      toast.success("Keyword deleted");
      fetchKeywords();
    }
  };

  const clearFilters = () => setFilters(defaultFilters);

  const filteredKeywords = keywords.filter((k) => {
    if (filters.keyword && !k.keyword.toLowerCase().includes(filters.keyword.toLowerCase())) return false;
    if (filters.category && k.category !== filters.category) return false;
    if (filters.businessAim && k.business_aim !== filters.businessAim) return false;
    if (filters.status && k.status !== filters.status) return false;
    if (filters.source) {
      if (filters.source === "manual" && k.source !== "manual") return false;
      if (filters.source !== "manual" && k.source_name !== filters.source) return false;
    }
    if (filters.uploadedBy && k.user_id !== filters.uploadedBy) return false;
    if (filters.priority) {
      if (filters.priority === "unclassified" && k.priority) return false;
      if (filters.priority !== "unclassified" && k.priority !== filters.priority) return false;
    }
    return true;
  });

  const sourceFiles = [...new Set(keywords.filter((k) => k.source === "excel" && k.source_name).map((k) => k.source_name!))];

  return {
    keywords: filteredKeywords,
    allKeywords: keywords,
    categories,
    filters,
    setFilters,
    clearFilters,
    isLoading,
    addKeyword,
    addKeywordsBulk,
    deleteKeyword,
    refresh: fetchKeywords,
    userProfiles,
    sourceFiles,
  };
}
