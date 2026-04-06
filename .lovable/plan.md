

# Fetch Videos for Channels with 0 Fetched Videos + Show "Till Date" Count

## What the user wants
1. A way to trigger fetching the last 50 videos for channels that currently have `total_videos_fetched < 1` (i.e., 0).
2. In the Videos column on the Channels table, if a channel has fewer than 50 total videos, display something like "10-Till date" to indicate that's all the channel has.

## Changes

### 1. Add "Fetch New Channels" button on Channels page
**File: `src/pages/Channels.tsx`**
- Add a new button "Fetch New Channel Videos" next to the existing action buttons.
- On click, invoke the `fetch-channel-videos` edge function with `{ min_videos: 0, max_videos: 0, limit: 50 }` to target channels with 0 fetched videos.
- Show a loading spinner/toast while running, and refresh channels on completion.

### 2. Update edge function to also fetch channel statistics (total video count)
**File: `supabase/functions/fetch-channel-videos/index.ts`**
- After the search API call for each channel, use the YouTube Channels API (`part=statistics`) to get the channel's actual total upload count.
- Store this in a new column or return it so the frontend can display it.
- Actually, a simpler approach: use the YouTube `search` endpoint's `totalResults` from the response (already returned in `pageInfo.totalResults`) to know how many videos the channel has in total on YouTube.
- Save this value to a new `youtube_total_videos` column on the `channels` table.

### 3. Add `youtube_total_videos` column to channels table
**Migration:**
```sql
ALTER TABLE public.channels ADD COLUMN youtube_total_videos integer DEFAULT NULL;
```

### 4. Update Videos column display in Channels table
**File: `src/pages/Channels.tsx`**
- Change the Videos column (line 282) from just showing `total_videos_fetched` to:
  - If `youtube_total_videos` exists and `total_videos_fetched >= youtube_total_videos`: show `"{total_videos_fetched}-Till date"`
  - If `youtube_total_videos` exists and `total_videos_fetched < youtube_total_videos`: show just `total_videos_fetched`
  - If `youtube_total_videos` is null: show just `total_videos_fetched`

### 5. Update useChannels hook
**File: `src/hooks/useChannels.ts`**
- Add `youtube_total_videos` to the Channel interface.
- The existing `select("*")` already fetches all columns, so no query change needed.

## Technical details

- The `fetch-channel-videos` edge function already accepts `min_videos` / `max_videos` params, so calling it with `{ min_videos: 0, max_videos: 0 }` will target channels with exactly 0 fetched videos.
- The YouTube Search API response includes `pageInfo.totalResults` which gives the approximate total video count for the channel. We'll capture this and save it to the new column.
- The edge function's `processChannel` will be updated to return this count and upsert it into the channels table.
- The frontend button will use the same batching pattern (manual fetch with auth headers) as other edge function calls in the project.

