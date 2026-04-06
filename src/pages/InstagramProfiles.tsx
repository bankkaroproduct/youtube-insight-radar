import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Instagram, Download, RefreshCw, Loader2, ExternalLink, ChevronDown, ChevronRight, Heart, MessageCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const scoreColors: Record<string, string> = {
  Good: "bg-green-500/15 text-green-700 border-green-500/30",
  Average: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  Poor: "bg-red-500/15 text-red-700 border-red-500/30",
  Unknown: "bg-muted text-muted-foreground",
};

interface IGPost {
  url: string;
  caption: string;
  likes: number;
  comments: number;
  views?: number;
  timestamp: string | null;
  type: string;
  hashtags?: string[];
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

function PostsExpandable({ posts }: { posts: IGPost[] }) {
  const [open, setOpen] = useState(false);

  if (!posts || posts.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {posts.length} posts
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {posts.map((p, i) => (
            <div key={i} className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-1">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-400" />{formatNumber(p.likes)}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-blue-400" />{formatNumber(p.comments)}</span>
                {p.views ? <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-green-400" />{formatNumber(p.views)}</span> : null}
                <Badge variant="outline" className="text-[10px] h-4">{p.type}</Badge>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-auto">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {p.caption ? p.caption.substring(0, 300) + (p.caption.length > 300 ? "..." : "") : "No caption"}
              </p>
              {p.hashtags && p.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.hashtags.slice(0, 10).map((h, j) => (
                    <span key={j} className="text-primary/70 text-[10px]">{h}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function downloadCSV(profiles: IGProfile[]) {
  const headers = [
    "Username", "Channel Name", "Full Name", "Bio", "Followers", "Following",
    "Posts", "Avg Likes", "Avg Comments", "Business Category", "Affiliate Score", "Affiliate Reasoning",
    "Storefront", "Bio Links", "Contact Email", "Phone", "External URL", "Scraped At",
  ];
  const rows = profiles.map(p => [
    p.instagram_username,
    p.channel_name || "",
    p.full_name || "",
    p.bio || "",
    p.follower_count ?? "",
    p.following_count ?? "",
    p.post_count ?? "",
    p.avg_post_likes ?? "",
    p.avg_post_comments ?? "",
    p.business_category || "",
    p.affiliate_score || "",
    p.affiliate_reasoning || "",
    p.storefront_name || "",
    (p.bio_links || []).join(" | "),
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

    const channelIds = [...new Set((data || []).map((p: any) => p.channel_id))];
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

    setProfiles((data || []).map((p: any) => ({
      ...p,
      recent_posts: Array.isArray(p.recent_posts) ? p.recent_posts : [],
      bio_links: Array.isArray(p.bio_links) ? p.bio_links : [],
      channel_name: channelMap[p.channel_id] || "Unknown",
    })));
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
          body: JSON.stringify({ force: true }),
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
        case "avgLikes": return item.avg_post_likes || 0;
        case "avgComments": return item.avg_post_comments || 0;
        case "category": return item.business_category || "";
        case "score": return item.affiliate_score || "";
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
            <div className="overflow-x-auto max-h-[700px]">
              <Table className="min-w-[1400px]">
                <TableHeader>
                  <TableRow>
                    <SortableHeader label="Username" sortKey="username" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="min-w-[140px]" />
                    <SortableHeader label="Channel" sortKey="channel" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="min-w-[100px]" />
                    <TableHead className="min-w-[180px] max-w-[220px]">Bio</TableHead>
                    <SortableHeader label="Followers" sortKey="followers" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right min-w-[90px]" />
                    <SortableHeader label="Avg Likes" sortKey="avgLikes" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right min-w-[80px]" />
                    <SortableHeader label="Avg Comments" sortKey="avgComments" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right min-w-[80px]" />
                    <SortableHeader label="Affiliate" sortKey="score" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="min-w-[120px]" />
                    <TableHead className="min-w-[140px]">Bio Links</TableHead>
                    <TableHead className="min-w-[100px]">Storefront</TableHead>
                    <TableHead className="min-w-[100px]">Recent Posts</TableHead>
                    <TableHead className="min-w-[100px]">Email</TableHead>
                    <TableHead className="min-w-[90px]">Scraped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="align-top">
                      <TableCell className="font-medium">
                        <a href={`https://instagram.com/${p.instagram_username}`} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:underline">
                          @{p.instagram_username}
                        </a>
                        {p.full_name && <div className="text-xs text-muted-foreground">{p.full_name}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{p.channel_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground min-w-[180px] max-w-[220px]">
                        <ExpandableText text={p.bio || ""} maxLength={60} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{p.follower_count != null ? formatNumber(p.follower_count) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{p.avg_post_likes ? formatNumber(p.avg_post_likes) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{p.avg_post_comments ? formatNumber(p.avg_post_comments) : "—"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className={scoreColors[p.affiliate_score || "Unknown"]}>
                            {p.affiliate_score || "—"}
                          </Badge>
                          {p.affiliate_reasoning && (
                            <p className="text-[10px] text-muted-foreground leading-tight max-w-[150px]">{p.affiliate_reasoning}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        {p.bio_links && p.bio_links.length > 0 ? (
                          <div className="space-y-1">
                            {p.bio_links.map((link, i) => (
                              <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1 truncate">
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {new URL(link).hostname.replace("www.", "")}
                              </a>
                            ))}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.storefront_name ? (
                          <Badge variant="outline" className="bg-purple-500/15 text-purple-700 border-purple-500/30 text-xs">
                            {p.storefront_name}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <PostsExpandable posts={p.recent_posts || []} />
                      </TableCell>
                      <TableCell className="text-sm">{p.contact_email || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
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
