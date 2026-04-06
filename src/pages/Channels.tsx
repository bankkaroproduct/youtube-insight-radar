import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useChannels } from "@/hooks/useChannels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, RefreshCw, BarChart3, Mail, CheckCircle2, AlertTriangle, HelpCircle, Shuffle, Instagram, Download, ExternalLink, VideoIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";
import { ExpandableText } from "@/components/ui/ExpandableText";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const statusColors: Record<string, string> = {
  WITH_US: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  MIXED: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

function renderCountTags(
  counts: Record<string, number> | null,
  totalVideos: number,
  colorClass: string
) {
  if (!counts || Object.keys(counts).length === 0) return "—";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([name, count]) => {
        const pct = totalVideos > 0 ? Math.round((count / totalVideos) * 100) : 0;
        return (
          <Badge key={name} variant="outline" className={`text-xs ${colorClass}`}>
            {name}: {count} ({pct}%)
          </Badge>
        );
      })}
    </div>
  );
}

function downloadCSV(channels: any[]) {
  // Collect all unique platform and retailer names
  const allPlatforms = new Set<string>();
  const allRetailers = new Set<string>();
  for (const ch of channels) {
    for (const name of Object.keys(ch.platform_video_counts || {})) allPlatforms.add(name);
    for (const name of Object.keys(ch.retailer_video_counts || {})) allRetailers.add(name);
  }
  const platformList = [...allPlatforms].sort();
  const retailerList = [...allRetailers].sort();

  const headers = [
    "Channel Name", "Description", "Channel Link", "Subscribers", "Total Videos", "Median Views", "Median Likes", "Median Comments",
    "Affiliate Status", "Relevant", "Category", "Country", "Contact Email", "Instagram",
    ...platformList.flatMap(p => [`Platform: ${p} (count)`, `Platform: ${p} (%)`]),
    ...retailerList.flatMap(r => [`Retailer: ${r} (count)`, `Retailer: ${r} (%)`]),
  ];

  const rows = channels.map(ch => {
    const counts = ch.platform_video_counts || {};
    const rCounts = ch.retailer_video_counts || {};
    const totalVids = ch.total_videos_fetched || 0;
    return [
      ch.channel_name,
      ch.description || "",
      ch.channel_url || "",
      ch.subscriber_count || 0,
      ch.total_videos_fetched || 0,
      ch.median_views || 0,
      ch.median_likes || 0,
      ch.median_comments || 0,
      ch.affiliate_status || "NEUTRAL",
      ch.is_relevant === true ? "Yes" : ch.is_relevant === false ? "No" : "",
      ch.youtube_category || "",
      ch.country || "",
      ch.contact_email || "",
      ch.instagram_url || "",
      ...platformList.flatMap(p => { const c = counts[p] || 0; return [c, totalVids > 0 ? `${Math.round((c / totalVids) * 100)}%` : "0%"]; }),
      ...retailerList.flatMap(r => { const c = rCounts[r] || 0; return [c, totalVids > 0 ? `${Math.round((c / totalVids) * 100)}%` : "0%"]; }),
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "channels_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Channels() {
  const { channels, isLoading, refresh, recomputeStats } = useChannels();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ name: "", status: "", category: "", relevance: "", country: "" });
  const [fetchingNew, setFetchingNew] = useState(false);
  const [scrapingIG, setScrapingIG] = useState(false);
  const [igProfiles, setIgProfiles] = useState<Record<string, any>>({});

  // Fetch instagram profiles
  useEffect(() => {
    supabase.from("instagram_profiles").select("*").then(({ data }) => {
      if (data) {
        const map: Record<string, any> = {};
        for (const p of data) map[p.channel_id] = p;
        setIgProfiles(map);
      }
    });
  }, [channels]);

  const scrapeInstagramProfiles = async () => {
    setScrapingIG(true);
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
      refresh();
    } catch (e: any) {
      toast.error("Instagram scrape failed: " + e.message);
    } finally {
      setScrapingIG(false);
    }
  };

  const fetchNewChannelVideos = async () => {
    setFetchingNew(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-channel-videos`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ min_videos: 0, max_videos: 0, limit: 50 }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed");
      toast.success(`Fetched videos for ${result.channels_processed} new channels (${result.total_videos_inserted} videos)`);
      refresh();
    } catch (e: any) {
      toast.error("Failed to fetch new channel videos: " + e.message);
    } finally {
      setFetchingNew(false);
    }
  };
  const { sortKey, sortDirection, handleSort, sortFn } = useSort<any>();
  const [dbTotalChannels, setDbTotalChannels] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("channels").select("id", { count: "exact", head: true })
      .gt("total_videos_fetched", 0)
      .then(({ count }) => setDbTotalChannels(count));
  }, [channels]);

  const filteredAndSorted = useMemo(() => {
    let result = channels.filter((ch: any) => {
      if (filters.name && !ch.channel_name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status && (ch.affiliate_status || "NEUTRAL") !== filters.status) return false;
      if (filters.category && !(ch.youtube_category || "").toLowerCase().includes(filters.category.toLowerCase())) return false;
      if (filters.relevance === "yes" && ch.is_relevant !== true) return false;
      if (filters.relevance === "no" && ch.is_relevant !== false) return false;
      if (filters.relevance === "unchecked" && ch.is_relevant !== null) return false;
      if (filters.country && !(ch.country || "").toLowerCase().includes(filters.country.toLowerCase())) return false;
      return true;
    });

    return sortFn(result, (item: any, key: string) => {
      switch (key) {
        case "name": return item.channel_name;
        case "subscribers": return item.subscriber_count || 0;
        case "videos": return item.total_videos_fetched || 0;
        case "views": return item.median_views || 0;
        case "likes": return item.median_likes || 0;
        case "status": return item.affiliate_status || "NEUTRAL";
        case "relevance": return item.is_relevant === true ? 1 : item.is_relevant === false ? 0 : -1;
        case "category": return item.youtube_category || "";
        case "country": return item.country || "";
        default: return null;
      }
    });
  }, [channels, filters, sortFn]);

  const stats = useMemo(() => ({
    total: dbTotalChannels ?? channels.length,
    withUs: channels.filter((c: any) => c.affiliate_status === "WITH_US").length,
    competitor: channels.filter((c: any) => c.affiliate_status === "COMPETITOR").length,
    mixed: channels.filter((c: any) => c.affiliate_status === "MIXED").length,
    neutral: channels.filter((c: any) => !c.affiliate_status || c.affiliate_status === "NEUTRAL").length,
  }), [channels, dbTotalChannels]);

  const statCards = [
    { label: "Total Channels", value: stats.total, icon: Users, color: "text-primary" },
    { label: "With Us", value: stats.withUs, icon: CheckCircle2, color: "text-green-500" },
    { label: "Competitor", value: stats.competitor, icon: AlertTriangle, color: "text-red-500" },
    { label: "Mixed", value: stats.mixed, icon: Shuffle, color: "text-orange-500" },
    { label: "Neutral", value: stats.neutral, icon: HelpCircle, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Channels</h1>
          <p className="text-muted-foreground mt-1">
            {channels.length} channels discovered. Median stats skip top/bottom 5 videos.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          
          <Button variant="outline" size="sm" onClick={scrapeInstagramProfiles} disabled={scrapingIG}>
            {scrapingIG ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
            Scrape Instagram
          </Button>
          <Button variant="outline" size="sm" onClick={fetchNewChannelVideos} disabled={fetchingNew}>
            {fetchingNew ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <VideoIcon className="h-4 w-4 mr-2" />}
            Fetch New Channel Videos
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredAndSorted)}>
            <Download className="h-4 w-4 mr-2" /> Download CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => recomputeStats()}>
            <BarChart3 className="h-4 w-4 mr-2" /> Recompute Stats
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`h-8 w-8 ${s.color}`} />
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5" /> Channel Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
          ) : channels.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No channels yet. Channels are auto-discovered when videos are fetched.
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader label="Channel" sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Subscribers" sortKey="subscribers" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Videos" sortKey="videos" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Median Views" sortKey="views" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Median Likes" sortKey="likes" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Relevance" sortKey="relevance" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Category" sortKey="category" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Country" sortKey="country" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                    <TableHead>Platforms (videos / share)</TableHead>
                    <TableHead>Retailers (videos / share)</TableHead>
                    <TableHead>Channel Link</TableHead>
                    <TableHead>Videos</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>IG Followers</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={filters.name} onChange={(e) => setFilters(f => ({ ...f, name: e.target.value }))} /></TableHead>
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead>
                      <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="WITH_US">With Us</SelectItem>
                          <SelectItem value="COMPETITOR">Competitor</SelectItem>
                          <SelectItem value="MIXED">Mixed</SelectItem>
                          <SelectItem value="NEUTRAL">Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead>
                      <Select value={filters.relevance} onValueChange={(v) => setFilters(f => ({ ...f, relevance: v === "all" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="unchecked">Unchecked</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))} /></TableHead>
                    <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={filters.country} onChange={(e) => setFilters(f => ({ ...f, country: e.target.value }))} /></TableHead>
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((ch: any) => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium">
                        <a href={ch.channel_url || "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {ch.channel_name}
                        </a>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ch.subscriber_count ? formatNumber(ch.subscriber_count) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ch.youtube_total_videos != null && ch.youtube_total_videos < 50
                          ? `${ch.youtube_total_videos}-Till date`
                          : ch.total_videos_fetched}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(ch.median_views)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(ch.median_likes)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[ch.affiliate_status] || statusColors.NEUTRAL}>
                          {ch.affiliate_status === "WITH_US" ? "With Us" : ch.affiliate_status === "COMPETITOR" ? "Competitor" : ch.affiliate_status === "MIXED" ? "Mixed" : "Neutral"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ch.is_relevant === true ? (
                          <Badge variant="outline" className="bg-green-500/15 text-green-700 border-green-500/30">Yes</Badge>
                        ) : ch.is_relevant === false ? (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">No</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px]">
                        <ExpandableText text={ch.youtube_category || ""} maxLength={30} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ch.country || "—"}</TableCell>
                      <TableCell className="max-w-[220px]">
                        {renderCountTags(ch.platform_video_counts, ch.total_videos_fetched || 0, "bg-blue-500/15 text-blue-700 border-blue-500/30")}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {renderCountTags(ch.retailer_video_counts, ch.total_videos_fetched || 0, "bg-purple-500/15 text-purple-700 border-purple-500/30")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ch.channel_url ? (
                          <a href={ch.channel_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> Link
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate(`/videos?channel=${encodeURIComponent(ch.channel_name)}`)}>
                          View Videos
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {ch.contact_email ? (
                            <a href={`mailto:${ch.contact_email}`} className="text-primary hover:underline flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" /> Email
                            </a>
                          ) : null}
                          {ch.instagram_url ? (
                            <a href={ch.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:underline flex items-center gap-1 text-sm">
                              <Instagram className="h-3 w-3" /> IG
                            </a>
                          ) : null}
                          {!ch.contact_email && !ch.instagram_url ? "—" : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[250px]">
                        <ExpandableText text={ch.description || ""} maxLength={60} />
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
