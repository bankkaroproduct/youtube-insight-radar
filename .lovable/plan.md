

# Auto-Processing with Live Log in Processing Tab

## What Changes

### Frontend (`src/pages/Links.tsx` — Processing tab)

1. **Auto-loop**: When the user clicks "Start Processing", it automatically calls the edge function in batches of 100, one after another, until all links are done or an error occurs.
   - Uses a `useRef` flag (`autoRunRef`) to control stop/start
   - After each batch completes successfully, immediately triggers the next batch
   - On failure, stops and shows the error — user can click "Resume" to retry

2. **Live processing log**: Add a scrollable log area below the stats that shows each batch result as a line item with timestamp, e.g.:
   - `[12:34:05] Batch #1: 100 processed, 31,915 remaining`
   - `[12:34:18] Batch #2: 100 processed, 31,815 remaining`
   - `[12:35:02] ❌ Error: Function timeout — click Resume to retry`

3. **Buttons**:
   - "Start Processing" → begins auto-loop (changes to "Stop" while running)
   - "Stop" → sets flag to stop after current batch
   - Stats auto-refresh after each batch

### Edge Function — No changes needed
The existing `batch_size` + `isManualBatch` (no self-re-trigger) logic already supports this. The frontend will drive the loop.

## Technical Details

| File | Change |
|------|--------|
| `src/pages/Links.tsx` | Replace manual "Process Next 100" button with auto-loop start/stop + scrollable log |

**Auto-loop logic:**
```typescript
const autoRunRef = useRef(false);
const [logs, setLogs] = useState<string[]>([]);
let batchNum = 0;

async function runLoop() {
  autoRunRef.current = true;
  while (autoRunRef.current && stats.unprocessed > 0) {
    batchNum++;
    const result = await callEdgeFunction(100);
    if (!result.success) {
      addLog(`❌ Batch #${batchNum} failed: ${result.error}`);
      autoRunRef.current = false;
      break;
    }
    addLog(`Batch #${batchNum}: ${result.processed} processed, ${result.remaining} remaining`);
    await refreshStats();
    if (result.remaining === 0) break;
  }
}
```

