import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { FetchSettings } from "./FetchSettingsCard";
import { format } from "date-fns";

interface Props {
  selectedCount: number;
  settings: FetchSettings;
  onFetch: () => void;
  loading: boolean;
}

export function BulkActionBar({ selectedCount, settings, onFetch, loading }: Props) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-3">
      <span className="text-sm font-medium">{selectedCount} keyword{selectedCount > 1 ? "s" : ""} selected</span>
      <span className="text-xs text-muted-foreground">
        Ranking: {settings.orderBy}
        {settings.publishedAfter && ` · After ${format(settings.publishedAfter, "MMM d, yyyy")}`}
      </span>
      <Button size="sm" onClick={onFetch} disabled={loading} className="ml-auto">
        <Play className="mr-2 h-4 w-4" /> {loading ? "Queuing..." : "Fetch Videos for Selected"}
      </Button>
    </div>
  );
}
