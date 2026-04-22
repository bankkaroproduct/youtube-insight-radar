

## Two things in one go: drop the unused cleanup function + explain the climbing total channel count

### Part 1 — Drop `cleanup_truly_orphaned_videos()`

```sql
DROP FUNCTION IF EXISTS public.cleanup_truly_orphaned_videos();
```

Verified safe — not in any cron job, not called from any code, no data touched.

### Part 2 — Why the **total channel count** keeps growing

Just queried the live DB. State right now:

| Metric | Value |
|---|---|
| Total rows in `channels` | **1,710** |
| Channels with ≥1 video (visible on `/channels`) | **1,710** |
| Channels with zero videos | **0** |
| New channels created in last 24h | **0** |
| New channels in last hour | **0** |

So `channels` is **not growing right now** — the table has been stable for the last day. The visible count on `/channels` page is 1,710 (every channel has at least 1 video after the recount). What you're probably seeing is one of these:

**Cause A — The recount jump you already saw**

The `/channels` page filters by `total_videos_fetched > 0` and counts via Supabase's exact count. Before today's recount migration, ~95 channels had inflated counters that masked their real state and the page showed 1,615. After the recount, all 1,710 real rows became visible. That was a one-time correction, not ongoing growth.

**Cause B — Where new channels DO come from (when they appear)**

Channels are inserted into the `channels` table by exactly two flows:

1. **Keyword fetch** (`process-fetch-queue` edge function): when a video comes back from a YouTube search, the function upserts the video's `channel_id` into `channels` if it's never been seen. One keyword run can introduce 1–N new channels (your "4 videos from one channel" example creates exactly **one** new channel row, not four).
2. **Channel-stats compute** (`compute-channel-stats`): never *creates* channels — only enriches existing rows.

So the total grows **only when you fetch a new keyword that surfaces a previously-unknown channel**. Backfill itself never adds new channels — it only inserts more **videos** for channels that already exist.

**Cause C — The 4-channel discrepancy**

The `videos` table references **1,714** unique `channel_id` values but `channels` has **1,710** rows. That means 4 channels appear in `videos` but were never inserted into `channels`. Small data-integrity gap from an old keyword-fetch path that inserted videos before the channel row. They'll get reconciled the next time `process-fetch-queue` sees those channel IDs.

### What I'll add to make this self-explanatory in the UI

Add a small stat strip above the Channels table:

```text
Total channels: 1,710  ·  +0 today  ·  +0 this hour  ·  Last channel discovered: 5 days ago
```

One tiny RPC (`get_channel_growth_stats()`) returns those numbers in a single call.

### Files touched

- **One new migration** under `supabase/migrations/`:
  1. `DROP FUNCTION IF EXISTS public.cleanup_truly_orphaned_videos();`
  2. `CREATE OR REPLACE FUNCTION public.get_channel_growth_stats()` returning total + 24h + 1h + last-created timestamp.
- **`src/pages/Channels.tsx`** — small stat strip above the existing toolbar, calls the new RPC on mount.

### Out of scope

- Reconciling the 4 orphan `channel_id`s in `videos` — they'll heal naturally on the next keyword run.
- Changing keyword-fetch insert order.
- Anything on `/videos` or video dedup.

