

## Fix: Stats cards don't update during processing

### Root cause (two compounding bugs)

**1. The "Process Links" button in the page header doesn't refresh stats at all.**
`src/pages/Links.tsx` line 317 calls `linkProcessingService.start(undefined, 200)` — `undefined` is the `onStatsRefresh` callback. So even though the service correctly fires `onStatsRefresh?.()` after every batch, nothing happens. Only the button *inside* the Processing tab (`startProcessing`, line 589) wires up `fetchStats`. If you started processing from the header, the cards will literally never update from a batch callback.

**2. Even on the Processing tab, the cards show stale numbers because we're using `count: "estimated"`.**
The previous fix (estimated counts) trades accuracy for speed by reading `pg_class.reltuples` and planner stats — but those are only refreshed by autovacuum/ANALYZE, not after each row update. I just confirmed against the live DB: pending dropped from 96,158 → 94,104 (real progress), but the planner estimate for filtered counts (`unshortened_url IS NOT NULL`, `affiliate_platform IS NOT NULL`, etc.) sits frozen between ANALYZE runs. So the cards refresh every 15s, but to the same numbers.

The replay confirms this: the refresh button spinner is firing on schedule, but the values on screen don't change.

### The fix

**A. Server-side aggregate function (one round-trip, exact counts, milliseconds).**

Add a single SQL function via migration:

```sql
CREATE OR REPLACE FUNCTION public.get_video_links_processing_stats()
RETURNS TABLE(total bigint, processed bigint, with_platform bigint,
              with_retailer bigint, failed bigint, pending bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    count(*),
    count(*) FILTER (WHERE unshortened_url IS NOT NULL),
    count(*) FILTER (WHERE affiliate_platform IS NOT NULL),
    count(*) FILTER (WHERE resolved_retailer IS NOT NULL),
    count(*) FILTER (WHERE resolution_status = 'failed'),
    count(*) FILTER (WHERE resolution_status = 'pending')
  FROM public.video_links;
$$;
GRANT EXECUTE ON FUNCTION public.get_video_links_processing_stats() TO authenticated;
```

A single sequential scan with `FILTER` clauses on a 161k-row table runs in ~50–150ms even under heavy concurrent writes — much faster than 5 separate count queries.

**B. Replace `fetchStats` to call the RPC.**

In `ProcessingTab` (`src/pages/Links.tsx`), swap the 5 sequential `count` queries for one `supabase.rpc("get_video_links_processing_stats")` call. Keep the `inFlightRef` guard, `statsLoaded` flag, and `refreshing` state. Drop the per-card "..." fallback once the first call succeeds.

**C. Wire the header "Process Links" button to refresh stats too.**

Lift the `fetchStats` callback so the page-level button (line 317) also passes a refresh function. Cleanest: have `linkProcessingService` notify a "batch completed" event that any subscriber can hook into, and have `ProcessingTab` subscribe regardless of which button started the run. Simpler patch: add a `lastBatchCompletedAt` timestamp to the service's snapshot, and have `ProcessingTab` re-run `fetchStats` whenever that timestamp changes (via a `useEffect` on the snapshot field). That works no matter which button started processing.

**D. Tighten the auto-poll back to 5s.**

With the RPC the per-poll cost is ~50ms instead of 5×timeout-prone queries. 5s polling is safe again and gives the user near-realtime feedback. Keep the `inFlightRef` guard so slow polls can't stack.

### Expected outcome

- Click "Process Links" from anywhere on the page → cards update after every batch completes (within ~1s of the batch log line appearing).
- On the Processing tab, cards also auto-refresh every 5s as a backstop.
- Numbers are **exact**, not estimated — pending count visibly decrements each batch.
- One DB round-trip per refresh instead of five, so the stats panel no longer competes with the link processor for connections.

### Files touched

- **New migration** — adds `get_video_links_processing_stats()` SQL function.
- `src/pages/Links.tsx` — `ProcessingTab.fetchStats` calls the RPC; subscribe to service `lastBatchCompletedAt` to refresh on batch events; tighten poll to 5s.
- `src/services/linkProcessingService.ts` — add `lastBatchCompletedAt` to snapshot, bump it after each successful batch alongside the existing `onStatsRefresh?.()` call.

