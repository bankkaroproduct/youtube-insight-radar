import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const IG_PAGE_SIZE = 50;

export interface IGPost {
  url: string;
  caption: string;
  likes: number;
  comments: number;
  views?: number;
  timestamp: string | null;
  type: string;
  hashtags?: string[];
}

export interface IGProfile {
  id: string;
  channel_id: string;
  instagram_username: string;
  full_name: string | null;
  bio: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  is_business: boolean | null;
  is_private: boolean | null;
  business_category: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  external_url: string | null;
  recent_posts: IGPost[] | null;
  bio_links: string[] | null;
  storefront_name: string | null;
  affiliate_score: string | null;
  affiliate_reasoning: string | null;
  avg_post_likes: number | null;
  avg_post_comments: number | null;
  scraped_at: string | null;
  channel_name?: string;
}

export interface IGFilters {
  search: string;
}

function sortColumn(sortKey: string | null): string {
  switch (sortKey) {
    case "username": return "instagram_username";
    case "fullname": return "full_name";
    case "followers": return "follower_count";
    case "following": return "following_count";
    case "posts": return "post_count";
    case "avgLikes": return "avg_post_likes";
    case "avgComments": return "avg_post_comments";
    case "category": return "business_category";
    case "score": return "affiliate_score";
    default: return "follower_count";
  }
}

function applyFilters(q: any, filters: IGFilters) {
  if (filters.search) {
    const s = filters.search.replace(/[%,]/g, "");
    q = q.or(
      `instagram_username.ilike.%${s}%,full_name.ilike.%${s}%`,
    );
  }
  return q;
}

async function attachChannelNames<T extends { channel_id: string }>(rows: T[]): Promise<(T & { channel_name: string })[]> {
  const channelIds = [...new Set(rows.map(r => r.channel_id).filter(Boolean))];
  const channelMap: Record<string, string> = {};
  if (channelIds.length > 0) {
    const { data } = await supabase
      .from("channels")
      .select("id, channel_name")
      .in("id", channelIds);
    if (data) for (const c of data) channelMap[c.id] = c.channel_name;
  }
  return rows.map(r => ({ ...r, channel_name: channelMap[r.channel_id] || "Unknown" }));
}

export function useInstagramProfiles(
  filters: IGFilters,
  page: number,
  sortKey: string | null,
  sortDir: "asc" | "desc",
) {
  const [profiles, setProfiles] = useState<IGProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const thisId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      const from = page * IG_PAGE_SIZE;
      const to = from + IG_PAGE_SIZE - 1;
      let q: any = supabase
        .from("instagram_profiles")
        .select("*", { count: "exact" });
      q = applyFilters(q, filters);
      q = q
        .order(sortColumn(sortKey), { ascending: sortDir === "asc", nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to);

      const { data, count, error } = await q;
      if (thisId !== fetchIdRef.current) return;
      if (error) throw error;

      const enriched = await attachChannelNames((data as any[]) ?? []);
      if (thisId !== fetchIdRef.current) return;

      setProfiles(enriched.map((p: any) => ({
        ...p,
        recent_posts: Array.isArray(p.recent_posts) ? p.recent_posts : [],
        bio_links: Array.isArray(p.bio_links) ? p.bio_links : [],
      })));
      setTotalCount(count ?? 0);
    } catch {
      if (thisId === fetchIdRef.current) toast.error("Failed to load Instagram profiles");
    } finally {
      if (thisId === fetchIdRef.current) setIsLoading(false);
    }
  }, [filters, page, sortKey, sortDir]);

  useEffect(() => { load(); }, [load]);

  return { profiles, totalCount, isLoading, refresh: load };
}

/** Fetches ALL IG profiles matching filters for CSV export. */
export async function fetchAllIGProfilesForExport(filters: IGFilters): Promise<IGProfile[]> {
  const BATCH = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q: any = supabase.from("instagram_profiles").select("*");
    q = applyFilters(q, filters);
    q = q.order("follower_count", { ascending: false, nullsFirst: false }).range(from, from + BATCH - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  const enriched = await attachChannelNames(all);
  return enriched.map((p: any) => ({
    ...p,
    recent_posts: Array.isArray(p.recent_posts) ? p.recent_posts : [],
    bio_links: Array.isArray(p.bio_links) ? p.bio_links : [],
  }));
}
