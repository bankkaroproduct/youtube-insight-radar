import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Hash, CheckCircle2, Clock, Video, Link as LinkIcon } from "lucide-react";
import { fetchAllKeywordsForAnalytics, type KeywordSearchRun } from "@/hooks/useKeywords";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { SortableHeader, useSort } from "@/components/ui/SortableHeader";

const priorityColors: Record<string, string> = {
  P1: "bg-destructive/15 text-destructive border-destructive/30",
  P2: "bg-warning/15 text-warning-foreground border-warning/30",
  P3: "bg-yellow-100 text-yellow-800 border-yellow-300",
  P4: "bg-info/15 text-info-foreground border-info/30",
  P5: "bg-muted text-muted-foreground border-border",
};

const statusColors: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  no_results: "bg-muted text-muted-foreground border-border",
};

export default function KeywordTable() {
  useEffect(() => { document.title = "Keyword Table | YT Intel"; }, []);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [allKeywords, setAllKeywords] = useState<KeywordSearchRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableFilters, setTableFilters] = useState({ keyword: "", category: "", source: "", priority: "", status: "", businessAim: "" });
  const [keywordStats, setKeywordStats] = useState<Map<string, { video_count: number; link_count: number }>>(new Map());
  const [uniqueVideoCount, setUniqueVideoCount] = useState(0);
  const [totalLinkCount, setTotalLinkCount] = useState(0);
  const { sortKey, sortDirection, handleSort, sortFn } = useSort<any>();

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [all, statsRes, videoCountRes, linkCountRes] = await Promise.all([
          fetchAllKeywordsForAnalytics(),
          supabase.rpc("get_keyword_stats"),
          supabase.from("videos").select("id", { count: "exact", head: true }),
          supabase.from("video_links").select("id", { count: "exact", head: true }),
        ]);
        setAllKeywords(all);
        if (!statsRes.error && statsRes.data) {
          const map = new Map<string, { video_count: number; link_count: number }>();
          for (const row of statsRes.data as any[]) {
            map.set(row.keyword_id, { video_count: Number(row.video_count), link_count: Number(row.link_count) });
          }
          setKeywordStats(map);
        }
        setUniqueVideoCount(videoCountRes.count ?? 0);
        setTotalLinkCount(linkCountRes.count ?? 0);
      } catch (e: any) {
        toast.error("Failed to load keyword analytics: " + (e?.message || "Unknown error"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return allKeywords.filter((k) => {
      if (tableFilters.keyword && !k.keyword.toLowerCase().includes(tableFilters.keyword.toLowerCase())) return false;
      if (tableFilters.category && !k.category.toLowerCase().includes(tableFilters.category.toLowerCase())) return false;
      if (tableFilters.businessAim && !k.business_aim.toLowerCase().includes(tableFilters.businessAim.toLowerCase())) return false;
      if (tableFilters.source && k.source !== tableFilters.source && k.source_name !== tableFilters.source) return false;
      if (tableFilters.priority && k.priority !== tableFilters.priority) return false;
      if (tableFilters.status && k.status !== tableFilters.status) return false;
      return true;
    });
  }, [allKeywords, tableFilters]);

  const sortedData = useMemo(() => {
    return sortFn(filtered, (item: any, key: string) => {
      switch (key) {
        case "keyword": return item.keyword;
        case "category": return item.category;
        case "businessAim": return item.business_aim;
        case "source": return item.source;
        case "priority": return item.priority || "";
        case "videos": return keywordStats.get(item.id)?.video_count ?? 0;
        case "links": return keywordStats.get(item.id)?.link_count ?? 0;
        case "lastRun": return item.run_date;
        case "status": return item.status;
        default: return null;
      }
    });
  }, [filtered, sortFn, keywordStats]);

  const stats = useMemo(() => {
    return {
      total: allKeywords.length,
      completed: allKeywords.filter((k) => k.status === "completed").length,
      pending: allKeywords.filter((k) => k.status === "pending").length,
      videos: uniqueVideoCount,
      links: totalLinkCount,
    };
  }, [allKeywords, uniqueVideoCount, totalLinkCount]);

  const exportFiltered = () => {
    const data = filtered.map((k) => ({
      Keyword: k.keyword, Category: k.category, "Business Aim": k.business_aim,
      Source: k.source, Priority: k.priority || "", Status: k.status,
      Videos: keywordStats.get(k.id)?.video_count ?? 0,
      Links: keywordStats.get(k.id)?.link_count ?? 0,
      "Last Run": k.run_date,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Keywords");
    XLSX.writeFile(wb, `keyword_analytics_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const statCards = [
    { label: "Total Keywords", value: stats.total, icon: Hash, color: "text-primary" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-green-500" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-500" },
    { label: "Total Videos", value: stats.videos, icon: Video, color: "text-blue-500" },
    { label: "Total Links", value: stats.links, icon: LinkIcon, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Keyword Table</h1>
          <p className="text-muted-foreground mt-1">Read-only analytics view of all keywords.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={exportFiltered} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        )}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader label="Keyword" sortKey="keyword" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Category" sortKey="category" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Business Aim" sortKey="businessAim" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Source" sortKey="source" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Priority" sortKey="priority" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Videos" sortKey="videos" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Links" sortKey="links" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Last Run" sortKey="lastRun" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            </TableRow>
            {/* Filter row */}
            <TableRow className="bg-muted/30">
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.keyword} onChange={(e) => setTableFilters((f) => ({ ...f, keyword: e.target.value }))} /></TableHead>
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.category} onChange={(e) => setTableFilters((f) => ({ ...f, category: e.target.value }))} /></TableHead>
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.businessAim} onChange={(e) => setTableFilters((f) => ({ ...f, businessAim: e.target.value }))} /></TableHead>
              <TableHead>
                <Select value={tableFilters.source} onValueChange={(v) => setTableFilters(f => ({ ...f, source: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={tableFilters.priority} onValueChange={(v) => setTableFilters(f => ({ ...f, priority: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="P1">P1</SelectItem>
                    <SelectItem value="P2">P2</SelectItem>
                    <SelectItem value="P3">P3</SelectItem>
                    <SelectItem value="P4">P4</SelectItem>
                    <SelectItem value="P5">P5</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
              <TableHead>
                <Select value={tableFilters.status} onValueChange={(v) => setTableFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : sortedData.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No keywords found.</TableCell></TableRow>
            ) : sortedData.map((k: any) => {
              const kStats = keywordStats.get(k.id);
              return (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.keyword}</TableCell>
                  <TableCell>{k.category}</TableCell>
                  <TableCell>{k.business_aim}</TableCell>
                  <TableCell>
                    {k.source === "excel" ? <Badge variant="secondary">Excel</Badge> : <Badge variant="outline">Manual</Badge>}
                  </TableCell>
                  <TableCell>
                    {k.priority ? (
                      <Badge variant="outline" className={priorityColors[k.priority] || ""}>{k.priority}</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">—</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => navigate(`/videos?keyword=${encodeURIComponent(k.keyword)}`)}>
                      {kStats?.video_count ?? 0}
                    </Button>
                  </TableCell>
                  <TableCell>{kStats?.link_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{k.run_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[k.status] || ""}>{k.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
