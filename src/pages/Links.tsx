import { useState } from "react";
import { useAffiliatePatterns } from "@/hooks/useAffiliatePatterns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Link as LinkIcon, Plus, Trash2, Check, RefreshCw, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const classColors: Record<string, string> = {
  OWN: "bg-green-500/15 text-green-700 border-green-500/30",
  COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
  NEUTRAL: "bg-muted text-muted-foreground",
};

export default function Links() {
  const {
    confirmedPatterns, discoveredPatterns, isLoading,
    addPattern, confirmPattern, deletePattern, processLinks,
  } = useAffiliatePatterns();

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
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. CashKaro"
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
                    <Button onClick={handleAdd} className="w-full">Add Pattern</Button>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmPattern(p.id, "OWN")}
                            className="text-green-700"
                          >
                            <Check className="h-3 w-3 mr-1" /> Ours
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmPattern(p.id, "COMPETITOR")}
                            className="text-red-700"
                          >
                            <Check className="h-3 w-3 mr-1" /> Competitor
                          </Button>
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
