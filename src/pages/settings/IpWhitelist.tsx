import { useState, useMemo } from "react";
import { useIpWhitelist, isValidIpOrCidr } from "@/hooks/useIpWhitelist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Trash2, Globe, Wifi, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}
function matchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

export default function IpWhitelist() {
  const { entries, isLoading, currentIp, addIp, removeIp, toggleActive } = useIpWhitelist();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingIp, setPendingIp] = useState<{ ip: string; desc: string } | null>(null);

  const activeEntries = useMemo(() => entries.filter((e) => e.is_active), [entries]);
  const whitelistIsEmpty = activeEntries.length === 0;

  const lockoutRisk = useMemo(() => {
    if (!pendingIp || !currentIp || currentIp === "unknown") return false;
    if (!whitelistIsEmpty) return false;
    try {
      return !matchesCidr(currentIp, pendingIp.ip.trim());
    } catch {
      return true;
    }
  }, [pendingIp, currentIp, whitelistIsEmpty]);

  const requestAdd = (ip: string, desc: string) => {
    if (!ip.trim()) return;
    if (!isValidIpOrCidr(ip)) {
      // surface error via the hook's toast on actual add; also short-circuit here
      return;
    }
    setPendingIp({ ip, desc });
    setConfirmOpen(true);
  };

  const confirmAdd = async () => {
    if (!pendingIp) return;
    setAdding(true);
    const ok = await addIp(pendingIp.ip, pendingIp.desc);
    setAdding(false);
    setConfirmOpen(false);
    setPendingIp(null);
    if (ok) {
      setNewIp("");
      setNewDesc("");
      setDialogOpen(false);
    }
  };

  const handleAdd = () => requestAdd(newIp, newDesc);
  const handleAddCurrentIp = () => {
    if (!currentIp || currentIp === "unknown") return;
    requestAdd(currentIp, "My IP (auto-detected)");
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
                      <Label>IP Address or CIDR</Label>
                      <Input
                        placeholder="e.g. 203.0.113.5 or 203.0.113.0/24"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                      />
                      {newIp.trim() && !isValidIpOrCidr(newIp) && (
                        <p className="text-xs text-destructive mt-1">
                          Invalid IP address or CIDR range
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Description (optional)</Label>
                      <Input
                        placeholder="e.g. Office network"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleAdd}
                      disabled={!newIp.trim() || !isValidIpOrCidr(newIp) || adding}
                      className="w-full"
                    >
                      Continue
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm IP whitelist addition</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Adding an IP will immediately restrict access to only whitelisted IPs.
                  Anyone not matching will be blocked.
                </p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">Adding:</span>{" "}
                    <span className="font-mono font-semibold text-foreground">{pendingIp?.ip}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Your current IP:</span>{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {currentIp ?? "unknown"}
                    </span>
                  </div>
                </div>
                <p>Is the IP you're adding reachable from you?</p>
                {lockoutRisk && (
                  <div className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <strong>You may lock yourself out.</strong> Your current IP{" "}
                      <span className="font-mono">{currentIp}</span> does not match the IP you're
                      adding, and the whitelist is currently empty. Adding this will block your
                      access immediately.
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmAdd();
              }}
              disabled={adding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {adding ? "Adding..." : "Yes, add and restrict access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
