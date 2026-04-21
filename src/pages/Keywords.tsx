import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { useKeywords } from "@/hooks/useKeywords";
import { useFetchJobs } from "@/hooks/useFetchJobs";
import { useAuth } from "@/hooks/useAuth";
import { AddKeywordDialog } from "@/components/keywords/AddKeywordDialog";
import { ExcelUploadCard } from "@/components/keywords/ExcelUploadCard";
import { KeywordFilters } from "@/components/keywords/KeywordFilters";
import { FetchSettingsCard, type FetchSettings } from "@/components/keywords/FetchSettingsCard";
import { BulkActionBar } from "@/components/keywords/BulkActionBar";
import { KeywordsTable } from "@/components/keywords/KeywordsTable";
import { FetchQueueCard } from "@/components/keywords/FetchQueueCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";

export default function Keywords() {
  useEffect(() => { document.title = "Keywords | YT Intel"; }, []);
  const { isAdmin } = useAuth();
  const {
    keywords, categories, filters, setFilters, clearFilters,
    isLoading, addKeyword, addKeywordsBulk, deleteKeyword,
    refresh, userProfiles, sourceFiles, keywordStats,
  } = useKeywords();
  const { jobs, killAll, clearFinished, retryJob } = useFetchJobs();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fetchSettings, setFetchSettings] = useState<FetchSettings>({ orderBy: "relevance", publishedAfter: undefined });
  const [fetchLoading, setFetchLoading] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (keywords.every((k) => selectedIds.has(k.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(keywords.map((k) => k.id)));
    }
  };

  const MAX_KEYWORDS_PER_BATCH = 5;

  const queueFetch = async (keywordIds: string[]) => {
    const selected = keywords.filter((k) => keywordIds.includes(k.id));
    if (selected.length === 0) return;
    setFetchLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast.error("Session expired. Please sign in again.");
      setFetchLoading(false);
      return;
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/queue-fetch-jobs`;

    // Split into batches of MAX_KEYWORDS_PER_BATCH
    const batches: typeof selected[] = [];
    for (let i = 0; i < selected.length; i += MAX_KEYWORDS_PER_BATCH) {
      batches.push(selected.slice(i, i + MAX_KEYWORDS_PER_BATCH));
    }

    let totalQueued = 0;
    let totalSkipped = 0;

    try {
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const jobPayload = batch.map((k) => ({
          keyword: k.keyword,
          keyword_id: k.id,
          category: k.category,
          businessAim: k.business_aim,
          orderBy: fetchSettings.orderBy,
          publishedAfter: fetchSettings.publishedAfter ? format(fetchSettings.publishedAfter, "yyyy-MM-dd") : undefined,
        }));

        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ jobs: jobPayload }),
        });
        const result = await response.json();

        if (response.status === 429) {
          toast.error(result.error || "Rate limit reached. Please wait.");
          break;
        }
        if (!response.ok) throw new Error(result.error || "Failed");

        totalQueued += result.queued || 0;
        totalSkipped += result.skipped || 0;
      }

      const parts: string[] = [];
      if (totalQueued > 0) parts.push(`Queued ${totalQueued} keyword(s)`);
      if (totalSkipped > 0) parts.push(`${totalSkipped} skipped (recently fetched)`);
      if (batches.length > 1) parts.push(`split into ${batches.length} batches`);
      toast.success(parts.join(". ") || "Done");
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Failed to queue fetch jobs");
    }
    setFetchLoading(false);
  };

  const exportExcel = () => {
    const data = keywords.map((k) => ({
      Keyword: k.keyword, Category: k.category, "Business Aim": k.business_aim,
      Status: k.status, Priority: k.priority || "", Source: k.source,
      "Run Date": k.run_date,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Keywords");
    XLSX.writeFile(wb, `keywords_export_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Keywords</h1>
          <p className="text-muted-foreground mt-1">Manage search keywords and trigger video discovery.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
          {isAdmin && <AddKeywordDialog onAdd={addKeyword} />}
        </div>
      </div>

      {/* Fetch Queue */}
      <FetchQueueCard jobs={jobs} onKillAll={killAll} onClearFinished={clearFinished} onRetry={retryJob} />

      {/* Excel Upload */}
      {isAdmin && <ExcelUploadCard onUpload={addKeywordsBulk} />}

      {/* Filters + Fetch Settings side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <KeywordFilters filters={filters} onChange={setFilters} onClear={clearFilters} categories={categories} sourceFiles={sourceFiles} userProfiles={userProfiles} />
        </div>
        <FetchSettingsCard settings={fetchSettings} onChange={setFetchSettings} />
      </div>

      {/* Bulk Actions */}
      <BulkActionBar selectedCount={selectedIds.size} settings={fetchSettings} onFetch={() => queueFetch([...selectedIds])} loading={fetchLoading} />

      {/* Table */}
      <KeywordsTable
        keywords={keywords}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onSelectAll={selectAll}
        onFetchSingle={(k) => queueFetch([k.id])}
        onDelete={deleteKeyword}
        jobs={jobs}
        isAdmin={isAdmin}
        keywordStats={keywordStats}
      />
    </div>
  );
}
