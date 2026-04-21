import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { linkProcessingService } from "@/services/linkProcessingService";
import { useAffiliatePatterns, PatternType } from "@/hooks/useAffiliatePatterns";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Link as LinkIcon, Plus, Trash2, Check, RefreshCw, Zap, Store, Globe, Play, RotateCcw, Loader2, Download, Share2, CircleDot } from "lucide-react";
import { BulkUploadDialog } from "@/components/links/BulkUploadDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const classColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

const typeColors: Record<string, string> = {
  affiliate_platform: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  retailer: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  social: "bg-pink-500/15 text-pink-700 border-pink-500/30",
  neutral: "bg-muted text-muted-foreground",
};

const typeLabels: Record<string, string> = {
  affiliate_platform: "Platform",
  retailer: "Retailer",
  social: "Social",
  neutral: "Neutral",
};

function NameDropdown({
  names, value, onChange, onAddNew,
}: {
  names: string[]; value: string; onChange: (v: string) => void; onAddNew: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  if (adding) {
    return (
      <div className="flex gap-1">
        <Input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New name..." className="h-8 text-sm" autoFocus
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              await onAddNew(newName.trim()); onChange(newName.trim());
              setNewName(""); setAdding(false);
            }
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
        />
        <Button size="sm" variant="outline" className="h-8" onClick={async () => {
          if (newName.trim()) { await onAddNew(newName.trim()); onChange(newName.trim()); setNewName(""); setAdding(false); }
        }}>Add</Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => { v === "__add_new__" ? setAdding(true) : onChange(v); }}>
      <SelectTrigger><SelectValue placeholder="Select name..." /></SelectTrigger>
      <SelectContent>
        {names.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
        <SelectItem value="__add_new__" className="text-primary font-medium">+ Add new...</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DiscoveredNamePicker({
  names, onAddNew, onConfirm, classification, label, className,
}: {
  names: string[]; onAddNew: (name: string) => Promise<void>; onConfirm: (name: string) => void;
  classification: string; label: string; className?: string;
}) {
  const [selectedName, setSelectedName] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Check className="h-3 w-3 mr-1" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <Label className="text-sm font-medium">Select competitor name</Label>
        <NameDropdown names={names} value={selectedName} onChange={setSelectedName} onAddNew={onAddNew} />
        <Button size="sm" className="w-full" disabled={!selectedName} onClick={() => { onConfirm(selectedName); setSelectedName(""); }}>
          Confirm as {classification}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function EditableName({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className="cursor-pointer hover:underline" onClick={() => { setDraft(value); setEditing(true); }}>
        {value}
      </span>
    );
  }

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className="h-8 w-[140px] text-sm"
      autoFocus
      onBlur={() => {
        if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { if (draft.trim() && draft.trim() !== value) onSave(draft.trim()); setEditing(false); }
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function PatternTable({
  patterns, onDelete, onUpdateType, onUpdateName, typeLabel,
}: {
  patterns: any[]; onDelete: (id: string) => void; onUpdateType: (id: string, type: PatternType) => void; onUpdateName: (id: string, name: string) => void; typeLabel?: string;
}) {
  if (patterns.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        No {typeLabel || "patterns"} yet.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pattern</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Classification</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="w-[60px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {patterns.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-mono text-sm">{p.pattern}</TableCell>
            <TableCell>
              <EditableName value={p.name} onSave={(name) => onUpdateName(p.id, name)} />
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={classColors[p.classification] || classColors.NEUTRAL}>
                {p.classification}
              </Badge>
            </TableCell>
            <TableCell>
              <Select value={p.type?.toLowerCase() || "affiliate_platform"} onValueChange={(v) => onUpdateType(p.id, v as PatternType)}>
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="affiliate_platform">Platform</SelectItem>
                  <SelectItem value="retailer">Retailer</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {p.is_auto_discovered ? "Auto" : "Manual"}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Links() {
  useEffect(() => { document.title = "Affiliates | YT Intel"; }, []);
  const {
    platformPatterns, retailerPatterns, socialPatterns, neutralPatterns, discoveredPatterns, uniqueNames, isLoading,
    addPattern, confirmPattern, updatePatternType, updatePatternName, deletePattern, processLinks, confirmedPatterns,
  } = useAffiliatePatterns();

  const topServiceState = useSyncExternalStore(
    (cb) => linkProcessingService.subscribe(cb),
    () => linkProcessingService.getState()
  );
  const topRunning = topServiceState.running;

  const addName = async (name: string) => {
    // Names are derived from patterns; adding a pattern with this name will include it
  };

  const downloadCSV = () => {
    const rows = confirmedPatterns.map(p => ({
      Pattern: p.pattern,
      Name: p.name,
      Classification: p.classification,
      Type: typeLabels[p.type?.toLowerCase()] || p.type,
      Source: p.is_auto_discovered ? "Auto" : "Manual",
      "Created At": new Date(p.created_at).toLocaleDateString(),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${(r as any)[h] ?? ""}"`).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "affiliate_patterns.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const [open, setOpen] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState("COMPETITOR");
  const [newType, setNewType] = useState<PatternType>("affiliate_platform");
  const [discoveredTypes, setDiscoveredTypes] = useState<Record<string, PatternType>>({});

  const handleAdd = async () => {
    if (!newPattern || !newName) return;
    await addPattern(newPattern, newName, newClass, newType);
    setNewPattern(""); setNewName(""); setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Affiliates & Retailers</h1>
          <p className="text-muted-foreground mt-1">
            Manage affiliate platform and retailer patterns for link classification.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add Pattern</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Pattern</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as PatternType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="affiliate_platform">Affiliate Platform</SelectItem>
                      <SelectItem value="retailer">Retailer</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Domain / Pattern</Label>
                  <Input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder={newType === "social" ? "e.g. instagram.com" : newType === "retailer" ? "e.g. amazon.in" : "e.g. impact.com"} />
                </div>
                <div>
                  <Label>Display Name</Label>
                  <NameDropdown names={uniqueNames} value={newName} onChange={setNewName} onAddNew={addName} />
                </div>
                <div>
                  <Label>Classification</Label>
                  <Select value={newClass} onValueChange={setNewClass}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OWN">OWN (Ours)</SelectItem>
                      <SelectItem value="COMPETITOR">COMPETITOR</SelectItem>
                      <SelectItem value="NEUTRAL">NEUTRAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={!newPattern || !newName}>Add Pattern</Button>
              </div>
            </DialogContent>
          </Dialog>
          <BulkUploadDialog onUpload={async (rows) => {
            for (const r of rows) {
              await addPattern(r.pattern, r.name, r.classification, r.type);
            }
          }} />
          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={confirmedPatterns.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Download CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => linkProcessingService.start(undefined, 200)}
            disabled={topRunning}
          >
            {topRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
            ) : (
              <><Zap className="h-4 w-4 mr-2" /> Process Links</>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms">
            <Globe className="h-4 w-4 mr-1" /> Platforms ({platformPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="retailers">
            <Store className="h-4 w-4 mr-1" /> Retailers ({retailerPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="socials">
            <Share2 className="h-4 w-4 mr-1" /> Socials ({socialPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="discovered">
            <RefreshCw className="h-4 w-4 mr-1" /> Discovered
            {discoveredPatterns.length > 0 ? (
              <Badge variant="destructive" className="ml-2">{discoveredPatterns.length}</Badge>
            ) : (
              <span className="ml-1 text-muted-foreground">(0)</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="processing">
            <Play className="h-4 w-4 mr-1" /> Processing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Globe className="h-5 w-5" /> Affiliate Platforms
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div>
              ) : (
                <PatternTable patterns={platformPatterns} onDelete={deletePattern} onUpdateType={updatePatternType} onUpdateName={updatePatternName} typeLabel="affiliate platforms" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retailers">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Store className="h-5 w-5" /> Retailers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div>
              ) : (
                <PatternTable patterns={retailerPatterns} onDelete={deletePattern} onUpdateType={updatePatternType} onUpdateName={updatePatternName} typeLabel="retailers" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="socials">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Share2 className="h-5 w-5" /> Social Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div>
              ) : (
                <PatternTable patterns={socialPatterns} onDelete={deletePattern} onUpdateType={updatePatternType} onUpdateName={updatePatternName} typeLabel="social links" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discovered">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <RefreshCw className="h-5 w-5" /> Discovered Patterns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {discoveredPatterns.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No auto-discovered patterns yet. Run "Process Links" to discover new domains.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveredPatterns.map((p) => {
                      const selectedType = discoveredTypes[p.id] || (p.type as PatternType);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">{p.pattern}</TableCell>
                          <TableCell>{p.name}</TableCell>
                          <TableCell>
                            <Select
                              value={selectedType}
                              onValueChange={(v) => setDiscoveredTypes(prev => ({ ...prev, [p.id]: v as PatternType }))}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="affiliate_platform">Platform</SelectItem>
                                <SelectItem value="retailer">Retailer</SelectItem>
                                <SelectItem value="social">Social</SelectItem>
                                <SelectItem value="neutral">Neutral</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="flex gap-1">
                            <DiscoveredNamePicker
                              names={uniqueNames} onAddNew={addName} classification="OWN" label="Ours" className="text-green-700"
                              onConfirm={(name) => confirmPattern(p.id, "OWN", name, selectedType)}
                            />
                            <DiscoveredNamePicker
                              names={uniqueNames} onAddNew={addName} classification="COMPETITOR" label="Competitor" className="text-red-700"
                              onConfirm={(name) => confirmPattern(p.id, "COMPETITOR", name, selectedType)}
                            />
                            <Button variant="outline" size="sm" onClick={() => confirmPattern(p.id, "NEUTRAL", undefined, selectedType)}>
                              <Check className="h-3 w-3 mr-1" /> Neutral
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deletePattern(p.id)} className="h-8 w-8 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processing">
          <ProcessingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProcessingTab() {
  const [stats, setStats] = useState({ total: 0, processed: 0, unprocessed: 0, withPlatform: 0, withRetailer: 0 });
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [batchSize, setBatchSize] = useState(200);
  const logEndRef = useRef<HTMLDivElement>(null);

  const serviceState = useSyncExternalStore(
    (cb) => linkProcessingService.subscribe(cb),
    () => linkProcessingService.getState()
  );
  const running = serviceState.running;
  const logs = serviceState.logs.map((l) => `[${l.time}] ${l.message}`);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [totalRes, processedRes, platformRes, retailerRes] = await Promise.all([
        supabase.from("video_links").select("id", { count: "exact", head: true }),
        supabase.from("video_links").select("id", { count: "exact", head: true }).not("unshortened_url", "is", null),
        supabase.from("video_links").select("id", { count: "exact", head: true }).not("affiliate_platform", "is", null),
        supabase.from("video_links").select("id", { count: "exact", head: true }).not("resolved_retailer", "is", null),
      ]);
      const total = totalRes.count || 0;
      const processed = processedRes.count || 0;
      setStats({
        total,
        processed,
        unprocessed: total - processed,
        withPlatform: platformRes.count || 0,
        withRetailer: retailerRes.count || 0,
      });
    } catch (e) {
      console.error("Failed to fetch stats", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [running, fetchStats]);

  const startProcessing = () => {
    linkProcessingService.start(fetchStats, batchSize);
  };

  const stopProcessing = () => {
    linkProcessingService.stop();
  };

  const handleReset = async () => {
    setResetting(true);
    let nextId: string | null = null;
    let totalProcessed = 0;
    try {
      while (true) {
        const { data, error } = await supabase.functions.invoke("reset-video-links", {
          body: nextId ? { before_id: nextId } : {},
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totalProcessed += data.processed || 0;
        nextId = data.next_before_id;
        if (data.done) break;
      }
      toast.success("Reset complete", { description: `Reset ${totalProcessed.toLocaleString()} links.` });
      try {
        await supabase.rpc("log_audit" as any, {
          _action: "video_links_reset",
          _target_type: "video_links",
          _target_id: null,
          _details: { total_processed: totalProcessed },
        } as any);
      } catch { /* silent */ }
      linkProcessingService.clearLogs();
      await fetchStats();
    } catch (e: any) {
      toast.error("Reset failed", { description: e.message });
    } finally {
      setResetting(false);
    }
  };

  const pct = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Links", value: stats.total },
          { label: "Processed", value: stats.processed },
          { label: "Unprocessed", value: stats.unprocessed },
          { label: "With Platform", value: stats.withPlatform },
          { label: "With Retailer", value: stats.withRetailer },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{loading ? "..." : s.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="w-full bg-muted rounded-full h-3">
        <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground text-center">{pct}% processed</p>

      {logs.length > 0 && !running && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          Previous run logs loaded. Click <strong>Resume Processing</strong> to continue.
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        {running ? (
          <Button onClick={stopProcessing} variant="destructive" size="lg">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Stop Processing
          </Button>
        ) : (
          <Button onClick={startProcessing} disabled={stats.unprocessed === 0 || resetting} size="lg">
            <Play className="h-4 w-4 mr-2" /> {logs.length > 0 ? "Resume Processing" : "Start Processing"}
          </Button>
        )}
        {resetting && !running && (
          <span className="text-xs text-amber-500 self-center">Reset in progress — wait for completion</span>
        )}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Batch size</Label>
          <Input
            type="number"
            min={50}
            max={2000}
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(50, Math.min(2000, Number(e.target.value) || 200)))}
            disabled={running}
            className="w-28"
          />
        </div>
        <Button variant="outline" onClick={fetchStats} disabled={loading} size="lg">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh Stats
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="lg" disabled={resetting || running}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset All Links
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all links?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear all processing data for {stats.total.toLocaleString()} links. They will need to be re-processed from scratch. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Yes, Reset All</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Live Log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Processing Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-md p-3 h-64 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">Click "Start Processing" to begin...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className={log.includes("❌") ? "text-destructive" : log.includes("✅") ? "text-green-600" : "text-foreground"}>
                  {log}
                </p>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
