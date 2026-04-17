import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useVideos, Video, VideoFilters } from "@/hooks/useVideos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video as VideoIcon, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ChevronLeft, Link2, Tag, Users, AlertTriangle, Globe, Store, Download, FileSpreadsheet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { exportFullReport } from "@/services/excelExportService";
import { toast } from "sonner";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const classificationColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground border-border",
};

interface MarketShareEntry {
  name: string;
  count: number;
  share: number;
}

function getPlatformShares(video: Video): MarketShareEntry[] {
  const total = video.links.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const link of video.links) {
    if (link.platform_name) counts.set(link.platform_name, (counts.get(link.platform_name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function getRetailerShares(video: Video): MarketShareEntry[] {
  const total = video.links.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const link of video.links) {
    if (link.retailer_name) counts.set(link.retailer_name, (counts.get(link.retailer_name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function getUniquePlatforms(video: Video): string[] {
  return getPlatformShares(video).map(e => e.name);
}

function getUniqueRetailers(video: Video): string[] {
  return getRetailerShares(video).map(e => e.name);
}

async function downloadAllVideosCSV() {
  // 1. Fetch ALL videos in batches
  const BATCH = 1000;
  let allVideos: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = data ?? [];
    allVideos = allVideos.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }

  // 2. Fetch ALL video_links in batches
  let allLinks: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("video_links")
      .select("*")
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = data ?? [];
    allLinks = allLinks.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }

  // 3. Fetch ALL video_keywords + keyword names
  let allVK: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("video_keywords")
      .select("video_id, keyword_id, search_rank")
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = data ?? [];
    allVK = allVK.concat(rows);
    if (rows.length < BATCH) break;
    from += BATCH;
  }

  const keywordIds = [...new Set(allVK.map(vk => vk.keyword_id).filter(Boolean))];
  const keywordsMap = new Map<string, string>();
  for (let i = 0; i < keywordIds.length; i += BATCH) {
    const chunk = keywordIds.slice(i, i + BATCH);
    const { data } = await supabase.from("keywords_search_runs").select("id, keyword").in("id", chunk);
    for (const k of data ?? []) keywordsMap.set(k.id, k.keyword);
  }

  // Build maps
  const linksByVideo = new Map<string, any[]>();
  for (const link of allLinks) {
    const list = linksByVideo.get(link.video_id) || [];
    list.push({
      ...link,
      affiliate_name: link.affiliate_platform || link.resolved_retailer || null,
      platform_name: link.affiliate_platform || null,
      retailer_name: link.resolved_retailer || null,
    });
    linksByVideo.set(link.video_id, list);
  }

  const keywordsByVideo = new Map<string, { keyword: string; search_rank: number | null }[]>();
  const bestRankByVideo = new Map<string, number>();
  for (const vk of allVK) {
    const kwName = keywordsMap.get(vk.keyword_id);
    if (kwName) {
      const list = keywordsByVideo.get(vk.video_id) || [];
      list.push({ keyword: kwName, search_rank: vk.search_rank ?? null });
      keywordsByVideo.set(vk.video_id, list);
    }
    if (vk.search_rank != null) {
      const current = bestRankByVideo.get(vk.video_id);
      if (current == null || vk.search_rank < current) bestRankByVideo.set(vk.video_id, vk.search_rank);
    }
  }

  // Enrich videos
  const enrichedVideos: Video[] = allVideos.map(v => ({
    ...v,
    view_count: v.view_count ?? 0,
    like_count: v.like_count ?? 0,
    comment_count: v.comment_count ?? 0,
    links: linksByVideo.get(v.id) || [],
    keywords: keywordsByVideo.get(v.id) || [],
    best_rank: bestRankByVideo.get(v.id) ?? null,
  }));

  // 4. Fetch channel info
  const channelIds = [...new Set(enrichedVideos.map(v => v.channel_id))];
  const ID_CHUNK = 200;
  const channelChunks: string[][] = [];
  for (let i = 0; i < channelIds.length; i += ID_CHUNK) {
    channelChunks.push(channelIds.slice(i, i + ID_CHUNK));
  }
  const channelData = (await Promise.all(
    channelChunks.map(chunk =>
      supabase
        .from("channels")
        .select("channel_id, channel_name, channel_url, subscriber_count, median_views, median_likes, contact_email, instagram_url")
        .in("channel_id", chunk)
        .then(({ data }) => data ?? [])
    )
  )).flat();
  const channelMap = new Map(channelData.map((c: any) => [c.channel_id, c]));

  // 5. Build CSV
  const allPlatforms = new Set<string>();
  const allRetailers = new Set<string>();
  for (const v of enrichedVideos) {
    for (const e of getPlatformShares(v)) allPlatforms.add(e.name);
    for (const e of getRetailerShares(v)) allRetailers.add(e.name);
  }
  const platformList = [...allPlatforms].sort();
  const retailerList = [...allRetailers].sort();

  const headers = [
    "Video ID", "Title", "Description", "Video Link", "Channel Name", "Channel Link", "Contact Email", "Instagram",
    "Subscribers", "Median Views", "Median Likes",
    "Keywords", "Best Rank", "Views", "Likes", "Comments", "Published Date", "Total Links", "Domains",
    ...platformList.flatMap(p => [`Platform: ${p} (count)`, `Platform: ${p} (%)`]),
    ...retailerList.flatMap(r => [`Retailer: ${r} (count)`, `Retailer: ${r} (%)`]),
  ];

  const rows = enrichedVideos.map(v => {
    const pShares = getPlatformShares(v);
    const rShares = getRetailerShares(v);
    const pMap = new Map(pShares.map(e => [e.name, e]));
    const rMap = new Map(rShares.map(e => [e.name, e]));
    const ch = channelMap.get(v.channel_id);

    const domainSet = new Set<string>();
    for (const link of v.links) {
      const domain = link.domain || link.original_domain;
      if (domain) domainSet.add(domain);
    }

    return [
      v.video_id, v.title, v.description || "",
      `https://www.youtube.com/watch?v=${v.video_id}`,
      v.channel_name,
      ch?.channel_url || `https://www.youtube.com/channel/${v.channel_id}`,
      ch?.contact_email || "",
      ch?.instagram_url || "",
      ch?.subscriber_count ?? "",
      ch?.median_views ?? "",
      ch?.median_likes ?? "",
      v.keywords.map(k => k.keyword).join("; "),
      v.best_rank ?? "",
      v.view_count, v.like_count, v.comment_count,
      v.published_at ? new Date(v.published_at).toISOString().split("T")[0] : "",
      v.links.length,
      [...domainSet].join("; "),
      ...platformList.flatMap(p => { const e = pMap.get(p); return [e?.count ?? 0, e ? `${e.share}%` : "0%"]; }),
      ...retailerList.flatMap(r => { const e = rMap.get(r); return [e?.count ?? 0, e ? `${e.share}%` : "0%"]; }),
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "videos_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function VideoDetailRow({ video }: { video: Video }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={13} className="p-4">
        <div className="space-y-3">
          {video.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap max-h-40 overflow-auto">{video.description}</p>
            </div>
          )}
          {video.links.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Extracted Links ({video.links.length})
              </p>
              <div className="space-y-1">
                {video.links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={classificationColors[link.classification || "NEUTRAL"] || classificationColors.NEUTRAL}>
                      {link.classification || "NEUTRAL"}
                    </Badge>
                    {link.platform_name && (
                      <Badge variant="outline" className="text-xs bg-blue-500/15 text-blue-700 border-blue-500/30">
                        {link.platform_name}
                      </Badge>
                    )}
                    {link.retailer_name && (
                      <Badge variant="outline" className="text-xs bg-purple-500/15 text-purple-700 border-purple-500/30">
                        {link.retailer_name}
                      </Badge>
                    )}
                    <a
                      href={link.unshortened_url || link.original_url}
                      target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline truncate max-w-lg"
                    >
                      {link.unshortened_url || link.original_url}
                    </a>
                    {link.domain && (
                      <span className="text-muted-foreground text-xs">({link.domain})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No links found in description.</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Videos() {
  const [searchParams] = useSearchParams();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<VideoFilters>({ title: "", channel: searchParams.get("channel") || "", keyword: "", classification: "" });
  const [debouncedFilters, setDebouncedFilters] = useState<VideoFilters>(filters);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { sortKey, sortDirection, handleSort, sortFn } = useSort<Video>();

  // Debounce text filters by 300ms, classification is instant
  const updateFilter = useCallback((key: keyof VideoFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    if (key === "classification") {
      setDebouncedFilters(f => ({ ...f, [key]: value }));
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedFilters(f => ({ ...f, [key]: value }));
      }, 300);
    }
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const { videos, stats, isLoading, isStatsLoading, refresh, page, totalCount, hasMore, goToPage, pageSize } = useVideos(debouncedFilters);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Sort only (filtering is server-side now)
  const sortedVideos = useMemo(() => {
    return sortFn(videos, (item, key) => {
      switch (key) {
        case "title": return item.title;
        case "channel": return item.channel_name;
        case "views": return item.view_count;
        case "likes": return item.like_count;
        case "rank": return item.best_rank;
        case "published": return item.published_at;
        case "links": return item.links.length;
        default: return null;
      }
    });
  }, [videos, sortFn]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const statCards = [
    { label: "Total Videos", value: stats.totalVideos, icon: VideoIcon, color: "text-primary" },
    { label: "Total Links", value: stats.totalLinks, icon: Link2, color: "text-purple-500" },
    { label: "Unique Channels", value: stats.uniqueChannels, icon: Users, color: "text-blue-500" },
    { label: "Aff. Platforms", value: stats.uniquePlatforms, icon: Globe, color: "text-green-500" },
    { label: "Retailers", value: stats.uniqueRetailers, icon: Store, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Videos</h1>
          <p className="text-muted-foreground mt-1">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} videos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={isDownloading} onClick={async () => {
            setIsDownloading(true);
            try { await downloadAllVideosCSV(); } catch { /* toast handled inside */ }
            setIsDownloading(false);
          }}>
            <Download className="h-4 w-4 mr-2" /> {isDownloading ? "Exporting..." : "Download CSV"}
          </Button>
          <Button variant="default" size="sm" disabled={isExporting} onClick={async () => {
            setIsExporting(true);
            const tId = toast.loading("Preparing export...");
            try {
              await exportFullReport((msg) => toast.loading(msg, { id: tId }));
              toast.success("Excel report downloaded", { id: tId });
            } catch (e: any) {
              toast.error("Export failed: " + (e?.message || "Unknown error"), { id: tId });
            }
            setIsExporting(false);
          }}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> {isExporting ? "Exporting..." : "Export Full Report"}
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
                  {isStatsLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <p className="text-2xl font-bold">{s.value}</p>
                  )}
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
            <VideoIcon className="h-5 w-5" /> Fetched Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
          ) : videos.length === 0 && page === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No videos yet. Fetch videos by running keyword jobs from the Keywords page.
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[700px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead className="w-[50px]">Thumb</TableHead>
                      <SortableHeader label="Title" sortKey="title" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                      <SortableHeader label="Channel" sortKey="channel" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                      <TableHead>Keywords</TableHead>
                      <SortableHeader label="Rank" sortKey="rank" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Views" sortKey="views" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Likes" sortKey="likes" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Links" sortKey="links" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                      <TableHead>Platforms</TableHead>
                      <TableHead>Retailers</TableHead>
                      <SortableHeader label="Published" sortKey="published" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/30">
                      <TableHead />
                      <TableHead />
                       <TableHead><Input placeholder="Filter title..." className="h-7 text-xs" value={filters.title} onChange={(e) => updateFilter("title", e.target.value)} /></TableHead>
                       <TableHead><Input placeholder="Filter channel..." className="h-7 text-xs" value={filters.channel} onChange={(e) => updateFilter("channel", e.target.value)} /></TableHead>
                       <TableHead><Input placeholder="Filter keyword..." className="h-7 text-xs" value={filters.keyword} onChange={(e) => updateFilter("keyword", e.target.value)} /></TableHead>
                      <TableHead />
                      <TableHead />
                      <TableHead />
                      <TableHead />
                      <TableHead />
                      <TableHead>
                        <Select value={filters.classification} onValueChange={(v) => updateFilter("classification", v === "all" ? "" : v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="OWN">Own</SelectItem>
                            <SelectItem value="COMPETITOR">Competitor</SelectItem>
                            <SelectItem value="NEUTRAL">Neutral</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableHead>
                      <TableHead />
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedVideos.map((v) => {
                      const platformShares = getPlatformShares(v);
                      const retailerShares = getRetailerShares(v);
                      return (
                        <>
                          <TableRow key={v.id} className="cursor-pointer" onClick={() => toggleExpand(v.id)}>
                            <TableCell>
                              {expandedIds.has(v.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell>
                              {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" className="w-12 h-8 rounded object-cover" /> : <div className="w-12 h-8 rounded bg-muted" />}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <a
                                href={`https://www.youtube.com/watch?v=${v.video_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-sm text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExpandableText text={v.title} maxLength={80} />
                              </a>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{v.channel_name}</TableCell>
                            <TableCell>
                              {v.keywords.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {v.keywords.map((kw) => (<Badge key={kw.id} variant="secondary" className="text-xs">{kw.keyword}</Badge>))}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{v.best_rank != null ? `#${v.best_rank}` : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(v.view_count)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(v.like_count)}</TableCell>
                            <TableCell>
                              {v.links.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {v.links.slice(0, 3).map((link) => (
                                    <Badge key={link.id} variant="outline" className="text-xs truncate max-w-[150px]">
                                      {link.domain || new URL(link.original_url).hostname}
                                    </Badge>
                                  ))}
                                  {v.links.length > 3 && <Badge variant="secondary" className="text-xs">+{v.links.length - 3}</Badge>}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              {platformShares.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {platformShares.map((e) => (
                                    <Badge key={e.name} variant="outline" className="text-xs bg-blue-500/15 text-blue-700 border-blue-500/30">
                                      {e.name} {e.share}%
                                    </Badge>
                                  ))}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              {retailerShares.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {retailerShares.map((e) => (
                                    <Badge key={e.name} variant="outline" className="text-xs bg-purple-500/15 text-purple-700 border-purple-500/30">
                                      {e.name} {e.share}%
                                    </Badge>
                                  ))}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {v.published_at ? format(new Date(v.published_at), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </TableCell>
                          </TableRow>
                          {expandedIds.has(v.id) && <VideoDetailRow key={`${v.id}-detail`} video={v} />}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages || 1}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => goToPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => goToPage(page + 1)}>
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
