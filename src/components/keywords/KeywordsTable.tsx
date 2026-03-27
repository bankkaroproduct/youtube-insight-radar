import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { KeywordSearchRun } from "@/hooks/useKeywords";
import type { FetchJob } from "@/hooks/useFetchJobs";

interface Props {
  keywords: KeywordSearchRun[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onFetchSingle: (keyword: KeywordSearchRun) => void;
  onDelete: (id: string) => void;
  jobs: FetchJob[];
  isAdmin: boolean;
}

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

export function KeywordsTable({ keywords, selectedIds, onToggleSelect, onSelectAll, onFetchSingle, onDelete, jobs, isAdmin }: Props) {
  const allSelected = keywords.length > 0 && keywords.every((k) => selectedIds.has(k.id));

  const getActiveJob = (keywordId: string) =>
    jobs.find((j) => j.keyword_id === keywordId && (j.status === "pending" || j.status === "processing"));

  const getLastJob = (keywordId: string) =>
    jobs.find((j) => j.keyword_id === keywordId && j.status === "completed");

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
            </TableHead>
            <TableHead>Keyword</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Business Aim</TableHead>
            <TableHead>Last Fetched</TableHead>
            <TableHead>Variations</TableHead>
            <TableHead>Videos</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            {isAdmin && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keywords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                No keywords found. Add keywords to get started.
              </TableCell>
            </TableRow>
          ) : (
            keywords.map((k) => {
              const activeJob = getActiveJob(k.id);
              const lastJob = getLastJob(k.id);
              return (
                <TableRow key={k.id}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(k.id)} onCheckedChange={() => onToggleSelect(k.id)} />
                  </TableCell>
                  <TableCell className="font-medium">{k.keyword}</TableCell>
                  <TableCell>
                    {k.priority ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className={priorityColors[k.priority] || ""}>
                            {k.priority}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{k.estimated_volume || "No volume data"}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>{k.category}</TableCell>
                  <TableCell>{k.business_aim}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lastJob?.completed_at ? (
                      <Tooltip>
                        <TooltipTrigger>{formatDistanceToNow(new Date(lastJob.completed_at), { addSuffix: true })}</TooltipTrigger>
                        <TooltipContent>{new Date(lastJob.completed_at).toLocaleString()}</TooltipContent>
                      </Tooltip>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {lastJob?.variations_searched?.length ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="secondary">{lastJob.variations_searched.length}</Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {lastJob.variations_searched.join(", ")}
                        </TooltipContent>
                      </Tooltip>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {activeJob ? (
                      <Badge variant="outline" className="bg-warning/15 text-warning-foreground animate-pulse">
                        {activeJob.status === "processing" ? "Processing" : "Pending"}
                      </Badge>
                    ) : lastJob?.videos_found != null ? (
                      lastJob.videos_found
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {k.source === "excel" ? (
                      <Tooltip>
                        <TooltipTrigger><Badge variant="secondary">Excel</Badge></TooltipTrigger>
                        <TooltipContent>{k.source_name}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[k.status] || ""}>
                      {k.status}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onFetchSingle(k)} disabled={!!activeJob}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(k.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
