import { supabase } from "@/integrations/supabase/client";

export type LogEntry = { time: string; message: string };

type Listener = () => void;

const STORAGE_KEY = "linkProcessingState";
const RETRY_BACKOFFS = [2000, 5000, 10000]; // 2s, 5s, 10s

class LinkProcessingService {
  private running = false;
  private autoRun = false;
  private batchNum = 0;
  private startedAt: string | null = null;
  private logs: LogEntry[] = [];
  private listeners = new Set<Listener>();
  private snapshot: { running: boolean; logs: LogEntry[]; startedAt: string | null } = {
    running: false,
    logs: [],
    startedAt: null,
  };

  constructor() {
    this.loadState();
    this.snapshot = { running: this.running, logs: this.logs, startedAt: this.startedAt };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.snapshot = { running: this.running, logs: this.logs, startedAt: this.startedAt };
    this.listeners.forEach((fn) => fn());
    this.saveState();
  }

  private addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    this.logs = [...this.logs, { time, message }];
    if (this.logs.length > 200) this.logs = this.logs.slice(-200);
    this.notify();
  }

  getState() {
    return this.snapshot;
  }

  clearLogs() {
    this.logs = [];
    this.startedAt = null;
    this.batchNum = 0;
    this.notify();
  }

  private saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          running: this.running,
          batchNum: this.batchNum,
          startedAt: this.startedAt,
          logs: this.logs.slice(-50),
        }),
      );
    } catch {
      /* ignore quota / privacy errors */
    }
  }

  private loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const s = JSON.parse(saved);
      this.logs = Array.isArray(s.logs) ? s.logs : [];
      this.startedAt = s.startedAt ?? null;
      this.batchNum = typeof s.batchNum === "number" ? s.batchNum : 0;
      // Do NOT auto-resume on page load — surface a manual resume prompt instead.
      this.running = false;
    } catch {
      /* ignore parse errors */
    }
  }

  private async callEdgeFunction(batchSize: number) {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const resp = await fetch(
      `https://${projectId}.supabase.co/functions/v1/process-video-links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ batch_size: batchSize }),
      }
    );
    return await resp.json();
  }

  async start(onStatsRefresh?: () => void, batchSize: number = 200) {
    if (this.running) return;
    this.autoRun = true;
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.addLog(`🚀 Auto-processing started (batch size ${batchSize})...`);

    while (this.autoRun) {
      this.batchNum++;
      const batchNum = this.batchNum;

      let attempt = 0;
      let result: any = null;
      let fatal: Error | null = null;

      while (attempt <= RETRY_BACKOFFS.length) {
        try {
          this.addLog(`⏳ Batch #${batchNum}: processing${attempt > 0 ? ` (retry ${attempt})` : ""}...`);
          result = await this.callEdgeFunction(batchSize);
          if (result?.success) break;

          if (attempt < RETRY_BACKOFFS.length) {
            this.addLog(
              `⚠️ Batch #${batchNum} failed (${result?.error || "unknown"}), retrying in ${RETRY_BACKOFFS[attempt] / 1000}s...`,
            );
            await new Promise((r) => setTimeout(r, RETRY_BACKOFFS[attempt]));
            attempt++;
            continue;
          }
          fatal = new Error(result?.error || "Unknown error after retries");
          break;
        } catch (e: any) {
          if (attempt < RETRY_BACKOFFS.length) {
            this.addLog(
              `⚠️ Batch #${batchNum} threw (${e.message}), retrying in ${RETRY_BACKOFFS[attempt] / 1000}s...`,
            );
            await new Promise((r) => setTimeout(r, RETRY_BACKOFFS[attempt]));
            attempt++;
          } else {
            fatal = e;
            break;
          }
        }
      }

      if (fatal || !result?.success) {
        this.addLog(`❌ Batch #${batchNum} aborted: ${fatal?.message || result?.error || "unknown"}`);
        this.autoRun = false;
        break;
      }

      const details: string[] = [];
      if (result.cached > 0) details.push(`${result.cached} cached`);
      if (result.resolved > 0) details.push(`${result.resolved} resolved`);
      if (result.failed > 0) details.push(`${result.failed} failed`);
      if (result.db_errors > 0) details.push(`${result.db_errors} db errors`);
      const breakdown = details.length > 0 ? ` (${details.join(", ")})` : "";
      this.addLog(
        `✅ Batch #${batchNum}: ${result.processed} processed${breakdown}, ${result.remaining?.toLocaleString()} remaining`,
      );
      onStatsRefresh?.();

      if (result.remaining === 0) {
        this.addLog("🎉 All links processed!");
        this.autoRun = false;
        break;
      }
    }

    this.running = false;
    this.addLog("⏹ Processing stopped.");
    this.notify();
  }

  stop() {
    this.autoRun = false;
    this.addLog("🛑 Stopping after current batch...");
  }
}

export const linkProcessingService = new LinkProcessingService();
