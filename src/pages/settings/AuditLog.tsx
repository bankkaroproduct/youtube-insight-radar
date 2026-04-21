import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog, AUDIT_PAGE_SIZE } from "@/hooks/useAuditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ACTION_LABELS: Record<string, string> = {
  role_changed: "Role changed",
  ip_whitelist_added: "IP added",
  ip_whitelist_removed: "IP removed",
  ip_whitelist_toggled: "IP toggled",
  api_keys_added: "API keys added",
  api_keys_deleted: "API keys deleted",
  api_quota_reset: "API quota reset",
  keyword_deleted: "Keyword deleted",
  video_links_reset: "Links reset",
  fetch_jobs_killed: "Fetch jobs killed",
  user_active_toggled: "User activated/deactivated",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  role_changed: "default",
  ip_whitelist_added: "default",
  ip_whitelist_removed: "destructive",
  ip_whitelist_toggled: "secondary",
  api_keys_added: "default",
  api_keys_deleted: "destructive",
  api_quota_reset: "secondary",
  keyword_deleted: "destructive",
  video_links_reset: "destructive",
  fetch_jobs_killed: "destructive",
};

export default function AuditLog() {
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const { entries, totalCount, isLoading } = useAuditLog(page, actionFilter);

  useEffect(() => {
    document.title = "Audit Log | YT Intel";
  }, []);

  useEffect(() => {
    setPage(0);
  }, [actionFilter]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / AUDIT_PAGE_SIZE));
  const hasMore = (page + 1) * AUDIT_PAGE_SIZE < totalCount;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">Record of admin actions across the app.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Events</CardTitle>
          <Select
            value={actionFilter || "all"}
            onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading && entries.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No events recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{e.actor_email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANTS[e.action] || "outline"}>
                        {ACTION_LABELS[e.action] || e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.target_type ? `${e.target_type}: ${e.target_id}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-md truncate">
                      {e.details ? JSON.stringify(e.details) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalCount > 0 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
