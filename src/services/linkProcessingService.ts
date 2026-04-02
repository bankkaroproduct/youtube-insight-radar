import { supabase } from "@/integrations/supabase/client";

export type LogEntry = { time: string; message: string };

type Listener = () => void;

class LinkProcessingService {
  private running = false;
  private autoRun = false;
  private batchNum = 0;
  private logs: LogEntry[] = [];
  private listeners = new Set<Listener>();
  private snapshot: { running: boolean; logs: LogEntry[] } = { running: false, logs: [] };

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.snapshot = { running: this.running, logs: this.logs };
    this.listeners.forEach((fn) => fn());
  }

  private addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    this.logs = [...this.logs, { time, message }];
    if (this.logs.length > 200) this.logs = this.logs.slice(-200);
    this.notify();
  }

  getState() {
    return { running: this.running, logs: this.logs };
  }

  clearLogs() {
    this.logs = [];
    this.notify();
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

  async start(onStatsRefresh?: () => void) {
    if (this.running) return;
    this.autoRun = true;
    this.running = true;
    this.batchNum = 0;
    this.addLog("🚀 Auto-processing started...");

    while (this.autoRun) {
      this.batchNum++;
      const batchNum = this.batchNum;
      try {
        this.addLog(`⏳ Batch #${batchNum}: processing...`);
        const result = await this.callEdgeFunction(1000);
        if (!result.success) {
          this.addLog(`❌ Batch #${batchNum} failed: ${result.error || "Unknown error"}`);
          this.autoRun = false;
          break;
        }
        this.addLog(`✅ Batch #${batchNum}: ${result.processed} processed, ${result.remaining?.toLocaleString()} remaining`);
        onStatsRefresh?.();
        if (result.remaining === 0) {
          this.addLog("🎉 All links processed!");
          this.autoRun = false;
          break;
        }
      } catch (e: any) {
        this.addLog(`❌ Batch #${batchNum} error: ${e.message}`);
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
