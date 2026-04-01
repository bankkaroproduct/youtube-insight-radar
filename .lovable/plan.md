

# Fix Channel Stats Missing in Video CSV Export

## Problem
The `downloadVideosCSV` function (line 70-73 in `src/pages/Videos.tsx`) fetches channel stats with a single `.in("channel_id", channelIds)` query. When there are 1,289+ unique channels, the query URL exceeds the ~8KB HTTP limit, causing it to silently return partial or no data. This is why Subscribers, Median Views, and Median Likes columns are empty in the downloaded CSV.

## Fix

### `src/pages/Videos.tsx` — Chunk the channel stats query
Apply the same ID-chunking pattern used in `useVideos.ts`:

```typescript
const ID_CHUNK = 200;
const channelChunks: string[][] = [];
for (let i = 0; i < channelIds.length; i += ID_CHUNK) {
  channelChunks.push(channelIds.slice(i, i + ID_CHUNK));
}
const channelData = (await Promise.all(
  channelChunks.map(chunk =>
    supabase
      .from("channels")
      .select("channel_id, subscriber_count, median_views, median_likes")
      .in("channel_id", chunk)
      .then(({ data }) => data ?? [])
  )
)).flat();
```

This splits the channel IDs into groups of 200, fetches them in parallel, and merges the results. No other changes needed — the rest of the export logic already works correctly.

| File | Change |
|------|--------|
| `src/pages/Videos.tsx` | Replace single `.in()` channel query with chunked parallel queries |

