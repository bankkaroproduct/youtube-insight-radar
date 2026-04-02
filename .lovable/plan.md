

# Fetch 50 Videos for 30 Channels with Low Video Counts

## What
Update the `fetch-channel-videos` edge function to support filtering channels by `total_videos_fetched` range, then invoke it for channels with 1-3 fetched videos.

## How

### 1. Update edge function (`supabase/functions/fetch-channel-videos/index.ts`)
Add optional `min_videos` and `max_videos` body parameters to filter the channel query:

```typescript
const minVideos = body.min_videos ?? null;
const maxVideos = body.max_videos ?? null;

let query = supabase.from("channels").select("channel_id, channel_name")
  .order("total_videos_fetched", { ascending: false })
  .limit(limit);

if (minVideos !== null) query = query.gte("total_videos_fetched", minVideos);
if (maxVideos !== null) query = query.lte("total_videos_fetched", maxVideos);
```

### 2. Deploy and invoke
Invoke with: `{ "limit": 30, "min_videos": 1, "max_videos": 3 }`

This will fetch the latest 50 videos for 30 channels that currently have 1, 2, or 3 videos fetched.

## Cost
~30 channels × ~150 API units ≈ ~4,500 quota units total.

