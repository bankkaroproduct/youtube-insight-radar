import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useChannels, fetchAllChannelsForExport, ChannelFilters, CHANNELS_PAGE_SIZE } from "@/hooks/useChannels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, RefreshCw, BarChart3, Mail, CheckCircle2, AlertTriangle, HelpCircle, Shuffle, Instagram, Download, ExternalLink, VideoIcon, Loader2, Link2, ChevronLeft, ChevronRight, StopCircle } from "lucide-react";
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

function downloadCSV(channels: any[], igProfiles: Record<string, any> = {}) {
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
    "Affiliate Status", "Relevant", "Category", "Country", "Contact Email", "Instagram", "IG Followers", "IG Bio", "IG Business Category",
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
      igProfiles[ch.id]?.follower_count ?? "",
      igProfiles[ch.id]?.bio ?? "",
      igProfiles[ch.id]?.business_category ?? "",
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

interface SummaryStats { total: number; with_us: number; competitor: number; mixed: number; neutral: number; needs_backfill: number; }

export default function Channels() {
  useEffect(() => { document.title = "Channels | YT Intel"; }, []);
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ChannelFilters>({ name: "", status: "", category: "", relevance: "", country: "" });
  const [page, setPage] = useState(0);
  const { sortKey, sortDirection, handleSort } = useSort<any>("videos", "desc");
  const sortDir: "asc" | "desc" = sortDirection === "asc" ? "asc" : "desc";

  const { channels, totalCount, isLoading, refresh, recomputeStats, isRecomputing, stopRecompute } = useChannels(filters, page, sortKey, sortDir);

  const [fetchingNew, setFetchingNew] = useState(false);
  const [scrapingLinks, setScrapingLinks] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({ channels: 0, videos: 0 });
  const [scrapeProgress, setScrapeProgress] = useState({ channels: 0 });
  const stopBackfillRef = useRef(false);
  const stopScrapeRef = useRef(false);
  const [igProfiles, setIgProfiles] = useState<Record<string, any>>({});
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, with_us: 0, competitor: 0, mixed: 0, neutral: 0, needs_backfill: 0 });

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [filters]);

  // Load global summary stats
  const loadSummary = useCallback(async () => {
    const [summaryRes, backfillCountRes] = await Promise.all([
      supabase.rpc("get_channel_summary_stats"),
      supabase.rpc("get_channels_needing_backfill"),
    ]);
    if (summaryRes.data && summaryRes.data.length > 0) {
      const r = summaryRes.data[0] as any;
      setSummary({
        total: Number(r.total) || 0,
        with_us: Number(r.with_us) || 0,
        competitor: Number(r.competitor) || 0,
        mixed: Number(r.mixed) || 0,
        neutral: Number(r.neutral) || 0,
        needs_backfill: Number(backfillCountRes.data) || 0,
      });
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Fetch IG profiles only for channels currently in view
  useEffect(() => {
    const ids = channels.map(c => c.id);
    if (ids.length === 0) { setIgProfiles({}); return; }
    supabase.from("instagram_profiles").select("*").in("channel_id", ids).then(({ data }) => {
      if (data) {
        const map: Record<string, any> = {};
        for (const p of data) map[p.channel_id] = p;
        setIgProfiles(map);
      }
    });
  }, [channels]);

  const fullRefresh = useCallback(() => {
    refresh();
    loadSummary();
  }, [refresh, loadSummary]);

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
      fullRefresh();
    } catch (e: any) {
      toast.error("Failed to fetch new channel videos: " + e.message);
    } finally {
      setFetchingNew(false);
    }
  };

  const backfillTo50 = async () => {
    setBackfilling(true);
    stopBackfillRef.current = false;
    setBackfillProgress({ channels: 0, videos: 0 });
    let totalProcessed = 0;
    let totalVideos = 0;
    let totalTarget = 0;
    const t = toast.loading("Finding channels under 50 videos…");
    let consecutiveFailures = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      while (!stopBackfillRef.current) {
        let result: any;
        try {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-channel-videos`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${session?.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ backfill_under_50: true, limit: 10 }),
            }
          );
          result = await resp.json();
          if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);
          consecutiveFailures = 0;
        } catch (iterErr: any) {
          consecutiveFailures++;
          console.error("[backfillTo50] iteration failed:", iterErr?.message);
          toast.loading(
            `Backfilled ${totalProcessed} channels (${totalVideos}/${totalTarget}) — transient error, retrying… (${consecutiveFailures}/3)`,
            { id: t },
          );
          if (consecutiveFailures >= 3) {
            throw new Error(`Aborted after 3 consecutive failures: ${iterErr?.message}`);
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const processed = result.channels_processed || 0;
        if (processed === 0) break;
        const inserted = result.total_videos_inserted || 0;
        const target = result.total_videos_target || 0;
        totalProcessed += processed;
        totalVideos += inserted;
        totalTarget += target;
        setBackfillProgress({ channels: totalProcessed, videos: totalVideos });
        toast.loading(
          `Backfilled ${totalProcessed} channels (${totalVideos}/${totalTarget} videos)…`,
          { id: t }
        );
        fullRefresh();
        if (inserted === 0) break;
      }
      const stoppedMsg = stopBackfillRef.current ? " (stopped)" : "";
      const completionPct = totalTarget > 0 ? Math.round((totalVideos / totalTarget) * 100) : 100;
      toast.success(
        `Done${stoppedMsg}. Backfilled ${totalProcessed} channels — ${totalVideos} videos (${completionPct}% of max achievable).`,
        { id: t }
      );
      fullRefresh();
    } catch (e: any) {
      toast.error("Backfill failed: " + e.message, { id: t });
    } finally {
      setBackfilling(false);
      stopBackfillRef.current = false;
    }
  };

  const scrapeChannelLinks = async () => {
    setScrapingLinks(true);
    stopScrapeRef.current = false;
    setScrapeProgress({ channels: 0 });
    let totalProcessed = 0;
    try {
      const t = toast.loading("Scraping channel links…");
      while (!stopScrapeRef.current) {
        const { data, error } = await supabase.functions.invoke("scrape-channel-links", {
          body: { batch_size: 10 },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Failed");
        totalProcessed += data.processed || 0;
        setScrapeProgress({ channels: totalProcessed });
        toast.loading(`Scraped ${totalProcessed} channels (${data.remaining} remaining)…`, { id: t });
        if (!data.processed || data.remaining === 0) break;
      }
      const stoppedMsg = stopScrapeRef.current ? " (stopped)" : "";
      toast.success(`Done${stoppedMsg}. Scraped links for ${totalProcessed} channels.`, { id: t });
      fullRefresh();
    } catch (e: any) {
      toast.error("Failed to scrape links: " + e.message);
    } finally {
      setScrapingLinks(false);
      stopScrapeRef.current = false;
    }
  };

  const handleDownloadCSV = async () => {
    setDownloadingCsv(true);
    const tId = toast.loading("Fetching all matching channels…");
    try {
      const all = await fetchAllChannelsForExport(filters);
      // Get IG profiles for all
      const ids = all.map(c => c.id);
      let igMap: Record<string, any> = {};
      const ID_CHUNK = 200;
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const chunk = ids.slice(i, i + ID_CHUNK);
        const { data } = await supabase.from("instagram_profiles").select("*").in("channel_id", chunk);
        if (data) for (const p of data) igMap[p.channel_id] = p;
      }
      downloadCSV(all, igMap);
      toast.success(`Downloaded ${all.length} channels`, { id: tId });
    } catch (e: any) {
      toast.error("CSV download failed: " + (e?.message || "Unknown error"), { id: tId });
    } finally {
      setDownloadingCsv(false);
    }
  };

  const statCards = [
    { label: "Total Channels", value: summary.total, icon: Users, color: "text-primary" },
    { label: "With Us", value: summary.with_us, icon: CheckCircle2, color: "text-green-500" },
    { label: "Competitor", value: summary.competitor, icon: AlertTriangle, color: "text-red-500" },
    { label: "Mixed", value: summary.mixed, icon: Shuffle, color: "text-orange-500" },
    { label: "Neutral", value: summary.neutral, icon: HelpCircle, color: "text-muted-foreground" },
    { label: "Needs Backfill", value: summary.needs_backfill, icon: VideoIcon, color: "text-amber-500" },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / CHANNELS_PAGE_SIZE));
  const hasMore = (page + 1) * CHANNELS_PAGE_SIZE < totalCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Channels</h1>
          <p className="text-muted-foreground mt-1">
            Showing {totalCount === 0 ? 0 : page * CHANNELS_PAGE_SIZE + 1}–{Math.min((page + 1) * CHANNELS_PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()} channels.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={fetchNewChannelVideos} disabled={fetchingNew}>
            {fetchingNew ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <VideoIcon className="h-4 w-4 mr-2" />}
            Fetch New Channel Videos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={backfillTo50}
            disabled={backfilling}
            title="Fetches videos for channels that have fewer than 50 stored. Caps at 50 or whatever YouTube has, whichever is smaller."
          >
            {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <VideoIcon className="h-4 w-4 mr-2" />}
            {backfilling
              ? `Backfilling: ${backfillProgress.channels} ch / ${backfillProgress.videos} vids`
              : "Backfill Under 50"}
          </Button>
          {backfilling && (
            <Button variant="destructive" size="sm" onClick={() => { stopBackfillRef.current = true; toast.message("Stopping after current batch…"); }}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={scrapeChannelLinks} disabled={scrapingLinks}>
            {scrapingLinks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            {scrapingLinks ? `Scraping: ${scrapeProgress.channels} channels` : "Scrape Channel Links"}
          </Button>
          {scrapingLinks && (
            <Button variant="destructive" size="sm" onClick={() => { stopScrapeRef.current = true; toast.message("Stopping after current batch…"); }}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={downloadingCsv}>
                  {downloadingCsv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {downloadingCsv ? "Exporting…" : "Download CSV"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Downloads all matching rows — may take a moment for large datasets</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={() => recomputeStats()}>
            <BarChart3 className="h-4 w-4 mr-2" /> Recompute Stats
          </Button>
          <Button variant="outline" size="sm" onClick={fullRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`h-8 w-8 ${s.color}`} />
                <div>
                  <p className="text-2xl font-bold">{s.value.toLocaleString()}</p>
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
          {isLoading && channels.length === 0 ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
          ) : channels.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              {totalCount === 0 ? "No channels yet. Channels are auto-discovered when videos are fetched." : "No channels match the current filters."}
            </div>
          ) : (
            <>
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
                        <Select value={filters.status || "all"} onValueChange={(v) => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
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
                        <Select value={filters.relevance || "all"} onValueChange={(v) => setFilters(f => ({ ...f, relevance: v === "all" ? "" : v }))}>
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
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map((ch: any) => (
                      <TableRow key={ch.id}>
                        <TableCell className="font-medium">
                          <a href={ch.channel_url || "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {ch.channel_name}
                          </a>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{ch.subscriber_count ? formatNumber(ch.subscriber_count) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {(() => {
                            const fetched = ch.total_videos_fetched ?? 0;
                            const yt = ch.youtube_total_videos;
                            if (yt != null && yt < 50 && fetched >= yt) {
                              return (
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="font-medium">{fetched}</span>
                                  <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success leading-none">
                                    Till date
                                  </span>
                                </span>
                              );
                            }
                            return fetched;
                          })()}
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
                        <TableCell className="text-right tabular-nums text-sm">
                          {igProfiles[ch.id]?.follower_count != null
                            ? formatNumber(igProfiles[ch.id].follower_count)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[250px]">
                          <ExpandableText text={ch.description || ""} maxLength={60} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0 || isLoading} onClick={() => setPage(p => Math.max(0, p - 1))}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={!hasMore || isLoading} onClick={() => setPage(p => p + 1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
