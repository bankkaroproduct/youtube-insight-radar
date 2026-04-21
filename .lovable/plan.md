## Goal

Make **Backfill to 50 Videos** smarter so it stops re-fetching channels that already have 50 total uploads on YouTube, and surface that "complete" state visually so reviewers know the count is the channel's true total — not an incomplete backfill.

## Problem today

The backfill filter is `total_videos_fetched < 50`. A channel that has only 12 videos on YouTube and 12 fetched still matches this filter forever, so:

- It keeps getting selected on every backfill pass and burns YouTube API quota.
- The `while` loop in `backfillTo50` never reliably terminates for these channels.
- Reviewers can't tell from the UI whether "12 videos" means "incomplete backfill" or "this channel only has 12 videos total".

## Changes

### 1. `supabase/functions/fetch-channel-videos/index.ts` — smarter backfill filter

Update the in-memory filter so a channel is only backfilled when there's actually more to fetch:

```ts
const channels = (rawChannels || [])
  .filter((channel: any) => {
    const fetched = Number(channel.total_videos_fetched ?? 0);
    const ytTotal = channel.youtube_total_videos == null
      ? null
      : Number(channel.youtube_total_videos);

    if (backfillUnder50) {
      if (fetched >= 50) return false;
      // Skip channels we've already fully covered (YouTube has fewer than 50 total).
      if (ytTotal !== null && fetched >= ytTotal) return false;
    }
    if (minVideos !== null && fetched < minVideos) return false;
    if (maxVideos !== null && fetched > maxVideos) return false;
    return true;
  })
  .slice(0, limit);
```

Channels with unknown `youtube_total_videos` still get processed once — that pass populates `youtube_total_videos`, so the next pass can skip them if they're already complete.

### 2. `src/pages/Channels.tsx` — UI clarity for "small channels"

In the channels table, where we show the fetched-video count, render:

- `12 / 12 (complete)` when `total_videos_fetched >= youtube_total_videos` and YouTube total < 50
- `34 / 50` (or similar) when still backfilling
- `50` when fully backfilled and YouTube total ≥ 50

Use a muted badge for "complete" so reviewers immediately recognize that 12 isn't an error — it's the channel's lifetime upload count.

### 3. `src/services/excelExportService.ts` — match column semantics in S5

The existing **Videos Fetched (max 50)** column already shows `total_videos_fetched`. Rename it to **Videos Fetched (Till Date)** and append a `(complete)` marker in the same cell when `total_videos_fetched >= youtube_total_videos` and `youtube_total_videos < 50`. The neighboring **Total Videos on YouTube** column stays as-is so the discrepancy is still obvious at a glance.

### 4. Backfill loop termination safety

`backfillTo50` in `Channels.tsx` already breaks when `channels_processed === 0`. With change #1, channels that are "complete despite < 50" will no longer be selected, so the loop now terminates correctly instead of spinning on the same small channels.

## Acceptance

- Running **Backfill to 50 Videos** never re-selects a channel whose YouTube total is below 50 once it has been fully fetched.
- Backfill loop terminates cleanly even when many channels have < 50 total uploads.
- Channels list visibly distinguishes "small channel, fully covered" from "still backfilling".
- S5 export carries the same distinction so downstream reviewers don't flag complete-but-small channels as missing data.