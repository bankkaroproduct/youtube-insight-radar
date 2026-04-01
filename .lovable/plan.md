

# Add Channel Stats to Videos CSV Export

## Problem
The Videos CSV export doesn't include channel-level stats (subscriber count, median views, median likes) that exist in the `channels` table.

## Solution

### 1. Fetch channel stats in `downloadVideosCSV` (`src/pages/Videos.tsx`)
Before building the CSV, query the `channels` table for all unique `channel_id` values in the video list. Build a lookup map of `channel_id → { subscriber_count, median_views, median_likes }`.

### 2. Add columns to CSV headers
Insert three new columns after "Channel Name": **"Subscribers"**, **"Median Views"**, **"Median Likes"**.

### 3. Populate rows
For each video row, look up channel stats from the map and include them.

## Changes

| File | Change |
|------|--------|
| `src/pages/Videos.tsx` | Make `downloadVideosCSV` async; query `channels` table for stats; add 3 new columns to CSV |

### Updated export function (key changes)
```typescript
async function downloadVideosCSV(videos: Video[]) {
  // Fetch channel stats
  const channelIds = [...new Set(videos.map(v => v.channel_id))];
  const { data: channelData } = await supabase
    .from("channels")
    .select("channel_id, subscriber_count, median_views, median_likes")
    .in("channel_id", channelIds);
  const channelMap = new Map(
    (channelData ?? []).map(c => [c.channel_id, c])
  );

  // Headers: add "Subscribers", "Median Views", "Median Likes" after "Channel Name"
  // Rows: include ch.subscriber_count, ch.median_views, ch.median_likes
}
```

