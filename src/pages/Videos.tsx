import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2, Video, Eye, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface VideoForm {
  video_url: string;
  title: string;
  channel_name: string;
  views: number;
  likes: number;
  published_at: string;
  status: string;
}

const defaultForm: VideoForm = { video_url: "", title: "", channel_name: "", views: 0, likes: 0, published_at: "", status: "tracking" };

export default function Videos() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VideoForm>(defaultForm);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["tracked_videos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tracked_videos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: VideoForm) => {
      const payload = { ...values, views: values.views, likes: values.likes, published_at: values.published_at || null };
      if (editingId) {
        const { error } = await supabase.from("tracked_videos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tracked_videos").insert({ ...payload, user_id: session!.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked_videos"] });
      toast.success(editingId ? "Video updated" : "Video added");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracked_videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked_videos"] });
      toast.success("Video removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(defaultForm); };
  const openEdit = (v: any) => {
    setEditingId(v.id);
    setForm({ video_url: v.video_url, title: v.title || "", channel_name: v.channel_name || "", views: v.views || 0, likes: v.likes || 0, published_at: v.published_at ? v.published_at.split("T")[0] : "", status: v.status });
    setDialogOpen(true);
  };

  const filtered = videos.filter((v) => (v.title || "").toLowerCase().includes(search.toLowerCase()) || (v.channel_name || "").toLowerCase().includes(search.toLowerCase()));

  const formatNum = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Videos</h1>
          <p className="text-muted-foreground mt-1">Discover and track YouTube videos.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Video</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search videos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {videos.length === 0 ? "No videos tracked yet. Add a YouTube video URL to get started." : "No videos match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Likes</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary truncate max-w-[250px]">
                          {v.title || v.video_url}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.channel_name || "—"}</TableCell>
                    <TableCell><span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNum(Number(v.views) || 0)}</span></TableCell>
                    <TableCell><span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatNum(Number(v.likes) || 0)}</span></TableCell>
                    <TableCell className="text-muted-foreground">{v.published_at ? format(new Date(v.published_at), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell><Badge variant={v.status === "tracking" ? "default" : "secondary"}>{v.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editingId ? "Edit Video" : "Add Video"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">YouTube URL</label><Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." /></div>
            <div><label className="text-sm font-medium">Title</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Video title" /></div>
            <div><label className="text-sm font-medium">Channel</label><Input value={form.channel_name} onChange={(e) => setForm({ ...form, channel_name: e.target.value })} placeholder="Channel name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Views</label><Input type="number" value={form.views} onChange={(e) => setForm({ ...form, views: parseInt(e.target.value) || 0 })} /></div>
              <div><label className="text-sm font-medium">Likes</label><Input type="number" value={form.likes} onChange={(e) => setForm({ ...form, likes: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><label className="text-sm font-medium">Published Date</label><Input type="date" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tracking">Tracking</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => upsertMutation.mutate(form)} disabled={!form.video_url.trim() || upsertMutation.isPending}>
              {editingId ? "Save Changes" : "Add Video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
