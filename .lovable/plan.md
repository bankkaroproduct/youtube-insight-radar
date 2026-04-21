
## What’s actually going wrong

There are three separate issues causing the “still only 1 video” behavior:

1. **The backfill fetcher is not using the full channel upload history**
   - `fetch-channel-videos` currently uses YouTube `search.list` with:
     - `order=date`
     - `type=video`
     - `maxSearchPages = 12`
   - That means it inspects only a limited recent slice of the channel.
   - For channels with lots of Shorts or mixed content, the function may skip most results and end up inserting only 1–9 usable videos even if the channel has thousands.

2. **The backfill keeps sampling only the first low-count channels**
   - The function selects a small ordered window of channels with the lowest `total_videos_fetched`.
   - With 1710 channels and many tied at `1`, later channels can be starved and never meaningfully revisited.

3. **The Channels page uses unstable pagination**
   - `useChannels()` paginates by ordering only on `total_videos_fetched`.
   - When many rows share the same count, paginated ranges can duplicate or skip rows.
   - This matches the console warning about duplicate React keys and can make the table look inconsistent.

## Implementation plan

### 1. Replace the channel backfill source with the uploads playlist
Update `supabase/functions/fetch-channel-videos/index.ts` so backfill does not depend on `search.list` for channel history.

New approach per channel:
- Call `channels.list(part=contentDetails,statistics)` to get:
  - `statistics.videoCount`
  - `contentDetails.relatedPlaylists.uploads`
- Page through `playlistItems.list` on the channel’s uploads playlist
- Collect uploaded video IDs until:
  - 50 eligible stored videos are reached, or
  - the channel is exhausted
- Then call `videos.list(part=snippet,statistics,contentDetails)` in batches for details
- Continue filtering out Shorts if that is still desired

Why this fixes it:
- The uploads playlist is the authoritative ordered list of channel uploads
- It can reach older videos instead of being trapped in a recent search slice
- Channels like the one you shared can actually backfill toward 50

### 2. Remove the 12-page underfetch bottleneck
Inside `fetch-channel-videos`, replace the current:
- `searchPagesFetched`
- `maxSearchPages = 12`

with a bounded uploads-playlist loop:
- stop when 50 valid non-Short videos are stored
- or when playlist pages are exhausted
- or when a safe per-channel cap is reached for timeout protection

Suggested safety guard:
- playlist page cap around 20–30 pages per invocation
- detail requests in small batches
- keep existing frontend batch loop

### 3. Make channel selection rotate through all underfilled channels
Revise the `backfill_under_50` channel selection logic so it doesn’t always re-read the same leading window.

Recommended change:
- query channels under 50 with a deterministic secondary order, e.g.
  - `total_videos_fetched ASC`
  - `last_analyzed_at ASC nulls first`
  - `channel_id ASC`
- process the first `limit`
- after each processed channel, update `last_analyzed_at`
- next invocation naturally moves to the next underfilled channels

This ensures all 1710 channels get turns instead of the first tied subset monopolizing the queue.

### 4. Keep `total_videos_fetched` synced from actual stored rows
Retain the recent fix, but make it consistent in all code paths:
- after successful upsert
- after zero-new-video result
- after “channel exhausted” result

For each processed channel:
- recount rows in `videos` for that `channel_id`
- update `channels.total_videos_fetched`
- update `channels.youtube_total_videos` when available

### 5. Stabilize Channels page pagination
Update `src/hooks/useChannels.ts` so paginated fetches use a stable secondary sort.

Current issue:
- ordering only by `total_videos_fetched` causes duplicate/omitted rows across `.range(...)`

Fix:
- add a second order clause such as:
  - `order("total_videos_fetched", { ascending: false })`
  - then `order("channel_id", { ascending: true })` or `order("id", { ascending: true })`

This should also eliminate the duplicate key warnings seen in the console.

### 6. Refresh UI behavior after each backfill batch
Keep the existing live `refresh()` in `Channels.tsx`, but make sure it works with the stable ordering fix so the table reflects accurate progress instead of reshuffled duplicate rows.

## Files to update

- `supabase/functions/fetch-channel-videos/index.ts`
- `src/hooks/useChannels.ts`

Possibly no database migration is required if reusing `last_analyzed_at` for rotation. If that field should remain dedicated to stats analysis only, then add a new channel backfill timestamp column instead.

## Technical details

### Current root cause in code
In `fetch-channel-videos/index.ts`:
- backfill depends on `search.list`
- capped at `maxSearchPages = 12`
- filters out Shorts after fetch
- so a Shorts-heavy channel can still end with very few qualifying videos

In `useChannels.ts`:
- pagination uses `.range(...)`
- ordered only by `total_videos_fetched`
- ties create unstable page boundaries

### Safer fetch flow
```text
channels.list -> uploads playlist id
      ↓
playlistItems.list (page through uploads)
      ↓
videos.list (details for collected IDs)
      ↓
filter Shorts / already stored
      ↓
upsert videos
      ↓
recount videos table
      ↓
update channels.total_videos_fetched
```

## Acceptance criteria

- High-volume channels can reach at least 50 stored videos if they have 50 eligible non-Short uploads
- Channels are no longer stuck at 1–9 because only recent search results were examined
- Backfill progresses across the whole 1710-channel set instead of repeatedly favoring the same subset
- Channels page no longer shows duplicate row key warnings
- Counts on `/channels` reflect actual stored videos after each batch
