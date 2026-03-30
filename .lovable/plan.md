

# Fix Link Processing, Channel Stats & Affiliate Display

## Root Causes Identified

1. **Wishlink links not tracked**: `process-video-links` processes only **50 links per call** and is triggered only once. If a video has many links, some remain unprocessed. Need to loop until all are done.

2. **Only 17 videos**: YouTube Search API can return fewer than `maxResults` depending on query relevance. Increasing `maxResults` to 50 (the API max) will help. Also, the `videos.list` detail call may return fewer items if some videoIds are invalid.

3. **Channel Videos column = 0**: `compute-channel-stats` is never auto-triggered. The fetch pipeline calls `process-video-links` but nobody calls `compute-channel-stats` afterward. Need to chain it.

4. **Affiliate tags missing on channels**: Same cause -- `compute-channel-stats` (which sets `affiliate_status` and `affiliate_names`) is never triggered automatically.

5. **Affiliate names in Videos**: Currently only shows names for links with a `matched_pattern_id`. Should show the affiliate/domain name for ALL classified links (OWN, COMPETITOR, and NEUTRAL with matched patterns).

## Plan

### 1. Fix `process-fetch-queue` edge function
- Increase `maxResults` from `"30"` to `"50"` (YouTube API max)
- After calling `process-video-links`, also auto-trigger `compute-channel-stats` so channel video counts, median stats, and affiliate status are populated immediately

### 2. Fix `process-video-links` edge function
- Add a loop: keep processing batches of 50 until no more unprocessed links remain (with a safety cap of 500 total)
- After all links processed, auto-trigger `compute-channel-stats` for affected channels
- This ensures ALL links (including wishlink.com) get unshortened and classified

### 3. Update `compute-channel-stats` edge function
- Include ALL affiliate names (OWN + COMPETITOR) in `affiliate_names`, not just competitors
- This way channels show which affiliates they work with regardless of classification

### 4. Update Videos page affiliate display
- Show affiliate name tags with color-coded badges: green for OWN, red for COMPETITOR, gray for NEUTRAL
- Currently hardcodes red for all affiliates

### 5. Update Channels page
- Show affiliate status as human-readable tags: "With Us", "Competitor", "Mixed", "Neutral" instead of raw enum values
- Show affiliate_names as individual colored tags

## Files to modify
1. `supabase/functions/process-fetch-queue/index.ts` -- maxResults=50, auto-trigger compute-channel-stats
2. `supabase/functions/process-video-links/index.ts` -- loop processing, trigger compute-channel-stats
3. `supabase/functions/compute-channel-stats/index.ts` -- include all affiliate names
4. `src/pages/Videos.tsx` -- color-coded affiliate tags
5. `src/pages/Channels.tsx` -- human-readable status labels

