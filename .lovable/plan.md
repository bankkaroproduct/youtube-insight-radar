
Root cause

The export worker is no longer failing for the original reason only. The current chunked rewrite changed the dataset shape for Sheets 3 and 4 and is still doing much more work than the original export:

- `s3` and `s4` page through the entire `videos` table, then filter “videos without keywords”.
- Your database currently has about `80,213` videos, with about `76,688` having no keyword rows.
- The latest job is already at `s3 page 53` with `rowIdx 201,452`, which proves Sheet 3 is not exporting a “last 50” dataset anymore.
- `s4` also contains an explicit approximation comment and no longer matches the original logic for “Total Videos From Channel”.

So the export is failing because the worker is generating a much larger workbook than intended, and doing far more chunk invocations than necessary. That is both a logic regression and a scale problem.

What to build

1. Restore exact legacy dataset scope for S3 and S4
- Stop scanning the whole `videos` table for these sheets.
- Build the exact “last 50 scraped” source set once per job and cache its ids in `job.metadata`.
- Reuse that same cached 50-video source set for both:
  - `S3 - Last 50 Deep Data`
  - `S4 - Last 50 Channel Map`
- Keep the original row order and inclusion rules exactly as before.
- After this fix, `s3` and `s4` should each finish in a single chunk, not dozens of pages.

2. Remove the S4 approximation and restore exact counts
- Replace the current `s4ChannelCounts` approximation with the real legacy calculation.
- The code comment currently says it is approximating prior behavior; that must be removed.
- Compute `Total Videos From Channel` from the same intended dataset the original export used, not from all videos in the database.

3. Tighten S2 to page only relevant videos
- `s2` should not page the full `videos` table and skip most rows.
- Seed `s2` from distinct `video_keywords.video_id` values, cache that id list or page through that source deterministically, then fetch only those video rows.
- This keeps the dataset unchanged while cutting the current ~90+ page scan down to only the videos that actually belong in Sheet 2.

4. Keep the current durable job architecture
- Do not change the client flow, schema, sheet names, headers, styles, bucket, or signed-url behavior.
- Keep the resumable stage machine and chunked storage-fragment approach already in place.
- Only fix the worker’s source selection and per-sheet row generation so the workbook matches the original export again.

5. Add one final safety guard in finalize
- Keep the streaming `Zip` / `ZipPassThrough` finalize path.
- Add a spill-to-temp-file fallback if compressed zip output grows beyond a safe memory threshold before upload.
- This is only a safety net; the main fix is restoring the intended smaller dataset.

Files to change

- `supabase/functions/export-full-report/index.ts`
  - fix `runStageS2`
  - fix `runStageS3`
  - fix `runStageS4`
  - add small helper(s) to compute/cache the correct source video ids
  - add compressed-output spill guard in `runStageFinalize`

What will not change

- No client changes
- No schema changes
- No sheet structure changes
- No column/header/order changes
- No styling changes
- No bucket/path naming changes
- No data logic changes beyond restoring the original intended dataset

Verification

1. Start a new export.
2. Confirm stage progression looks sane:
   - `S2` should finish in a small number of pages tied to keyword-linked videos, not all 80k videos.
   - `S3` should not reach page 53 again; it should finish from the true last-50 source set.
   - `S4` should also complete from that same last-50 source set.
3. Check `export_jobs`:
   - latest job reaches `status=completed`
   - `stage=completed`
   - `result_path` populated
   - `file_size_bytes` populated
4. Open the workbook and verify:
   - all 6 sheets exist
   - Sheets 3 and 4 contain the proper “last 50” dataset only
   - row counts and channel totals match legacy expectations
   - no header/style regressions
