import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface ChannelForm {
  channel_url: string;
  channel_name: string;
  subscriber_count: number;
  video_count: number;
  category: string;
  business_fit_score: number;
  status: string;
}

const defaultForm: ChannelForm = { channel_url: "", channel_name: "", subscriber_count: 0, video_count: 0, category: "", business_fit_score: 50, status: "tracking" };

export default function Channels() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelForm>(defaultForm);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["tracked_channels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tracked_channels").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: ChannelForm) => {
      if (editingId) {
        const { error } = await supabase.from("tracked_channels").update(values).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tracked_channels").insert({ ...values, user_id: session!.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked_channels"] });
      toast.success(editingId ? "Channel updated" : "Channel added");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracked_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked_channels"] });
      toast.success("Channel removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(defaultForm); };
  const openEdit = (ch: any) => {
    setEditingId(ch.id);
    setForm({ channel_url: ch.channel_url, channel_name: ch.channel_name, subscriber_count: Number(ch.subscriber_count) || 0, video_count: ch.video_count || 0, category: ch.category || "", business_fit_score: ch.business_fit_score || 0, status: ch.status });
    setDialogOpen(true);
  };

  const filtered = channels.filter((ch) => ch.channel_name.toLowerCase().includes(search.toLowerCase()) || (ch.category || "").toLowerCase().includes(search.toLowerCase()));

  const formatNum = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toString();

  const scoreColor = (s: number) => s >= 70 ? "text-green-600" : s >= 40 ? "text-yellow-600" : "text-destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Channels</h1>
          <p className="text-muted-foreground mt-1">Channel intelligence and analysis.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Channel</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search channels..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {channels.length === 0 ? "No channels tracked yet. Add a YouTube channel to get started." : "No channels match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Videos</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Business Fit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={ch.channel_url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary">
                          {ch.channel_name}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>{formatNum(Number(ch.subscriber_count) || 0)}</TableCell>
                    <TableCell>{ch.video_count?.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{ch.category || "—"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={ch.business_fit_score || 0} className="h-2 flex-1" />
                        <span className={`text-sm font-medium ${scoreColor(ch.business_fit_score || 0)}`}>{ch.business_fit_score}%</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={ch.status === "tracking" ? "default" : "secondary"}>{ch.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ch)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(ch.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle className="font-display">{editingId ? "Edit Channel" : "Add Channel"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Channel URL</label><Input value={form.channel_url} onChange={(e) => setForm({ ...form, channel_url: e.target.value })} placeholder="https://youtube.com/@channelname" /></div>
            <div><label className="text-sm font-medium">Channel Name</label><Input value={form.channel_name} onChange={(e) => setForm({ ...form, channel_name: e.target.value })} placeholder="Channel name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Subscribers</label><Input type="number" value={form.subscriber_count} onChange={(e) => setForm({ ...form, subscriber_count: parseInt(e.target.value) || 0 })} /></div>
              <div><label className="text-sm font-medium">Video Count</label><Input type="number" value={form.video_count} onChange={(e) => setForm({ ...form, video_count: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><label className="text-sm font-medium">Category</label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Tech Reviews, Gaming" /></div>
            <div>
              <label className="text-sm font-medium">Business Fit Score: {form.business_fit_score}%</label>
              <Input type="range" min={0} max={100} value={form.business_fit_score} onChange={(e) => setForm({ ...form, business_fit_score: parseInt(e.target.value) })} className="h-2 mt-1" />
            </div>
            <div><label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tracking">Tracking</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => upsertMutation.mutate(form)} disabled={!form.channel_name.trim() || !form.channel_url.trim() || upsertMutation.isPending}>
              {editingId ? "Save Changes" : "Add Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
