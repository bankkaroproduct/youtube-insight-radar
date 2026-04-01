import { useState, useCallback, useEffect, useRef } from "react";
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
import { Link as LinkIcon, Plus, Trash2, Check, RefreshCw, Zap, Store, Globe, Play, RotateCcw, Loader2 } from "lucide-react";
import { BulkUploadDialog } from "@/components/links/BulkUploadDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

const classColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

const typeColors: Record<string, string> = {
  affiliate_platform: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  retailer: "bg-purple-500/15 text-purple-700 border-purple-500/30",
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

function PatternTable({
  patterns, onDelete, typeLabel,
}: {
  patterns: any[]; onDelete: (id: string) => void; typeLabel?: string;
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
            <TableCell>{p.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className={classColors[p.classification] || classColors.NEUTRAL}>
                {p.classification}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={typeColors[p.type?.toLowerCase()] || typeColors.affiliate_platform}>
                {p.type?.toLowerCase() === "retailer" ? "Retailer" : "Platform"}
              </Badge>
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
  const {
    platformPatterns, retailerPatterns, discoveredPatterns, uniqueNames, isLoading,
    addPattern, confirmPattern, deletePattern, processLinks,
  } = useAffiliatePatterns();

  const addName = async (name: string) => {
    // Names are derived from patterns; adding a pattern with this name will include it
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
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Domain / Pattern</Label>
                  <Input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder={newType === "retailer" ? "e.g. amazon.in" : "e.g. impact.com"} />
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
          <Button variant="outline" size="sm" onClick={processLinks}>
            <Zap className="h-4 w-4 mr-2" /> Process Links
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
          <TabsTrigger value="discovered">
            <RefreshCw className="h-4 w-4 mr-1" /> Discovered ({discoveredPatterns.length})
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
                <PatternTable patterns={platformPatterns} onDelete={deletePattern} typeLabel="affiliate platforms" />
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
                <PatternTable patterns={retailerPatterns} onDelete={deletePattern} typeLabel="retailers" />
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
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const autoRunRef = useRef(false);
  const batchNumRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  }, []);

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
      const result = {
        total,
        processed,
        unprocessed: total - processed,
        withPlatform: platformRes.count || 0,
        withRetailer: retailerRes.count || 0,
      };
      setStats(result);
      return result;
    } catch (e) {
      console.error("Failed to fetch stats", e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const callEdgeFunction = async (batchSize: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const resp = await fetch(
      `https://${projectId}.supabase.co/functions/v1/process-video-links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ batch_size: batchSize }),
      }
    );
    return await resp.json();
  };

  const startProcessing = async () => {
    autoRunRef.current = true;
    setRunning(true);
    batchNumRef.current = 0;
    addLog("🚀 Auto-processing started...");

    while (autoRunRef.current) {
      batchNumRef.current++;
      const batchNum = batchNumRef.current;
      try {
        addLog(`⏳ Batch #${batchNum}: processing...`);
        const result = await callEdgeFunction(500);
        if (!result.success) {
          addLog(`❌ Batch #${batchNum} failed: ${result.error || "Unknown error"}`);
          autoRunRef.current = false;
          break;
        }
        addLog(`✅ Batch #${batchNum}: ${result.processed} processed, ${result.remaining?.toLocaleString()} remaining`);
        await fetchStats();
        if (result.remaining === 0) {
          addLog("🎉 All links processed!");
          autoRunRef.current = false;
          break;
        }
      } catch (e: any) {
        addLog(`❌ Batch #${batchNum} error: ${e.message}`);
        autoRunRef.current = false;
        break;
      }
    }

    setRunning(false);
    addLog("⏹ Processing stopped.");
  };

  const stopProcessing = () => {
    autoRunRef.current = false;
    addLog("🛑 Stopping after current batch...");
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const { error } = await supabase.from("video_links").update({
        unshortened_url: null,
        domain: null,
        original_domain: null,
        classification: "NEUTRAL",
        matched_pattern_id: null,
        affiliate_platform_id: null,
        retailer_pattern_id: null,
        is_shortened: null,
        link_type: null,
        affiliate_platform: null,
        affiliate_domain: null,
        resolved_retailer: null,
        resolved_retailer_domain: null,
      }).not("id", "is", null);

      if (error) throw error;
      toast({ title: "Reset complete", description: "All links have been reset to unprocessed state." });
      setLogs([]);
      await fetchStats();
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
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

      <div className="flex gap-3">
        {running ? (
          <Button onClick={stopProcessing} variant="destructive" size="lg">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Stop Processing
          </Button>
        ) : (
          <Button onClick={startProcessing} disabled={stats.unprocessed === 0} size="lg">
            <Play className="h-4 w-4 mr-2" /> {logs.length > 0 ? "Resume Processing" : "Start Processing"}
          </Button>
        )}
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
