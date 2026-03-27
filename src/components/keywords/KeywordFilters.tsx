import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { KeywordFilters as Filters, ChannelCategory } from "@/hooks/useKeywords";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  categories: ChannelCategory[];
  sourceFiles: string[];
  userProfiles: { user_id: string; full_name: string | null }[];
}

export function KeywordFilters({ filters, onChange, onClear, categories, sourceFiles, userProfiles }: Props) {
  const set = (key: keyof Filters, val: string) => onChange({ ...filters, [key]: val });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Filter Keywords</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClear}><X className="mr-1 h-3 w-3" /> Clear</Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input placeholder="Search keyword..." value={filters.keyword} onChange={(e) => set("keyword", e.target.value)} />
        <Select value={filters.category || "all"} onValueChange={(v) => set("category", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status || "all"} onValueChange={(v) => set("status", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="no_results">No Results</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.source || "all"} onValueChange={(v) => set("source", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            {sourceFiles.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.priority || "all"} onValueChange={(v) => set("priority", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {["P1", "P2", "P3", "P4", "P5"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            <SelectItem value="unclassified">Unclassified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.uploadedBy || "all"} onValueChange={(v) => set("uploadedBy", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Uploaded By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {userProfiles.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || "Unknown"}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
