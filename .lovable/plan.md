

## Fix: Link processing stats cards stuck on "..."

### Root cause

`ProcessingTab.fetchStats` in `src/pages/Links.tsx` runs **5 parallel `count: "exact"`** queries against `video_links` (161k rows, actively being written to). Postgres' statement timeout kills them under load, errors get swallowed into the catch block, but `setLoading(true)` was already set — so the cards render `"..."` and never recover. The 5-second auto-poll while processing makes it worse: each tick stacks more dying queries on the table.

I confirmed the underlying processing fix from the previous round is working — pending dropped from 96,158 to 95,916 in a few minutes, with fresh `updated_at` timestamps. This plan only addresses the unrelated stats-card visibility issue.

### Fix (single file: `src/pages/Links.tsx`)

1. **Switch to `count: "estimated"`** for the 4 large counts (total / processed / with platform / with retailer). Estimated counts use `pg_class` reltuples + the planner's row estimate — they return in milliseconds even on 160k+ rows under heavy write load. The numbers will be ±1–2% off, which is fine for a progress dashboard. Keep `count: "exact"` only for `failed` (small set, needs to be precise so the "Retry Failed" banner is right).

2. **Run sequentially, not in parallel.** 5 simultaneous count queries during active writes is what's killing them. Sequential adds ~1 extra second total but eliminates the contention.

3. **Replace `loading` state with `statsLoaded`.** Show `"..."` only on the very first load; on subsequent refreshes keep showing the previous numbers (so a transient error never blanks the cards again).

4. **Add an in-flight guard** (`inFlightRef`) so overlapping polls can't pile up if a fetch is slow.

5. **Slow the auto-poll from 5s → 15s** while processing is running. Stats don't need second-by-second precision, and 15s gives the heavily-written table breathing room.

6. **Log errors instead of swallowing them**, so future regressions are visible in the console.

### Why not a server-side aggregate function?

A single SQL function with `count(*) FILTER (...)` would be the cleanest fix, but adding new SQL functions requires the migration tool which isn't available in this session. The estimated-count approach gets the cards working immediately with zero schema changes. We can switch to a server-side aggregate later if you want pixel-exact numbers.

### Expected outcome

- On reload of the Processing tab, all 6 cards populate within ~1 second.
- During active processing the numbers refresh every 15 seconds without blanking out.
- "Failed" stays accurate; the other 5 may be ±1% (acceptable for a progress view).
- If the DB ever does fail a count, the cards keep showing the last good value and the error appears in the console.

### Files touched

- `src/pages/Links.tsx` — `ProcessingTab` component only (~70 lines around the `fetchStats` function and its useEffects).

