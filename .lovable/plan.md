

## Backfill stopped after 1 channel — root cause and fix

The toast "Backfilled 1 channels — 0 videos (0% of max achievable)" is correct but misleading. Two real bugs combined to end the run prematurely.

### What actually happened

Edge function logs show:
```
ERROR No uploads playlist id for channel UC6vvFZl62d_7lxVjz1dpZFw
```

That channel (`Torquekick_KL31`, 1 video stored, `youtube_total_videos = NULL`) is private, deleted, or YouTube refuses to return its `contentDetails`. The function:
1. Couldn't fetch the uploads playlist → returned 0 videos.
2. **Did not** flag the channel as terminally exhausted, so the next backfill iteration would pick it again.
3. Returned `total_videos_inserted: 0` to the client.

The client (`Channels.tsx` line 254) then hit `if (inserted === 0) break;` — **wrong stop condition**. A batch of dead/exhausted channels legitimately returns 0 videos but the next batch could still be productive.

Also, of the 114 channels still flagged "needs backfill", **most have `youtube_total_videos = NULL`** (the channel-stats fetch never succeeded, likely from a past API-key exhaustion). They sit at the front of the queue and may all be in the same broken state.

### Fix (2 small changes, no new schema)

**1. `supabase/functions/fetch-channel-videos/index.ts` — handle "no uploads playlist"**

When `channels.list` returns no `contentDetails.relatedPlaylists.uploads`, mark the channel as terminally exhausted so backfill never re-selects it:
- Set `youtube_longform_total = current stored count` (the new "needs backfill" RPC will exclude it).
- Set `uploads_fully_scanned_at = now()` and `scanned_at_youtube_total = youtubeTotal ?? stored count`.
- Bump `last_analyzed_at`.

This drains the queue of dead/private channels in a single pass.

**2. `src/pages/Channels.tsx > backfillTo50` — fix the stop condition**

Replace the brittle `if (inserted === 0) break;` with a tolerant version:
- Only stop on `processed === 0` (server returned no candidates → genuinely done).
- Allow up to **3 consecutive zero-insert iterations** before breaking — covers a streak of exhausted channels but still bails if nothing is moving.
- Show a clearer toast distinguishing "X channels exhausted (already at their ceiling)" from "Y new videos backfilled".

### Files touched

- `supabase/functions/fetch-channel-videos/index.ts` — mark "no uploads playlist" channels as exhausted (lines 128–132).
- `src/pages/Channels.tsx` — relax `backfillTo50` stop condition + better progress copy (around line 254).

### Not in scope

- No DB migration (the previous one already added the columns we use).
- No change to the Shorts filter or 50-video target.
- No retry logic for `channels.list` failures — those are handled by the existing key-rotation wrapper; truly missing playlists mean the channel is gone.

### What to expect after the fix

Click **Backfill Under 50** again. The next pass will:
1. Sweep through the ~10–20 dead/private channels in one go, marking them exhausted so they drop off the "Needs Backfill" counter.
2. Continue past zero-insert batches and reach the channels that genuinely have more long-form videos to fetch.
3. The "Needs Backfill" number will fall meaningfully on the first run instead of getting stuck at 114.

