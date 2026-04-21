

## Issue

After **Backfill to 50 Videos** runs, new videos are correctly inserted into the `videos` table, but the `channels.total_videos_fetched` column is never updated by the backfill itself. That column is the only thing the Channels page displays — so the count appears unchanged even though videos *were* fetched.

Today, `total_videos_fetched` is only refreshed by the separate **Recompute Stats** action (the `compute-channel-stats` edge function on line 100–101). Until you click that, the Channels page shows stale counts.

## Fix

Make `fetch-channel-videos` update `channels.total_videos_fetched` for every channel it processes, so the Channels page reflects reality immediately after each backfill batch.

### 1. `supabase/functions/fetch-channel-videos/index.ts`

After upserting videos for a channel (around line 226), recount that channel's videos in the DB and write the result back:

```ts
// After videos are upserted for the channel
const { count: newTotal } = await supabase
  .from("videos")
  .select("id", { count: "exact", head: true })
  .eq("channel_id", channelId);

await supabase
  .from("channels")
  .update({ total_videos_fetched: newTotal ?? 0 })
  .eq("channel_id", channelId);
```

Also do this when `missingVideos === 0` (channel was already complete) — currently we early-return without syncing the count, so a channel that has 12 stored but `total_videos_fetched=8` from old data stays wrong forever. Sync the count in that branch too.

### 2. Client-side refresh in `src/pages/Channels.tsx`

The `backfillTo50` loop should call `refresh()` from `useChannels` after each batch (not just at the end), so the user sees counts climbing live instead of all-at-once.

## Why the previous fix didn't address this

Earlier work focused on:
- The backfill *filter* (skip already-complete small channels)
- The `youtube_total_videos` accuracy
- The "till date" UI badge

None of those touch `total_videos_fetched`, which is the actual number rendered in the Channels table cell. That's why videos increase in the database but the channel row looks frozen.

## Acceptance

- After running Backfill to 50, each processed channel's row on `/channels` shows the new count without needing to click Recompute Stats.
- Channels page count refreshes between backfill batches, not only at the end.
- Channels that were already at their YouTube max (e.g. 12/12) get their `total_videos_fetched` corrected if it was previously understated.

