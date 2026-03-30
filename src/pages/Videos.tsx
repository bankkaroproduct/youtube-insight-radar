import { useState } from "react";
import { useVideos, Video } from "@/hooks/useVideos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video as VideoIcon, RefreshCw, ExternalLink, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const classificationColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground border-border",
};

function getUniqueAffiliates(video: Video): string[] {
  const names = new Set<string>();
  for (const link of video.links) {
    if (link.affiliate_name) names.add(link.affiliate_name);
  }
  return [...names];
}

function VideoDetailRow({ video }: { video: Video }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={10} className="p-4">
        <div className="space-y-3">
          {video.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap max-h-40 overflow-auto">{video.description}</p>
            </div>
          )}
          {video.links.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Extracted Links ({video.links.length})
              </p>
              <div className="space-y-1">
                {video.links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={classificationColors[link.classification || "NEUTRAL"] || classificationColors.NEUTRAL}>
                      {link.classification || "NEUTRAL"}
                    </Badge>
                    {link.affiliate_name && (
                      <span className="text-xs font-medium text-foreground">{link.affiliate_name}</span>
                    )}
                    <a
                      href={link.unshortened_url || link.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate max-w-lg"
                    >
                      {link.unshortened_url || link.original_url}
                    </a>
                    {link.domain && (
                      <span className="text-muted-foreground text-xs">({link.domain})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No links found in description.</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Videos() {
  const { videos, isLoading, refresh } = useVideos();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
            <VideoIcon className="h-5 w-5" /> Fetched Videos
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
            <div className="overflow-auto max-h-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead className="w-[50px]">Thumb</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Links</TableHead>
                    <TableHead>Affiliates</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map((v) => {
                    const affiliates = getUniqueAffiliates(v);
                    return (
                      <>
                        <TableRow key={v.id} className="cursor-pointer" onClick={() => toggleExpand(v.id)}>
                          <TableCell>
                            {expandedIds.has(v.id) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            {v.thumbnail_url ? (
                              <img src={v.thumbnail_url} alt="" className="w-12 h-8 rounded object-cover" />
                            ) : (
                              <div className="w-12 h-8 rounded bg-muted" />
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <div className="font-medium">{v.title}</div>
                            {v.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{v.description.slice(0, 100)}</p>
                            )}
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
                            {v.links.length > 0 ? (
                              <Badge variant="secondary">{v.links.length}</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {affiliates.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {affiliates.map((name) => (
                                  <Badge key={name} variant="outline" className="bg-red-500/15 text-red-700 border-red-500/30 text-xs">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {v.published_at ? format(new Date(v.published_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <a
                              href={`https://www.youtube.com/watch?v=${v.video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </TableCell>
                        </TableRow>
                        {expandedIds.has(v.id) && <VideoDetailRow key={`${v.id}-detail`} video={v} />}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
