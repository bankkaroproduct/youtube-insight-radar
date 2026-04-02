

# Fetch Latest 50 Videos for Top 50 Channels

## What
Create and invoke a new backend function that takes the top 50 channels (by `total_videos_fetched`) and fetches their most recent 50 videos each using the YouTube Data API.

## How

### 1. New edge function: `fetch-channel-videos/index.ts`

- Query `channels` table for top 50 rows ordered by `total_videos_fetched DESC`
- For each channel, call YouTube Search API with `channelId={id}&order=date&maxResults=50&type=video`
- Fetch video details (snippet + statistics) in chunks of 50
- Filter out shorts (< 60s, #shorts in title)
- Upsert into `videos`, extract description URLs into `video_links`
- Uses existing `youtube_api_keys` rotation (same pattern as `process-fetch-queue`)
- Process channels in parallel batches of 5 to stay within edge function time limits
- Fire-and-forget triggers to `process-video-links` and `compute-channel-stats` after completion

### 2. Invoke the function

After deploying, invoke it to kick off the fetch immediately.

## Technical Details

| Aspect | Detail |
|--------|--------|
| YouTube API cost | ~100 units per search call + 1 unit per video details call per 50 videos ≈ ~150 units per channel, ~7,500 total |
| Parallelism | 5 channels at a time with API key round-robin |
| Deduplication | Upsert on `video_id` conflict for videos, `video_id,original_url` for links |
| No keyword association | These videos won't be linked to any keyword (keyword_id = null) |

