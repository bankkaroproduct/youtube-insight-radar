import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Gauge, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  activeCount: number;
  total: number;
  remainingCallsToday: number;
  nextResetAt: Date;
}

export function RotationSummaryBanner({ activeCount, total, remainingCallsToday, nextResetAt }: Props) {
  return (
    <Card className="bg-muted/30 border-dashed p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-sm">
              <span className="font-semibold">{activeCount}</span>
              <span className="text-muted-foreground"> of {total} keys active</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-blue-500" />
            <span className="text-sm">
              <span className="text-muted-foreground">Remaining today: </span>
              <span className="font-semibold">~{remainingCallsToday.toLocaleString()}</span>
              <span className="text-muted-foreground"> units</span>
            </span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-help">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">
                    <span className="text-muted-foreground">Next reset: </span>
                    <span className="font-semibold">{formatDistanceToNow(nextResetAt, { addSuffix: true })}</span>
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {nextResetAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} (08:00 UTC)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground">
          Search calls cost 100 units · video/channel fetches cost 1 unit
        </p>
      </div>
    </Card>
  );
}
