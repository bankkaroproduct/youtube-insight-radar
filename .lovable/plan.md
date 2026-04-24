
Fix the export so “Stitching workbook...” completes reliably without changing any sheet logic, dataset scope, headers, styles, or row rules.

## Root cause

The current finalize code still has three implementation problems in `supabase/functions/export-full-report/index.ts`:

1. It uses `ZipPassThrough` for the worksheet XML entries, which stores Sheet 2 almost uncompressed instead of deflating it. With your current fragment sizes, that makes the final `.xlsx` close to the raw XML size instead of a compact workbook.
2. After writing to a temp file, it does `Deno.readFile(tmpPath)` and wraps the whole workbook in a `Blob`, which pulls the entire stitched file back into memory at once and defeats the disk-spill protection.
3. It queues multiple `tmpFile.write(dat)` calls in parallel on the same file handle. Those writes should be serialized, otherwise the finalize step can become unstable or produce a corrupted/incomplete workbook under load.

The database confirms finalize is still not finishing:
- recent jobs are stuck in `status=running`, `stage=finalize`
- `progress_message = "Stitching workbook..."`
- `file_size_bytes` is still null
- attempts keep increasing, which means finalize is being retried instead of completing once

## What to change

### 1. Make worksheet entries actually compress
Update `runStageFinalize` so the large worksheet files use a deflating zip entry instead of `ZipPassThrough`.

- Keep tiny static XML files as pass-through if desired
- Change sheet entries (`xl/worksheets/sheet*.xml`) to a compressed zip entry
- Use a low compression level for speed if needed, but do not store sheets raw

This keeps Sheet 2 from ballooning the final workbook size and reduces both upload cost and memory pressure.

### 2. Keep finalize fully streamed end-to-end
Do not read the completed temp file back into memory.

Replace:
- `const fileBytes = await Deno.readFile(tmpPath)`
- `new Blob([fileBytes])`

With:
- open the temp file for reading
- upload its readable stream directly to storage

If the storage client in this runtime rejects a stream body, use a guarded fallback only when the file is below a safe threshold. The primary path should remain stream-based.

### 3. Serialize temp-file writes
Change the zip callback write flow so chunks are written to disk in order, not as concurrent promises on the same file descriptor.

Implementation direction:
- keep a single `writeChain` promise
- append each new chunk write onto that chain
- await the final chain after `donePromise`

This removes write-order races during finalize.

### 4. Keep the existing Promise-based zip completion
Retain the current `donePromise` approach that waits for `final === true`. That part is correct and should stay.

### 5. Add targeted finalize instrumentation
Add a few lightweight logs around finalize only:

- when each sheet starts stitching
- fragment count per sheet
- bytes emitted so far
- temp file size before upload
- upload start / upload success

This makes the next failure diagnosable instead of leaving silent `running/finalize` jobs.

### 6. Safely clean up stale finalize jobs
Mark only stale jobs that are already stuck in `stage='finalize'` with expired heartbeats as failed before retrying.

Do not use a broad migration that can fail unrelated running jobs in earlier stages.

## Files to update

- `supabase/functions/export-full-report/index.ts`
  - change worksheet zip entry type
  - stream upload from temp file
  - serialize temp writes
  - add finalize logs
- optional small migration:
  - only fail stale jobs in `stage='finalize'`

## What will not change

- No export dataset changes
- No sheet order/name changes
- No header changes
- No style changes
- No row logic changes
- No client polling changes unless absolutely required
- No schema redesign

## Verification

1. Start a fresh export.
2. Confirm stage flow reaches `Stitching workbook...` only once near the end.
3. Confirm the job finishes with:
   - `status = completed`
   - `stage = completed`
   - `file_size_bytes` populated
   - `result_path` populated
4. Confirm `attempt_count` does not keep climbing during finalize.
5. Download the workbook and verify:
   - all 6 sheets exist
   - same data shape as before
   - no missing rows
   - same headers, frozen header row, and styling
6. Check finalize logs to confirm:
   - sheets stitched in order
   - upload succeeds
   - no retry loop remains
