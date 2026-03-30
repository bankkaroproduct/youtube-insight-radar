import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Hash, CheckCircle2, Clock, Video, Link as LinkIcon } from "lucide-react";
import { useKeywords } from "@/hooks/useKeywords";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";

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
  const { allKeywords, isLoading } = useKeywords();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tableFilters, setTableFilters] = useState({ keyword: "", category: "", source: "", priority: "", status: "" });
  const [keywordStats, setKeywordStats] = useState<Map<string, { video_count: number; link_count: number }>>(new Map());

  // Fetch real stats from the DB function
  useEffect(() => {
    async function fetchStats() {
      const { data, error } = await supabase.rpc("get_keyword_stats");
      if (!error && data) {
        const map = new Map<string, { video_count: number; link_count: number }>();
        for (const row of data as any[]) {
          map.set(row.keyword_id, { video_count: Number(row.video_count), link_count: Number(row.link_count) });
        }
        setKeywordStats(map);
      }
    }
    fetchStats();
  }, [allKeywords]);

  const filtered = useMemo(() => {
    return allKeywords.filter((k) => {
      if (tableFilters.keyword && !k.keyword.toLowerCase().includes(tableFilters.keyword.toLowerCase())) return false;
      if (tableFilters.category && !k.category.toLowerCase().includes(tableFilters.category.toLowerCase())) return false;
      if (tableFilters.source && k.source !== tableFilters.source && k.source_name !== tableFilters.source) return false;
      if (tableFilters.priority && k.priority !== tableFilters.priority) return false;
      if (tableFilters.status && k.status !== tableFilters.status) return false;
      return true;
    });
  }, [allKeywords, tableFilters]);

  const stats = useMemo(() => {
    let totalVideos = 0;
    let totalLinks = 0;
    for (const s of keywordStats.values()) {
      totalVideos += s.video_count;
      totalLinks += s.link_count;
    }
    return {
      total: allKeywords.length,
      completed: allKeywords.filter((k) => k.status === "completed").length,
      pending: allKeywords.filter((k) => k.status === "pending").length,
      videos: totalVideos,
      links: totalLinks,
    };
  }, [allKeywords, keywordStats]);

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
          <Button variant="outline" size="sm" onClick={exportFiltered}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        )}
      </div>

      {/* Stats Cards */}
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

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Business Aim</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Videos</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
            {/* Filter row */}
            <TableRow className="bg-muted/30">
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.keyword} onChange={(e) => setTableFilters((f) => ({ ...f, keyword: e.target.value }))} /></TableHead>
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.category} onChange={(e) => setTableFilters((f) => ({ ...f, category: e.target.value }))} /></TableHead>
              <TableHead />
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.source} onChange={(e) => setTableFilters((f) => ({ ...f, source: e.target.value }))} /></TableHead>
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.priority} onChange={(e) => setTableFilters((f) => ({ ...f, priority: e.target.value }))} /></TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
              <TableHead><Input placeholder="Filter..." className="h-7 text-xs" value={tableFilters.status} onChange={(e) => setTableFilters((f) => ({ ...f, status: e.target.value }))} /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No keywords found.</TableCell></TableRow>
            ) : filtered.map((k) => {
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
