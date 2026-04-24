

## Fix `[finalize] Worker is not defined` — switch to sync ZipDeflate

### Root cause

Line 2 imports `AsyncZipDeflate` from `fflate@0.8.2`, and line 956 uses it for every worksheet entry. `AsyncZipDeflate` internally instantiates a Web Worker to run DEFLATE off-thread. **Supabase Edge Runtime (Deno) does not support the `Worker` global**, so the very first `new AsyncZipDeflate(...)` call throws `ReferenceError: Worker is not defined`. Our promise wrapper catches it and the export surfaces:

> Export failed: [finalize] Worker is not defined

That is why `Stitching workbook…` never finishes — finalize crashes on the first sheet entry, before any zip output is ever emitted.

### Fix (single-file, minimal)

In `supabase/functions/export-full-report/index.ts`:

1. **Swap the import** on line 2:
   - Replace `AsyncZipDeflate` with `ZipDeflate` (the synchronous variant — no Worker, same compressed output, fully supported in Deno).

2. **Swap the worksheet entry constructor** on line 956:
   - `new AsyncZipDeflate(name, { level: 1 })` → `new ZipDeflate(name, { level: 1 })`
   - Everything else (`zip.add`, `entry.push(head, false)`, `entry.push(b, false)`, `entry.push(tail, true)`) is identical for `ZipDeflate`.

3. **Keep everything else as-is**:
   - Disk-spill via `tmpFile` ✅
   - Serialized `writeChain` ✅
   - Promise-based `donePromise` / `resolveDone` ✅
   - `setTimeout(0)` yields between fragments ✅
   - Streamed upload from `Deno.open(tmpPath).readable` with buffered fallback ✅
   - All `[finalize]` logging ✅

### Why this is safe

- `ZipDeflate` produces an identical-format zip stream to `AsyncZipDeflate`; the resulting `.xlsx` is byte-compatible.
- Compression still happens (level 1, fast). Sheet 2's ~118 MB raw XML still compresses to ~10–20 MB.
- Memory profile stays the same because we already drain each fragment via `setTimeout(0)` and stream to disk — sync DEFLATE just runs the deflate step inline between yields instead of in a worker.
- No schema, no client, no dataset, no styling, no row-rule changes.

### Cleanup

Mark the latest jobs that died with this `Worker is not defined` error as failed so a fresh export starts clean. Filter narrowly:

```sql
UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded: AsyncZipDeflate Worker unsupported in edge runtime',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'failed')
  AND stage = 'finalize'
  AND error IS DISTINCT FROM 'superseded: AsyncZipDeflate Worker unsupported in edge runtime'
  AND created_at > now() - interval '6 hours';
```

### Files changed

- `supabase/functions/export-full-report/index.ts` — 2 lines (import + constructor)
- one-line cleanup migration

### Verification

1. Deploy + cleanup migration runs.
2. Trigger Export Full Report from `/videos`.
3. Edge function logs show:
   - `[finalize] start job=…`
   - `[finalize] sheet=1 stage=s1 fragments=… bytesSoFar=…`
   - … through sheet 6 …
   - `[finalize] zip complete tmpSize=… emittedBytes=…`
   - `[finalize] upload success path=…`
4. `export_jobs` row reaches `status=completed`, `stage=completed`, `file_size_bytes` populated, `result_path` set.
5. Download the signed URL, open in Excel, confirm 6 sheets with correct rows / headers / styles.

