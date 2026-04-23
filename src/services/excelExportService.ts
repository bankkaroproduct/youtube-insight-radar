import { supabase } from "@/integrations/supabase/client";

export async function exportFullReport(onProgress?: (msg: string) => void) {
  onProgress?.("Starting export job...");
  const { data: startData, error: startErr } = await supabase.functions.invoke("export-full-report", { body: {} });
  if (startErr) throw startErr;
  if (!startData?.job_id) throw new Error("Failed to start export");
  const jobId = startData.job_id;

  // Poll every 3 seconds. No hard timeout — chunked workers may take a while
  // for large datasets. Stop only on terminal status (completed/failed) or a
  // very generous safety ceiling (~2 hours).
  const MAX_POLLS = 2400; // 2400 * 3s = 2 hours
  let lastMsg = "";
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data: statusData, error: statusErr } = await supabase.functions.invoke("export-full-report", {
      body: { action: "status", job_id: jobId },
    });
    if (statusErr) throw statusErr;
    if (statusData?.progress_message && statusData.progress_message !== lastMsg) {
      lastMsg = statusData.progress_message;
      onProgress?.(lastMsg);
    }

    if (statusData?.status === "failed") {
      throw new Error(statusData.error || "Export failed");
    }
    if (statusData?.status === "completed") {
      if (!statusData.signed_url) throw new Error("No download URL");
      onProgress?.("Downloading...");
      const a = document.createElement("a");
      a.href = statusData.signed_url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  }
  throw new Error("Export timed out");
}
