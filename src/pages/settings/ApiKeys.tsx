import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlaskConical, Trash2, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useApiKeys } from "@/hooks/useApiKeys";
import { AddKeysDialog } from "@/components/api-keys/AddKeysDialog";
import { ApiKeyStatsCards } from "@/components/api-keys/ApiKeyStatsCards";
import { ApiKeysTable } from "@/components/api-keys/ApiKeysTable";
import { RotationSummaryBanner } from "@/components/api-keys/RotationSummaryBanner";
import * as XLSX from "xlsx";

export default function ApiKeys() {
  const { keys, isLoading, stats, addKeys, toggleActive, deleteKeys, testKeys, resetQuota } = useApiKeys();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [testingIds, setTestingIds] = useState<string[]>([]);

  const handleTest = async (ids: string[]) => {
    setTestingIds((prev) => [...prev, ...ids]);
    try {
      const results = await testKeys(ids);
      const valid = results.filter((r) => r.status === "valid").length;
      const invalid = results.filter((r) => r.status === "invalid").length;
      const exhausted = results.filter((r) => r.status === "quota_exceeded").length;
      toast.success(`Tested ${results.length}: ${valid} valid, ${invalid} invalid, ${exhausted} exhausted`);
    } catch (e: any) {
      toast.error(e.message || "Test failed");
    } finally {
      setTestingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const handleExport = () => {
    const data = keys.map((k) => ({
      Label: k.label || "",
      "API Key": k.api_key,
      Active: k.is_active ? "Yes" : "No",
      "Quota Used": k.quota_used_today,
      "Quota Limit": k.daily_quota_limit,
      "Last Test Status": k.last_test_status || "N/A",
      "Last Tested": k.last_tested_at || "N/A",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "API Keys");
    XLSX.writeFile(wb, "youtube_api_keys.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage YouTube Data API keys and monitor quota usage.</p>
      </div>

      <ApiKeyStatsCards {...stats} />

      <RotationSummaryBanner
        activeCount={stats.activeCount}
        total={stats.total}
        remainingCallsToday={stats.remainingCallsToday}
        nextResetAt={stats.nextResetAt}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AddKeysDialog onAdd={(k) => addKeys.mutate(k)} isPending={addKeys.isPending} />
        <Button
          variant="outline"
          onClick={() => handleTest(keys.map((k) => k.id))}
          disabled={keys.length === 0 || testingIds.length > 0}
        >
          <FlaskConical className="h-4 w-4 mr-2" />
          Test All Keys
        </Button>
        <Button
          variant="outline"
          onClick={() => resetQuota.mutate()}
          disabled={keys.length === 0 || resetQuota.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset Quota
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={keys.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export
        </Button>

        {selectedIds.length > 0 && (
          <>
            <div className="h-6 w-px bg-border mx-1" />
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTest(selectedIds)}
              disabled={testingIds.length > 0}
            >
              <FlaskConical className="h-3.5 w-3.5 mr-1" /> Test Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => {
                deleteKeys.mutate(selectedIds);
                setSelectedIds([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <ApiKeysTable
          keys={keys}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onToggleActive={(id, active) => toggleActive.mutate({ id, is_active: active })}
          onDelete={(ids) => {
            deleteKeys.mutate(ids);
            setSelectedIds((prev) => prev.filter((i) => !ids.includes(i)));
          }}
          onTest={handleTest}
          testingIds={testingIds}
        />
      )}
    </div>
  );
}
