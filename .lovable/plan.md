

# Speed Up Video Fetching Pipeline

## Problem
Every database write (video upsert, link insert, keyword mapping, channel upsert) runs **one at a time sequentially**. For 30 videos with ~10 links each, that's ~390 individual `await` calls to the database. Each round-trip is ~50-100ms, totaling 20-40 seconds just for DB writes.

## Fix: Batch and Parallelize All DB Operations

### 1. Batch video upserts
Instead of upserting videos one-by-one, collect all video records into an array and upsert them in a single call:
```typescript
// Single bulk upsert for all 30 videos
await supabase.from("videos").upsert(allVideoRecords, { onConflict: "video_id" }).select("id, video_id");
```

### 2. Batch link inserts
Collect all extracted links from all videos, then upsert in one call:
```typescript
await supabase.from("video_links").upsert(allLinkRecords, { onConflict: "video_id,original_url" });
```

### 3. Batch video_keywords upserts
Same pattern — collect all keyword mappings, upsert once:
```typescript
await supabase.from("video_keywords").upsert(allKeywordRecords, { onConflict: "video_id,keyword_id" });
```

### 4. Batch channel upserts
Collect unique channels, upsert once:
```typescript
await supabase.from("channels").upsert(channelRecords, { onConflict: "channel_id" });
```

### 5. Simplify quota tracking
Replace the SELECT-then-UPDATE pattern in `incrementQuota` with a single RPC call or just an update using raw increment. Also cache the API key within the function instead of calling `getNextApiKey` repeatedly.

## Expected Result
- ~390 sequential DB calls reduced to ~4 batch calls
- Processing time drops from 20-40 seconds to 2-4 seconds
- No more timeout risk

## Files Changed
- `supabase/functions/process-fetch-queue/index.ts` — restructure the video processing loop to collect records first, then batch-write

