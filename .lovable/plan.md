

## Fix: Link processing reports success but persists nothing

### Root cause (confirmed from Postgres logs)

Every `video_links` upsert inside `process-video-links` is being silently rejected. Two distinct DB errors are firing on every batch:

1. **`null value in column "video_id" violates not-null constraint`** — `supabase.from("video_links").upsert(rows, { onConflict: "id" })` is sent by PostgREST as an `INSERT ... ON CONFLICT (id) DO UPDATE`. Postgres validates NOT NULL on the *incoming* row before the conflict swap. The failure-row payload (`{ id, resolution_attempts, resolution_status, last_resolution_error }`) and several other code paths omit `video_id` and `original_url`, so the whole chunk is rejected.

2. **`canceling statement due to statement timeout`** — the large success-row upserts (chunks of 500, ~17 columns each) exceed Postgres' statement timeout. Whole chunks are dropped.

The function never checks `error` on its upserts, so the loop happily reports `success: true, processed: 235`, but the DB is unchanged. That's why `remaining` stays pinned at 96,158 across every batch and `updated_at` on resolved rows is frozen at 17:53:14 from one earlier successful pass.

### Fix

All changes are in `supabase/functions/process-video-links/index.ts`.

**1. Stop using `upsert` for partial updates — use `update().in("id", ...)` instead.**

Five upsert sites currently rely on conflict-update behavior but only carry partial payloads. Convert each to a real UPDATE keyed by `id`, which has no NOT NULL pressure since it touches existing rows only:

- Skip-domain fast path (line ~497): change to `.update({...}).eq("id", link.id)` per row, or use `.update(common).in("id", batchIds)` after grouping rows that share the same payload (they do — all skip rows get the same `classification/is_shortened/link_type/resolution_status` plus a per-row `unshortened_url/domain/original_domain`).
  - Cleanest: keep per-row but issue them via `Promise.all` chunks of 100, OR build a single SQL via `rpc` — simplest is to loop and `.update(...)` per row in batched parallelism.
- Skip-batch inside while loop (line ~595): same treatment.
- Success-row write (line ~842): split each row into an UPDATE by id. To preserve throughput, group rows whose payloads are identical except for id (rare here), or run updates in `Promise.all` chunks of 25.
- Failure-row write (line ~866): replace upsert with per-id UPDATE — already keyed by id only.
- Step-3 unmatched-link write (line ~937): same.

**2. Reduce chunk size and add error logging.**

- Drop chunk size from 500 → 100 to stay well under statement timeout.
- After every DB write, check `error` and `console.error` it. Right now failures are invisible. Add at minimum:
  ```
  const { error } = await supabase.from("video_links").update(...).eq("id", id);
  if (error) console.error("video_links update failed", { id, error: error.message });
  ```

**3. Surface DB write failures to the caller.**

Track `dbErrors` count alongside `totalProcessed/totalCached/totalFailed` and include it in the response JSON. The client log will then show e.g. `(107 cached, 1 failed, 5 db errors)` instead of pretending everything worked.

**4. One-time cleanup (no migration needed).**

Once the function writes correctly, the next batch run will start draining the 96,158 pending links naturally. No data backfill required.

### Why not just add `video_id`/`original_url` to the failure payload?

Two reasons: (a) the function doesn't always have `original_url` in scope at the failure-write site without re-plumbing, and (b) statement-timeout failures on the 500-row success chunks would still happen. Switching to UPDATE + smaller chunks fixes both classes of failure with one change and removes the fragile "remember to include every NOT NULL column on every upsert" footgun for future edits.

### Expected outcome after fix

- Console log shows: `Batch #1: 235 processed (107 cached, 1 failed), 95,923 remaining` — `remaining` actually decreases.
- `resolution_status='pending'` count drops by ~200/batch.
- Stuck `bit.ly`/`myshlf.us` rows get `resolution_attempts` incremented and eventually move to `resolution_status='failed'` after 3 tries (current code already does this, it just wasn't persisting).
- If anything still fails to write, the response includes `dbErrors > 0` and the edge logs show the exact reason.

### Files touched

- `supabase/functions/process-video-links/index.ts` — replace 5 `upsert` calls with `update`, reduce chunk size, add error logging, add `dbErrors` to response.

