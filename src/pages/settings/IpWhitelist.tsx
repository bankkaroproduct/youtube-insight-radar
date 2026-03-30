import { useState } from "react";
import { useIpWhitelist } from "@/hooks/useIpWhitelist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Trash2, Globe, Wifi } from "lucide-react";
import { format } from "date-fns";

export default function IpWhitelist() {
  const { entries, isLoading, currentIp, addIp, removeIp, toggleActive } = useIpWhitelist();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newIp.trim()) return;
    setAdding(true);
    const ok = await addIp(newIp, newDesc);
    if (ok) {
      setNewIp("");
      setNewDesc("");
      setDialogOpen(false);
    }
    setAdding(false);
  };

  const handleAddCurrentIp = async () => {
    if (!currentIp || currentIp === "unknown") return;
    setAdding(true);
    await addIp(currentIp, "My IP (auto-detected)");
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">IP Whitelist</h1>
        <p className="text-muted-foreground mt-1">
          Restrict app access to specific IP addresses. When the whitelist is empty, all IPs are allowed.
        </p>
      </div>

      {/* Current IP Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Your current IP address</p>
                <p className="font-mono font-semibold text-lg">
                  {currentIp ?? "Detecting..."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCurrentIp}
                disabled={!currentIp || currentIp === "unknown" || adding}
              >
                <Wifi className="h-4 w-4 mr-1" /> Add My IP
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Add IP
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add IP Address</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <Label>IP Address</Label>
                      <Input
                        placeholder="e.g. 203.0.113.5"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Description (optional)</Label>
                      <Input
                        placeholder="e.g. Office network"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAdd} disabled={!newIp.trim() || adding} className="w-full">
                      {adding ? "Adding..." : "Add to Whitelist"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Whitelist Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Shield className="h-5 w-5" /> Whitelisted IPs
            <Badge variant="secondary" className="ml-2">{entries.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
              <Shield className="h-8 w-8 mb-2 opacity-50" />
              <p>No IPs whitelisted — all IPs are currently allowed.</p>
              <p className="text-xs">Add an IP to start restricting access.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono font-medium">{entry.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={entry.is_active}
                          onCheckedChange={(v) => toggleActive(entry.id, v)}
                        />
                        <Badge variant={entry.is_active ? "default" : "secondary"}>
                          {entry.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(entry.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeIp(entry.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
