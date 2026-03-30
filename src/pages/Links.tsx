import { useState } from "react";
import { useAffiliatePatterns } from "@/hooks/useAffiliatePatterns";
import { useCompetitorNames } from "@/hooks/useCompetitorNames";
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
import { Link as LinkIcon, Plus, Trash2, Check, RefreshCw, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const classColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

function NameDropdown({
  names,
  value,
  onChange,
  onAddNew,
}: {
  names: string[];
  value: string;
  onChange: (v: string) => void;
  onAddNew: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  if (adding) {
    return (
      <div className="flex gap-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New name..."
          className="h-8 text-sm"
          autoFocus
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              await onAddNew(newName.trim());
              onChange(newName.trim());
              setNewName("");
              setAdding(false);
            }
            if (e.key === "Escape") {
              setAdding(false);
              setNewName("");
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={async () => {
            if (newName.trim()) {
              await onAddNew(newName.trim());
              onChange(newName.trim());
              setNewName("");
              setAdding(false);
            }
          }}
        >
          Add
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === "__add_new__") {
        setAdding(true);
      } else {
        onChange(v);
      }
    }}>
      <SelectTrigger><SelectValue placeholder="Select name..." /></SelectTrigger>
      <SelectContent>
        {names.map((n) => (
          <SelectItem key={n} value={n}>{n}</SelectItem>
        ))}
        <SelectItem value="__add_new__" className="text-primary font-medium">
          + Add new...
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function DiscoveredNamePicker({
  names,
  onAddNew,
  onConfirm,
  classification,
  label,
  className,
}: {
  names: string[];
  onAddNew: (name: string) => Promise<void>;
  onConfirm: (name: string) => void;
  classification: string;
  label: string;
  className?: string;
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
        <NameDropdown
          names={names}
          value={selectedName}
          onChange={setSelectedName}
          onAddNew={onAddNew}
        />
        <Button
          size="sm"
          className="w-full"
          disabled={!selectedName}
          onClick={() => {
            onConfirm(selectedName);
            setSelectedName("");
          }}
        >
          Confirm as {classification}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default function Links() {
  const {
    confirmedPatterns, discoveredPatterns, isLoading,
    addPattern, confirmPattern, deletePattern, processLinks,
  } = useAffiliatePatterns();
  const { names, addName } = useCompetitorNames();

  const [open, setOpen] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState("COMPETITOR");

  const handleAdd = async () => {
    if (!newPattern || !newName) return;
    await addPattern(newPattern, newName, newClass);
    setNewPattern("");
    setNewName("");
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Affiliates</h1>
          <p className="text-muted-foreground mt-1">
            Manage affiliate patterns for link classification.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={processLinks}>
            <Zap className="h-4 w-4 mr-2" /> Process Links
          </Button>
        </div>
      </div>

      <Tabs defaultValue="patterns">
        <TabsList>
          <TabsTrigger value="patterns">
            Affiliate Patterns ({confirmedPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="discovered">
            Discovered ({discoveredPatterns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="patterns">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display flex items-center gap-2">
                <LinkIcon className="h-5 w-5" /> Known Patterns
              </CardTitle>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Add Pattern
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Affiliate Pattern</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <Label>Domain / Pattern</Label>
                      <Input
                        value={newPattern}
                        onChange={(e) => setNewPattern(e.target.value)}
                        placeholder="e.g. cashkaro.com"
                      />
                    </div>
                    <div>
                      <Label>Display Name</Label>
                      <NameDropdown
                        names={names}
                        value={newName}
                        onChange={setNewName}
                        onAddNew={addName}
                      />
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
                    <Button onClick={handleAdd} className="w-full" disabled={!newPattern || !newName}>
                      Add Pattern
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : confirmedPatterns.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No patterns yet. Add patterns to classify description links.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedPatterns.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.pattern}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={classColors[p.classification] || classColors.NEUTRAL}>
                            {p.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.is_auto_discovered ? "Auto" : "Manual"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deletePattern(p.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveredPatterns.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.pattern}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="flex gap-1">
                          <DiscoveredNamePicker
                            names={names}
                            onAddNew={addName}
                            classification="OWN"
                            label="Ours"
                            className="text-green-700"
                            onConfirm={(name) => confirmPattern(p.id, "OWN", name)}
                          />
                          <DiscoveredNamePicker
                            names={names}
                            onAddNew={addName}
                            classification="COMPETITOR"
                            label="Competitor"
                            className="text-red-700"
                            onConfirm={(name) => confirmPattern(p.id, "COMPETITOR", name)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmPattern(p.id, "NEUTRAL")}
                          >
                            <Check className="h-3 w-3 mr-1" /> Neutral
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deletePattern(p.id)}
                            className="h-8 w-8 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
