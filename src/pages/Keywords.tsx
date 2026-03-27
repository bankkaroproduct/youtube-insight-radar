import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface KeywordForm {
  keyword: string;
  search_volume: number;
  competition: string;
  status: string;
}

const defaultForm: KeywordForm = { keyword: "", search_volume: 0, competition: "medium", status: "active" };

export default function Keywords() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<KeywordForm>(defaultForm);

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ["keywords"],
    queryFn: async () => {
      const { data, error } = await supabase.from("keywords").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: KeywordForm) => {
      if (editingId) {
        const { error } = await supabase.from("keywords").update(values).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("keywords").insert({ ...values, user_id: session!.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      toast.success(editingId ? "Keyword updated" : "Keyword added");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("keywords").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      toast.success("Keyword deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(defaultForm); };
  const openEdit = (kw: any) => { setEditingId(kw.id); setForm({ keyword: kw.keyword, search_volume: kw.search_volume, competition: kw.competition, status: kw.status }); setDialogOpen(true); };

  const filtered = keywords.filter((k) => k.keyword.toLowerCase().includes(search.toLowerCase()));

  const competitionColor = (c: string) => c === "low" ? "bg-green-500/15 text-green-700 border-green-500/30" : c === "high" ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-warning/15 text-yellow-700 border-warning/30";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Keywords</h1>
          <p className="text-muted-foreground mt-1">Manage and track your keyword portfolio.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Keyword</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search keywords..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {keywords.length === 0 ? "No keywords yet. Add your first keyword to get started." : "No keywords match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Search Volume</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((kw) => (
                  <TableRow key={kw.id}>
                    <TableCell className="font-medium">{kw.keyword}</TableCell>
                    <TableCell>{kw.search_volume?.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className={competitionColor(kw.competition || "medium")}>{kw.competition}</Badge></TableCell>
                    <TableCell><Badge variant={kw.status === "active" ? "default" : "secondary"}>{kw.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(kw.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(kw)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(kw.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle className="font-display">{editingId ? "Edit Keyword" : "Add Keyword"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Keyword</label><Input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} placeholder="e.g. best budget camera" /></div>
            <div><label className="text-sm font-medium">Search Volume</label><Input type="number" value={form.search_volume} onChange={(e) => setForm({ ...form, search_volume: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="text-sm font-medium">Competition</label>
              <Select value={form.competition} onValueChange={(v) => setForm({ ...form, competition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => upsertMutation.mutate(form)} disabled={!form.keyword.trim() || upsertMutation.isPending}>
              {editingId ? "Save Changes" : "Add Keyword"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
