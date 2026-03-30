import { useMemo } from "react";
import { useChannels } from "@/hooks/useChannels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, RefreshCw, BarChart3, Mail, CheckCircle2, AlertTriangle, HelpCircle, Shuffle } from "lucide-react";
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

  const stats = useMemo(() => ({
    total: channels.length,
    withUs: channels.filter((c: any) => c.affiliate_status === "WITH_US").length,
    competitor: channels.filter((c: any) => c.affiliate_status === "COMPETITOR").length,
    mixed: channels.filter((c: any) => c.affiliate_status === "MIXED").length,
    neutral: channels.filter((c: any) => !c.affiliate_status || c.affiliate_status === "NEUTRAL").length,
  }), [channels]);

  const statCards = [
    { label: "Total Channels", value: stats.total, icon: Users, color: "text-primary" },
    { label: "With Us", value: stats.withUs, icon: CheckCircle2, color: "text-green-500" },
    { label: "Competitor", value: stats.competitor, icon: AlertTriangle, color: "text-red-500" },
    { label: "Mixed", value: stats.mixed, icon: Shuffle, color: "text-orange-500" },
    { label: "Neutral", value: stats.neutral, icon: HelpCircle, color: "text-muted-foreground" },
  ];

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
