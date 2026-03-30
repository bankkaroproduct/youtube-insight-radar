import { useChannels } from "@/hooks/useChannels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, RefreshCw, BarChart3, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const statusColors: Record<string, string> = {
  WITH_US: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  MIXED: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

export default function Channels() {
  const { channels, isLoading, refresh, recomputeStats } = useChannels();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Channels</h1>
          <p className="text-muted-foreground mt-1">
            {channels.length} channels discovered. Median stats skip top/bottom 5 videos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => recomputeStats()}>
            <BarChart3 className="h-4 w-4 mr-2" /> Recompute Stats
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5" /> Channel Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : channels.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No channels yet. Channels are auto-discovered when videos are fetched.
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Subscribers</TableHead>
                    <TableHead className="text-right">Videos</TableHead>
                    <TableHead className="text-right">Median Views</TableHead>
                    <TableHead className="text-right">Median Likes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Affiliates</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((ch: any) => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium">
                        <a
                          href={ch.channel_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {ch.channel_name}
                        </a>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ch.subscriber_count ? formatNumber(ch.subscriber_count) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ch.total_videos_fetched}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(ch.median_views)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(ch.median_likes)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[ch.affiliate_status] || statusColors.NEUTRAL}
                        >
                          {ch.affiliate_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {ch.affiliate_names?.length > 0
                          ? ch.affiliate_names.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {ch.contact_email ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <a href={`mailto:${ch.contact_email}`} className="text-primary hover:underline flex items-center gap-1">
                                <Mail className="h-3 w-3" /> Email
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>{ch.contact_email}</TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[250px]">
                        {ch.description ? (
                          <Tooltip>
                            <TooltipTrigger className="truncate block max-w-[250px]">
                              {ch.description.substring(0, 60)}…
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm whitespace-pre-wrap">
                              {ch.description}
                            </TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
