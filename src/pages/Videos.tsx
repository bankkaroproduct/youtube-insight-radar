import { useVideos } from "@/hooks/useVideos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, RefreshCw, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export default function Videos() {
  const { videos, isLoading, refresh } = useVideos();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Videos</h1>
          <p className="text-muted-foreground mt-1">
            {videos.length} videos fetched from YouTube.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Video className="h-5 w-5" /> Fetched Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No videos yet. Fetch videos by running keyword jobs from the Keywords page.
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Thumb</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        {v.thumbnail_url ? (
                          <img
                            src={v.thumbnail_url}
                            alt=""
                            className="w-12 h-8 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-8 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate font-medium">
                        {v.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.channel_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(v.view_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(v.like_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(v.comment_count)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.published_at
                          ? format(new Date(v.published_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://www.youtube.com/watch?v=${v.video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
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
