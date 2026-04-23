
Root cause

The export is no longer dying on the old `xlsx` browser error. It is now stalling because the current backend job still tries to do the entire export in one edge-function lifetime:
- the job sits at `Fetching data (parallel)...` in the UI
- the client then fails on its own 10-minute timeout
- the backend still does large paginated reads and keeps too much state in a single invocation

The Stage 1 patch helped Sheet 2 memory, but it did not make the export durable. The real fix is to turn the export into a resumable multi-invocation job.

What to build

1. Expand `export_jobs` into a real state machine
- Add columns for:
  - `stage` text
  - `cursor` jsonb
  - `heartbeat_at` timestamptz
  - `lease_expires_at` timestamptz
  - `attempt_count` integer
  - `storage_prefix` text
  - `result_path` text
  - `metadata` jsonb
- Keep existing `status`, `progress_message`, `error`, `file_size_bytes`, `completed_at`.
- Continue letting users only read their own jobs; worker writes stay service-only.

2. Rewrite `supabase/functions/export-full-report/index.ts` as a chunk worker
Keep one function with three behaviors:
- `action=start` (or empty body): create/queue a job and return `job_id`
- `action=status`: return job row + signed download URL when complete
- worker execution: claim the job lease, do exactly one chunk, update stage/cursor, then self-invoke again if more work remains

3. Make the worker durable instead of “one giant background task”
Replace the current `EdgeRuntime.waitUntil(backgroundTask)` whole-job pattern with:
- claim job if not leased or lease expired
- process one bounded chunk
- persist progress immediately
- release/extend lease
- self-call the function for the next chunk

Also make `status` opportunistically re-kick a stalled job when `lease_expires_at` is old, so recovery does not depend on a cron from day one.

4. Chunk by sheet and by page, not by whole dataset
Use the same workbook output, but generate it in stages:

```text
queued
  -> s1
  -> s2
  -> s3
  -> s4
  -> s5
  -> s6
  -> finalize
  -> completed
```

Stage details
- `s1`: build once from keywords + `get_keyword_stats()` instead of loading all `video_keywords` just to count
- `s2`: page videos in batches; for each batch fetch only matching `video_keywords`, `video_links`, and referenced keywords; write numbered XML row fragments
- `s3` / `s4`: page only “last 50 scraped” videos / no-keyword videos in chunks and write fragments
- `s5` / `s6`: page channels in chunks; fetch Instagram rows only for current channel chunk; run `ensureChannelLinksScraped` only for channels in the current chunk before building their rows
- `finalize`: stitch stored XML fragments into worksheet XML files and zip the workbook

5. Store numbered XML fragments in the existing private `exports` bucket
Since append mode is not available, write fragments like:

```text
exports/{user_id}/{job_id}/parts/s2/000001.xml
exports/{user_id}/{job_id}/parts/s2/000002.xml
...
exports/{user_id}/{job_id}/parts/s5/000001.xml
```

Also store small manifest JSON in the same prefix with:
- current stage
- next cursor
- fragment counts
- total row counts per sheet

6. Finalize without rebuilding everything in memory
During `finalize`:
- read the fragment lists in order
- wrap them with worksheet header/footer XML
- generate the final `.xlsx`
- upload final file to `exports/{user_id}/youtube_full_report_YYYY-MM-DD_<job>.xlsx`
- mark job `completed`

Use `fflate`’s non-`zipSync` zip flow for final assembly so finalization does not reintroduce one large memory spike.

7. Update the thin client poller so it no longer false-fails at 10 minutes
`src/services/excelExportService.ts` should keep the same UX, but:
- stop using the hard 200-poll / 10-minute cutoff
- poll until terminal status (`completed` / `failed`) or a much larger ceiling
- continue surfacing `progress_message`
- download from signed URL once ready

`src/pages/Videos.tsx` can stay functionally the same.

8. Preserve output parity
Do not change:
- sheet names/order
- headers
- row inclusion rules
- styling rules
- filename pattern
- storage bucket
- toast-based UX

Technical details

Files to change
- `supabase/migrations/<new>.sql` — expand `export_jobs` for stage/cursor/lease metadata
- `supabase/functions/export-full-report/index.ts` — full worker rewrite
- `src/services/excelExportService.ts` — remove the 10-minute client timeout and keep polling terminal job state

Implementation notes
- Query in ID/page chunks instead of `fetchAll()` across whole tables
- Persist heartbeat/progress after every chunk
- Keep chunk size small and explicit (for example 500–2000 videos or 100–250 channels per invocation)
- Add guardrails so duplicate worker invocations cannot process the same cursor twice
- Fail job with exact stage/cursor context when an invocation errors

Verification
- Start export from `/videos`
- Confirm progress moves past `Fetching data...` into sheet-specific stages
- Confirm `export_jobs` shows advancing `stage`, `cursor`, and fresh `heartbeat_at`
- Confirm final job reaches `completed` and signed URL downloads successfully
- Open workbook and verify all 6 sheets, row counts, frozen header row, and existing color/italic styling
