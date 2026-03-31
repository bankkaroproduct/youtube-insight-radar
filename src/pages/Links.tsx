import { useState } from "react";
import { useAffiliatePatterns, PatternType } from "@/hooks/useAffiliatePatterns";

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
import { Link as LinkIcon, Plus, Trash2, Check, RefreshCw, Zap, Store, Globe } from "lucide-react";
import { BulkUploadDialog } from "@/components/links/BulkUploadDialog";
import { Skeleton } from "@/components/ui/skeleton";

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
    platformPatterns, retailerPatterns, discoveredPatterns, isLoading,
    addPattern, confirmPattern, deletePattern, processLinks,
  } = useAffiliatePatterns();
  const { names, addName } = useCompetitorNames();

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
                  <NameDropdown names={names} value={newName} onChange={setNewName} onAddNew={addName} />
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
                              names={names} onAddNew={addName} classification="OWN" label="Ours" className="text-green-700"
                              onConfirm={(name) => confirmPattern(p.id, "OWN", name, selectedType)}
                            />
                            <DiscoveredNamePicker
                              names={names} onAddNew={addName} classification="COMPETITOR" label="Competitor" className="text-red-700"
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
      </Tabs>
    </div>
  );
}
