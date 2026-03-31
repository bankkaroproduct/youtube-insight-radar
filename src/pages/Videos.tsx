import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useVideos, Video } from "@/hooks/useVideos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video as VideoIcon, RefreshCw, ExternalLink, ChevronDown, ChevronRight, Link2, Tag, Users, AlertTriangle, Globe, Store, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";
import { ExpandableText } from "@/components/ui/ExpandableText";

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

function downloadVideosCSV(videos: Video[]) {
  const allPlatforms = new Set<string>();
  const allRetailers = new Set<string>();
  for (const v of videos) {
    for (const e of getPlatformShares(v)) allPlatforms.add(e.name);
    for (const e of getRetailerShares(v)) allRetailers.add(e.name);
  }
  const platformList = [...allPlatforms].sort();
  const retailerList = [...allRetailers].sort();

  const headers = [
    "Video ID", "Title", "Channel Name", "Keywords", "Best Rank", "Views", "Likes", "Comments", "Published Date", "Total Links",
    ...platformList.flatMap(p => [`Platform: ${p} (count)`, `Platform: ${p} (%)`]),
    ...retailerList.flatMap(r => [`Retailer: ${r} (count)`, `Retailer: ${r} (%)`]),
  ];

  const rows = videos.map(v => {
    const pShares = getPlatformShares(v);
    const rShares = getRetailerShares(v);
    const pMap = new Map(pShares.map(e => [e.name, e]));
    const rMap = new Map(rShares.map(e => [e.name, e]));
    return [
      v.video_id, v.title, v.channel_name,
      v.keywords.map(k => k.keyword).join("; "),
      v.best_rank ?? "",
      v.view_count, v.like_count, v.comment_count,
      v.published_at ? new Date(v.published_at).toISOString().split("T")[0] : "",
      v.links.length,
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
  const { videos, isLoading, refresh } = useVideos();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ title: "", channel: "", keyword: "", classification: "" });
  const { sortKey, sortDirection, handleSort, sortFn } = useSort<Video>();

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredAndSorted = useMemo(() => {
    let result = videos.filter((v) => {
      if (filters.title && !v.title.toLowerCase().includes(filters.title.toLowerCase())) return false;
      if (filters.channel && !v.channel_name.toLowerCase().includes(filters.channel.toLowerCase())) return false;
      if (filters.keyword && !v.keywords.some(k => k.keyword.toLowerCase().includes(filters.keyword.toLowerCase()))) return false;
      if (filters.classification) {
        const hasMatch = v.links.some(l => l.classification === filters.classification);
        if (!hasMatch) return false;
      }
      return true;
    });

    return sortFn(result, (item, key) => {
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
  }, [videos, filters, sortFn]);

  const stats = useMemo(() => {
    const allLinks = videos.flatMap((v) => v.links);
    const uniqueChannels = new Set(videos.map((v) => v.channel_id));
    const uniquePlatforms = new Set<string>();
    const uniqueRetailers = new Set<string>();
    for (const v of videos) {
      for (const name of getUniquePlatforms(v)) uniquePlatforms.add(name);
      for (const name of getUniqueRetailers(v)) uniqueRetailers.add(name);
    }
    return {
      totalVideos: videos.length,
      totalLinks: allLinks.length,
      uniqueChannels: uniqueChannels.size,
      uniquePlatforms: uniquePlatforms.size,
      uniqueRetailers: uniqueRetailers.size,
    };
  }, [videos]);

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
          <p className="text-muted-foreground mt-1">{videos.length} videos fetched from YouTube.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
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
            <VideoIcon className="h-5 w-5" /> Fetched Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
          ) : videos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No videos yet. Fetch videos by running keyword jobs from the Keywords page.
            </div>
          ) : (
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
                    <TableHead><Input placeholder="Filter title..." className="h-7 text-xs" value={filters.title} onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))} /></TableHead>
                    <TableHead><Input placeholder="Filter channel..." className="h-7 text-xs" value={filters.channel} onChange={(e) => setFilters(f => ({ ...f, channel: e.target.value }))} /></TableHead>
                    <TableHead><Input placeholder="Filter keyword..." className="h-7 text-xs" value={filters.keyword} onChange={(e) => setFilters(f => ({ ...f, keyword: e.target.value }))} /></TableHead>
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead />
                    <TableHead>
                      <Select value={filters.classification} onValueChange={(v) => setFilters(f => ({ ...f, classification: v === "all" ? "" : v }))}>
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
                  {filteredAndSorted.map((v) => {
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
                            <ExpandableText text={v.title} maxLength={80} className="font-medium text-sm" />
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
