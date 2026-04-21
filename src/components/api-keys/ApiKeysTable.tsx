import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { FlaskConical, Power, Trash2 } from "lucide-react";
import type { YouTubeApiKey } from "@/hooks/useApiKeys";
import { formatDistanceToNow } from "date-fns";

interface Props {
  keys: YouTubeApiKey[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (ids: string[]) => void;
  onTest: (ids: string[]) => void;
  testingIds: string[];
}

export function ApiKeysTable({ keys, selectedIds, onSelectChange, onToggleActive, onDelete, onTest, testingIds }: Props) {
  const allSelected = keys.length > 0 && selectedIds.length === keys.length;

  const toggleAll = () => {
    onSelectChange(allSelected ? [] : keys.map((k) => k.id));
  };

  const toggleOne = (id: string) => {
    onSelectChange(
      selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]
    );
  };

  const statusBadge = (key: YouTubeApiKey) => {
    if (!key.is_active) return <Badge variant="secondary">Inactive</Badge>;
    if (key.last_test_status === "invalid") return <Badge variant="destructive">Invalid</Badge>;
    if (key.last_test_status === "quota_exceeded") return <Badge className="bg-amber-500 text-white">Exhausted</Badge>;
    if (key.last_test_status === "restricted") return <Badge className="bg-orange-500 text-white">Restricted</Badge>;
    return <Badge className="bg-green-600 text-white">Active</Badge>;
  };

  const testStatusBadge = (status: string | null) => {
    if (!status) return <span className="text-muted-foreground text-xs">Not tested</span>;
    if (status === "valid") return <Badge variant="outline" className="text-green-600 border-green-600">Valid</Badge>;
    if (status === "quota_exceeded") return <Badge variant="outline" className="text-amber-500 border-amber-500">Quota Exceeded</Badge>;
    if (status === "restricted") return <Badge variant="outline" className="text-orange-500 border-orange-500">Restricted</Badge>;
    return <Badge variant="outline" className="text-destructive border-destructive">Invalid</Badge>;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Label</TableHead>
            <TableHead>API Key</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Quota Used</TableHead>
            <TableHead>Last Test</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                No API keys added yet. Click "Add Key(s)" to get started.
              </TableCell>
            </TableRow>
          )}
          {keys.map((key) => {
            const quotaPct = key.daily_quota_limit > 0
              ? Math.round((key.quota_used_today / key.daily_quota_limit) * 100)
              : 0;
            const isTesting = testingIds.includes(key.id);

            return (
              <TableRow key={key.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(key.id)}
                    onCheckedChange={() => toggleOne(key.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{key.label || "—"}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-2 py-1 rounded">…{key.api_key_last_4}</code>
                </TableCell>
                <TableCell>{statusBadge(key)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Progress value={quotaPct} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {key.quota_used_today.toLocaleString()}/{key.daily_quota_limit.toLocaleString()}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {testStatusBadge(key.last_test_status)}
                    {key.last_tested_at && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(key.last_tested_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {key.last_used_at ? (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Never</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isTesting}
                      onClick={() => onTest([key.id])}
                      title="Test key"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onToggleActive(key.id, !key.is_active)}
                      title={key.is_active ? "Deactivate" : "Activate"}
                    >
                      <Power className={`h-3.5 w-3.5 ${key.is_active ? "text-green-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete([key.id])}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
