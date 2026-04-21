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

export interface KeywordStats {
  keyword_id: string;
  video_count: number;
  link_count: number;
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

export const defaultKeywordFilters: KeywordFilters = {
  keyword: "",
  category: "",
  businessAim: "",
  status: "",
  source: "",
  uploadedBy: "",
  priority: "",
};

export const KEYWORDS_PAGE_SIZE = 50;

export async function fetchAllKeywordsForAnalytics(): Promise<KeywordSearchRun[]> {
  const BATCH = 1000;
  let all: KeywordSearchRun[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("keywords_search_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = (data as KeywordSearchRun[]) ?? [];
    all = all.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

export function useKeywords(filters: KeywordFilters = defaultKeywordFilters, page: number = 0) {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<KeywordSearchRun[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfiles, setUserProfiles] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [keywordStats, setKeywordStats] = useState<Map<string, KeywordStats>>(new Map());

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("channel_categories").select("*").order("name");
    if (data) setCategories(data);
  }, []);

  const fetchKeywords = useCallback(async () => {
    setIsLoading(true);
    const from = page * KEYWORDS_PAGE_SIZE;
    const to = from + KEYWORDS_PAGE_SIZE - 1;

    let q: any = supabase.from("keywords_search_runs").select("*", { count: "exact" });
    if (filters.keyword) q = q.ilike("keyword", `%${filters.keyword}%`);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.businessAim) q = q.eq("business_aim", filters.businessAim);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.source === "manual") q = q.eq("source", "manual");
    else if (filters.source) q = q.eq("source_name", filters.source);
    if (filters.uploadedBy) q = q.eq("user_id", filters.uploadedBy);
    if (filters.priority === "unclassified") q = q.is("priority", null);
    else if (filters.priority) q = q.eq("priority", filters.priority);

    q = q.order("created_at", { ascending: false }).range(from, to);
    const { data, error, count } = await q;
    if (error) {
      toast.error("Failed to load keywords");
    } else {
      setKeywords((data as KeywordSearchRun[]) ?? []);
      setTotalCount(count ?? 0);
    }
    setIsLoading(false);
  }, [filters, page]);

  const fetchUserProfiles = useCallback(async () => {
    const { data } = await supabase.from("user_profiles").select("user_id, full_name");
    if (data) setUserProfiles(data);
  }, []);

  const fetchSourceFiles = useCallback(async () => {
    // Fetched separately because filtered listing won't expose all source names
  }, []);

  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("keywords_search_runs")
        .select("source_name")
        .eq("source", "excel")
        .not("source_name", "is", null);
      if (data) {
        setSourceFiles([...new Set(data.map((d: any) => d.source_name).filter(Boolean))]);
      }
    })();
  }, []);

  const fetchKeywordStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_keyword_stats");
    if (!error && data) {
      const map = new Map<string, KeywordStats>();
      for (const row of data) {
        map.set(row.keyword_id, {
          keyword_id: row.keyword_id,
          video_count: Number(row.video_count),
          link_count: Number(row.link_count),
        });
      }
      setKeywordStats(map);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchUserProfiles();
    fetchKeywordStats();
  }, [fetchCategories, fetchUserProfiles, fetchKeywordStats]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const addKeyword = async (keyword: string, category: string) => {
    if (!user) return;
    const { error } = await supabase.from("keywords_search_runs").insert({
      keyword, category, business_aim: "General", source: "manual", user_id: user.id,
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
      keyword: r.keyword, category: r.category, business_aim: r.business_aim || "General",
      source: "excel", source_name: sourceName, user_id: user.id,
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

  return {
    keywords,
    totalCount,
    categories,
    isLoading,
    addKeyword,
    addKeywordsBulk,
    deleteKeyword,
    refresh: () => { fetchKeywords(); fetchKeywordStats(); },
    userProfiles,
    sourceFiles,
    keywordStats,
  };
}
