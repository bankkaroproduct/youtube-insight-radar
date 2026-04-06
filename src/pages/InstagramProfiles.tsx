import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Instagram, Download, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";
import { ExpandableText } from "@/components/ui/ExpandableText";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

interface IGProfile {
  id: string;
  channel_id: string;
  instagram_username: string;
  full_name: string | null;
  bio: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  is_business: boolean | null;
  business_category: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  external_url: string | null;
  scraped_at: string | null;
  channel_name?: string;
}

function downloadCSV(profiles: IGProfile[]) {
  const headers = [
    "Username", "Channel Name", "Full Name", "Bio", "Followers", "Following",
    "Posts", "Business Category", "Contact Email", "Phone", "External URL", "Scraped At",
  ];
  const rows = profiles.map(p => [
    p.instagram_username,
    p.channel_name || "",
    p.full_name || "",
    p.bio || "",
    p.follower_count ?? "",
    p.following_count ?? "",
    p.post_count ?? "",
    p.business_category || "",
    p.contact_email || "",
    p.contact_phone || "",
    p.external_url || "",
    p.scraped_at || "",
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "instagram_profiles.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function InstagramProfiles() {
  const [profiles, setProfiles] = useState<IGProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [search, setSearch] = useState("");
  const { sortKey, sortDirection, handleSort, sortFn } = useSort<IGProfile>();

  const fetchProfiles = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("instagram_profiles")
      .select("*")
      .order("follower_count", { ascending: false });

    if (error) {
      toast.error("Failed to load Instagram profiles");
      setIsLoading(false);
      return;
    }

    // Fetch channel names
    const channelIds = [...new Set((data || []).map(p => p.channel_id))];
    let channelMap: Record<string, string> = {};
    if (channelIds.length > 0) {
      const { data: channels } = await supabase
        .from("channels")
        .select("id, channel_name")
        .in("id", channelIds);
      if (channels) {
        for (const c of channels) channelMap[c.id] = c.channel_name;
      }
    }

    setProfiles((data || []).map(p => ({ ...p, channel_name: channelMap[p.channel_id] || "Unknown" })));
    setIsLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const scrapeNow = async () => {
    setScraping(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-instagram-profiles`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed");
      toast.success(result.message || `Scraped ${result.scraped} profiles`);
      fetchProfiles();
    } catch (e: any) {
      toast.error("Instagram scrape failed: " + e.message);
    } finally {
      setScraping(false);
    }
  };

  const filtered = useMemo(() => {
    let result = profiles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.instagram_username.toLowerCase().includes(q) ||
        (p.full_name || "").toLowerCase().includes(q) ||
        (p.channel_name || "").toLowerCase().includes(q)
      );
    }
    return sortFn(result, (item, key) => {
      switch (key) {
        case "username": return item.instagram_username;
        case "channel": return item.channel_name || "";
        case "fullname": return item.full_name || "";
        case "followers": return item.follower_count || 0;
        case "following": return item.following_count || 0;
        case "posts": return item.post_count || 0;
        case "category": return item.business_category || "";
        default: return null;
      }
    });
  }, [profiles, search, sortFn]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Instagram Profiles</h1>
          <p className="text-muted-foreground mt-1">{profiles.length} profiles scraped</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={scrapeNow} disabled={scraping}>
            {scraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
            Scrape Now
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(filtered)}>
            <Download className="h-4 w-4 mr-2" /> Download CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchProfiles}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display flex items-center gap-2">
              <Instagram className="h-5 w-5" /> Profile Data
            </CardTitle>
            <Input
              placeholder="Search username, name, channel..."
              className="max-w-xs h-8 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : profiles.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No Instagram profiles scraped yet. Profiles are scraped automatically when channels are processed.
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader label="Username" sortKey="username" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Channel" sortKey="channel" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Full Name" sortKey="fullname" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <TableHead>Bio</TableHead>
                    <SortableHeader label="Followers" sortKey="followers" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Following" sortKey="following" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Posts" sortKey="posts" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Category" sortKey="category" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Scraped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <a href={`https://instagram.com/${p.instagram_username}`} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:underline flex items-center gap-1">
                          @{p.instagram_username}
                        </a>
                      </TableCell>
                      <TableCell className="text-sm">{p.channel_name || "—"}</TableCell>
                      <TableCell className="text-sm">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        <ExpandableText text={p.bio || ""} maxLength={50} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.follower_count != null ? formatNumber(p.follower_count) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.following_count != null ? formatNumber(p.following_count) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.post_count != null ? formatNumber(p.post_count) : "—"}</TableCell>
                      <TableCell className="text-sm">{p.business_category || "—"}</TableCell>
                      <TableCell className="text-sm">{p.contact_email || "—"}</TableCell>
                      <TableCell className="text-sm">{p.contact_phone || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {p.external_url ? (
                          <a href={p.external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> Link
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.scraped_at ? new Date(p.scraped_at).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
