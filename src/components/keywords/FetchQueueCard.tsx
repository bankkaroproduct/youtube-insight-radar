import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, Loader2, CheckCircle2, XCircle, Clock, Skull, Eraser, RotateCw, AlertTriangle, Skull as SkullIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { FetchJob } from "@/hooks/useFetchJobs";
import { useState } from "react";

interface Props {
  jobs: FetchJob[];
  onKillAll: () => void;
  onClearFinished: () => void;
  onRetry: (id: string) => void;
}

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  dead_letter: <SkullIcon className="h-4 w-4 text-destructive" />,
};

export function FetchQueueCard({ jobs, onKillAll, onClearFinished, onRetry }: Props) {
  const [open, setOpen] = useState(true);
  const activeCount = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const deadLetterCount = jobs.filter((j) => j.status === "dead_letter").length;

  if (jobs.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Fetch Queue
              {activeCount > 0 && <Badge className="bg-primary text-primary-foreground">{activeCount} active</Badge>}
              {deadLetterCount > 0 && <Badge variant="destructive">{deadLetterCount} dead-letter</Badge>}
            </CardTitle>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {deadLetterCount > 0 && (
              <Alert variant="destructive" className="mb-3 py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {deadLetterCount} dead-letter job(s) — hit max retries. Review failures before re-queuing.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={onKillAll}><Skull className="mr-1 h-3 w-3" /> Kill All</Button>
              <Button variant="ghost" size="sm" onClick={onClearFinished}><Eraser className="mr-1 h-3 w-3" /> Clear Finished</Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-auto">
              {jobs.map((job) => {
                const canRetry = job.status === "failed" || job.status === "dead_letter";
                const attempts = job.attempt_count ?? 0;
                const maxAttempts = job.max_attempts ?? 3;
                return (
                  <div key={job.id} className="flex items-center gap-3 text-sm rounded-md border p-2">
                    {statusIcon[job.status] || statusIcon.pending}
                    <span className="font-medium truncate flex-1">{job.keyword}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ({attempts}/{maxAttempts})
                    </span>
                    {job.videos_found != null && (
                      <span className="text-xs text-muted-foreground">{job.videos_found} videos</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                    {canRetry && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => onRetry(job.id)}
                        title={job.last_failure_reason || "Retry"}
                      >
                        <RotateCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
