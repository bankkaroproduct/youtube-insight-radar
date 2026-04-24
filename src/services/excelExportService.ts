import { supabase } from "@/integrations/supabase/client";

export async function exportFullReport(onProgress?: (msg: string) => void) {
  onProgress?.("Starting export job...");
  const { data: startData, error: startErr } = await supabase.functions.invoke("export-full-report", { body: {} });
  if (startErr) throw startErr;
  if (!startData?.job_id) throw new Error("Failed to start export");
  const jobId = startData.job_id;

  // Poll until terminal status. Tolerate up to 5 consecutive transient
  // status-call failures with simple linear backoff before giving up — a single
  // network blip should not surface as "last call failed" while the backend
  // job is still healthy. Authoritative server-side `failed` still throws.
  const MAX_POLLS = 2400; // ~2 hours at base interval
  const MAX_CONSECUTIVE_ERRORS = 5;
  const BACKOFF_MS = [3000, 4000, 5000, 6000, 7000];
  let lastMsg = "";
  let consecutiveStatusErrors = 0;

  for (let i = 0; i < MAX_POLLS; i++) {
    const waitMs = BACKOFF_MS[Math.min(consecutiveStatusErrors, BACKOFF_MS.length - 1)];
    await new Promise((r) => setTimeout(r, waitMs));

    let statusData: any = null;
    let statusErr: any = null;
    try {
      const res = await supabase.functions.invoke("export-full-report", {
        body: { action: "status", job_id: jobId },
      });
      statusData = res.data;
      statusErr = res.error;
    } catch (e) {
      statusErr = e;
    }

    if (statusErr || !statusData) {
      consecutiveStatusErrors++;
      if (consecutiveStatusErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw statusErr || new Error("Export status check failed repeatedly");
      }
      continue;
    }

    consecutiveStatusErrors = 0;

    if (statusData.progress_message && statusData.progress_message !== lastMsg) {
      lastMsg = statusData.progress_message;
      onProgress?.(lastMsg);
    }

    if (statusData.status === "failed") {
      throw new Error(statusData.error || "Export failed");
    }
    if (statusData.status === "completed") {
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
