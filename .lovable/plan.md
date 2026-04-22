

## Backfill-under-50 improvements

Tighten the "Backfill" flow so it only targets channels that **can** be backfilled, and report progress against the real maximum achievable (not a flat 50× channels).

### What changes

**1. Smarter selection filter (edge function)**
In `supabase/functions/fetch-channel-videos/index.ts` (the in-memory filter around line 363), replace the current `backfillUnder50` block with explicit case handling:

- `fetched >= 50` → skip (done).
- YouTube total < 50 and we already have `fetched >= ytTotal` → skip (no more to get).
- YouTube total < 50 but `fetched < ytTotal` → include (e.g. 20/30 → can still grow to 30).
- YouTube total ≥ 50 (or unknown) and `fetched < 50` → include.

The existing "fully scanned + youtube total unchanged" hard skip above this block stays untouched.

**2. Report max-achievable per batch (edge function)**
Track `totalTargetForBatch` in the channel loop:
```ts
const ytTotal = r.value.youtubeTotal;
totalTargetForBatch += Math.min(50, ytTotal ?? 50);
```
Add `total_videos_target` to the JSON response alongside `channels_processed` and `total_videos_inserted`.

**3. Client loop uses the new field (`src/pages/Channels.tsx`, `backfillTo50`)**
- Reduce per-call `limit` from 25 → 10 (matches the server's hard cap of 10, avoids a misleading number on the wire).
- Accumulate `totalTarget` across iterations.
- Toast shows `"Backfilled X channels (Y/Z videos)…"` during the loop.
- Final toast shows completion percentage: `"Done. Backfilled X channels — Y videos (Z% of max achievable)."`
- Stop conditions unchanged: `processed === 0` or `inserted === 0`.

**4. Button label + tooltip (`src/pages/Channels.tsx`)**
Rename **"Backfill to 50 Videos"** → **"Backfill Under 50"** with a `title` tooltip explaining "Fetches videos for channels that have fewer than 50 stored. Caps at 50 or whatever YouTube has, whichever is smaller."

**5. New "Needs Backfill" stat card**

New SQL function via migration:
```sql
create or replace function public.get_channels_needing_backfill()
returns bigint language sql stable security definer set search_path to 'public' as $$
  select count(*)::bigint from public.channels
  where total_videos_fetched < 50
    and total_videos_fetched > 0
    and (youtube_total_videos is null or youtube_total_videos > total_videos_fetched)
    and (
      uploads_fully_scanned_at is null
      or scanned_at_youtube_total is null
      or youtube_total_videos is null
      or youtube_total_videos > scanned_at_youtube_total
    );
$$;
grant execute on function public.get_channels_needing_backfill() to authenticated;
```

In `Channels.tsx`:
- Extend `SummaryStats` with `needs_backfill: number`.
- Update `loadSummary` to call both RPCs in parallel via `Promise.all`.
- Add 6th stat card: `{ label: "Needs Backfill", value: summary.needs_backfill, icon: VideoIcon, color: "text-amber-500" }`.
- Bump grid from `md:grid-cols-5` → `md:grid-cols-6` (or `lg:grid-cols-6`) so the new card lays out cleanly.

### Expected outcome

- Backfill no longer wastes attempts on channels that are already maxed out at YouTube's available count.
- Toast shows `(Y/Z videos)` so it's obvious when the run is at 100% of what's achievable vs. still has room.
- Stat card on the page shows at a glance how many channels are eligible for backfill before you click the button (currently ~1,503 of 1,710).

### Files touched

- **New migration** — `get_channels_needing_backfill()` SQL function.
- `supabase/functions/fetch-channel-videos/index.ts` — rewrite the `backfillUnder50` filter block, add `total_videos_target` accumulator + response field.
- `src/pages/Channels.tsx` — `backfillTo50` loop (target accumulator, completion %), button label/tooltip, `loadSummary` parallel RPC, `SummaryStats` type, 6th stat card, grid columns.

