

## Make finalize resumable across invocations (fix `Stitching workbook…` hang on big sheets)

The current finalize stage stitches all 6 sheets in a single edge-function invocation. Sheet 3 (~76,688 backfill videos) and Sheet 4 (per-link rows across all channels) blow the per-invocation **CPU budget** — logs showed Sheet 3 dying after 101 fragments. `setTimeout(0)` yields wall-clock but not CPU, so it doesn't help.

Fix: split finalize into many short, self-invoking ticks that each compress a small batch of fragments and append to a single zip file on disk. Same pattern S2/S3/S4 already use successfully.

### What changes

All in `supabase/functions/export-full-report/index.ts`. No schema, client, sheet content, header, styling, or row-rule changes.

1. **Switch from `fflate` streaming `Zip` to manual zip-entry writing.**
   - `Zip` is in-memory and stateful — cannot survive across invocations.
   - For each sheet, write one zip "entry" composed of: local file header → DEFLATE-compressed body chunks → data descriptor.
   - Compress each fragment in-memory with sync `deflateRaw(buf, { level: 1 })` from `fflate@0.8.2`.
   - Maintain a running CRC32 + uncompressedSize + compressedSize per entry — these are the only cross-tick state for the open entry, ~12 bytes each, persisted on `cursor.fz`.
   - When all fragments for a sheet are emitted, write the data descriptor for that entry, push entry metadata onto `cursor.fz.entries` (name, offset, sizes, crc), close it.
   - After sheet 6 + boilerplate entries (rels, styles, sharedStrings, contentTypes, workbook.xml — small, written all at once in a final tick), write the central directory + EOCD using `cursor.fz.entries`.

2. **Append to a stable temp file across ticks.**
   - First tick: `Deno.open(tmpPath, { create: true, write: true, truncate: true })`.
   - Subsequent ticks: `Deno.open(tmpPath, { write: true, append: true })`.
   - `cursor.fz.tmpPath` persists the path. Each tick opens, writes its batch, closes.

3. **Per-tick work budget.**
   - Constant `FZ_FRAGMENTS_PER_TICK = 25` (conservative — Sheet 3 hit ~101 fragments per sheet, so this gives ~4-5 ticks per heavy sheet, well under the CPU ceiling).
   - After processing the budget, flush, persist `cursor.fz`, call `selfInvoke(jobId)`, return.

4. **Finalize cursor shape on `export_jobs.cursor`.**
   ```json
   {
     "stage": "finalize",
     "fz": {
       "tmpPath": "/tmp/export-<jobid>.xlsx",
       "phase": "sheets" | "boilerplate" | "central_dir" | "upload" | "done",
       "sheetIdx": 3,
       "fragIdx": 47,
       "openEntry": { "name": "xl/worksheets/sheet3.xml", "offset": 1234567, "crc": 12345, "uncompSize": 99999, "compSize": 88888, "headerWritten": true },
       "entries": [ { "name": "...", "offset": 0, "crc": ..., "uncompSize": ..., "compSize": ... }, ... ],
       "totalBytes": 12345678
     }
   }
   ```

5. **Streaming upload stays the same.**
   - Once `phase === "upload"`, open `tmpPath` read-only and stream `.readable` to Supabase Storage `exports` bucket (existing buffered-fallback already in place).
   - On success: set `status=completed`, `stage=completed`, `result_path`, `file_size_bytes`, sign URL (existing `exportFullReport` client polls and downloads — no client change).

6. **Logging per tick.**
   ```
   [finalize] tick phase=sheets sheetIdx=3 fragIdx=25..49 bytesSoFar=...
   [finalize] sheet=3 entry-closed compSize=... uncompSize=... crc=...
   [finalize] tick phase=boilerplate
   [finalize] tick phase=central_dir entries=10 cdSize=...
   [finalize] tick phase=upload bytes=...
   [finalize] upload success path=exports/<file>.xlsx
   ```

7. **Stuck-job cleanup migration.**
   ```sql
   UPDATE public.export_jobs
   SET status = 'failed',
       error = 'superseded: chunked finalize',
       completed_at = now(),
       lease_expires_at = NULL
   WHERE status IN ('running', 'queued')
     AND stage IN ('finalize', 's3', 's4')
     AND created_at > now() - interval '6 hours'
     AND error IS DISTINCT FROM 'superseded: chunked finalize';
   ```

### Why this works

- Each tick does ~25 sync `deflateRaw` calls — bounded CPU, well under the ~150–400 CPU-second edge ceiling.
- DEFLATE state never crosses ticks (each fragment is its own raw deflate block) — the only cross-tick state is the running CRC + sizes, which are tiny and JSON-serializable on `cursor`.
- Memory stays bounded: load fragment → compress → append to file → drop reference.
- Output is a valid `.xlsx` (ZIP with stored `deflate` entries + standard CRC/sizes/central dir/EOCD), byte-compatible with what `fflate.Zip` produced before.

### What does NOT change

- Sheet content, headers, styles, frozen rows, sheet order, row rules — all unchanged
- `export_jobs` schema unchanged
- Client polling (`exportFullReport`) unchanged — it already polls 3s and follows the signed URL
- Sheets 1, 2, 5, 6 untouched
- Sheet 3 / Sheet 4 logic from the previous plan stays exactly as just shipped

### Verification

1. Cleanup migration marks the dead jobs failed.
2. Trigger Export Full Report from `/videos`.
3. Edge function logs show finalize ticking forward over many invocations, each finishing in seconds.
4. `export_jobs` row reaches `status=completed`, `stage=completed`, `result_path` set, `file_size_bytes` populated.
5. Download workbook → opens cleanly in Excel → all 6 sheets present with the per-keyword duplication and full backfill coverage from the previous plan.

### Files

- `supabase/functions/export-full-report/index.ts` — replace `runStageFinalize` body and helpers; switch import from `Zip, ZipDeflate` to plain `deflateRaw` + manual zip writer.
- New migration: stuck-job cleanup (one statement).

