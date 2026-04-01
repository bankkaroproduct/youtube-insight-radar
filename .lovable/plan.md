

# Fix Channel Count Discrepancy & Hide Empty Channels

## Problems

1. **Channels tab shows max 1000**: Supabase default row limit caps the query at 1000. The Videos tab counts unique `channel_id` values from actual video data (339), which is correct.
2. **Channels with 0 videos showing**: After the data wipe, channel rows remain in the `channels` table with `total_videos_fetched = 0`. These empty channels clutter the view.

## Solution

### 1. Filter out channels with 0 videos (`src/hooks/useChannels.ts`)
Add `.gt("total_videos_fetched", 0)` to the query so only channels with actual videos are shown. This eliminates stale/empty channel rows and likely brings the count well under 1000.

### 2. Remove the 1000-row cap (`src/hooks/useChannels.ts`)
Add `.limit(999999999)` to the query (same pattern used in `useVideos`) to ensure all matching channels are returned regardless of count.

### 3. Add a "Show All" toggle (optional, in `src/pages/Channels.tsx`)
Add a checkbox/toggle "Include channels with 0 videos" defaulting to off, so users can still view all channels if needed.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useChannels.ts` | Add `.gt("total_videos_fetched", 0)` filter and `.limit(999999999)` |
| `src/pages/Channels.tsx` | Add toggle to optionally show empty channels |

