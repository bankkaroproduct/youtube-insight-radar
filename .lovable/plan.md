

# Fix Stats, Add Rank, YouTube Category, Filters & Sorting

## Issues & Root Causes

1. **Wishlink not red (89 links)**: 156 wishlink links correctly have `matched_pattern_id` and show COMPETITOR. But 89 links were processed *before* the wishlink pattern existed -- they have `domain = 'wishlink.com'` but `matched_pattern_id = NULL`. The re-classification step only updates links that already HAVE a `matched_pattern_id`. Need to also match unmatched links against existing patterns by domain.

2. **Channel stats showing 0**: 7 channels have `total_videos_fetched = 0` despite having actual videos. `compute-channel-stats` either wasn't triggered or failed for these channels. The function itself is correct -- it just needs to run. Will also fix by making it auto-run more reliably.

3. **YouTube rank**: Not currently tracked. Need to store the search result position (index in YouTube search results) per video per keyword. Requires a new `search_rank` column on `video_keywords`.

4. **YouTube channel category**: Need to extract `topicDetails.topicCategories` from the YouTube Channels API (already called in `fetchChannelDetails`). Requires a new `youtube_category` column on `channels`.

5. **Long text**: Inline expand ("Show more" / "Show less") for descriptions and titles instead of tooltips.

6. **Filters & sorting**: Hybrid filter row under headers + clickable sortable column headers with arrow indicators on all three tables (Videos, Channels, Keyword Table).

## Plan

### 1. DB Migration
- Add `search_rank integer` column to `video_keywords`
- Add `youtube_category text` column to `channels`

### 2. Fix `process-video-links` -- match unmatched links
Add a new step after re-classification that finds links where `matched_pattern_id IS NULL` AND `domain` matches a known pattern, then updates them with the correct `matched_pattern_id` and `classification`.

```text
Step flow:
1. Process new links (existing)
2. Re-classify stale links (existing) 
3. NEW: Match previously-unmatched links by domain against all patterns
```

### 3. Fix `process-fetch-queue` -- store search rank + fetch 3 pages + channel category
- Store search result index as `search_rank` in `video_keywords` upsert
- Implement pagination: use `nextPageToken` to fetch up to 3 pages (~150 results)
- Extract `topicDetails.topicCategories` from channel details response and store as `youtube_category`

### 4. Fix `compute-channel-stats` -- make idempotent
No code change needed -- the function is correct. The issue is it wasn't triggered. Will fix by ensuring process-video-links calls it for ALL channels, not just affected ones.

### 5. Update Videos page (`src/pages/Videos.tsx`)
- Add `Rank` column showing best search rank across keywords
- Add inline "Show more" for long titles/descriptions (2-line truncation + expand)
- Add filter row under each column header (text inputs for title/channel, select for classification)
- Add clickable sort on Views, Likes, Rank, Published columns with arrow indicators
- Color-coded affiliate badges already work for matched links; will fix data issue at function level

### 6. Update Channels page (`src/pages/Channels.tsx`)
- Add `Category` column for YouTube category
- Replace tooltip description with inline "Show more" expand
- Add filter row under headers (text for name, select for status, range for subscribers)
- Add clickable sort on all numeric columns + name
- Fix affiliate name display to use correct classification colors

### 7. Update Keyword Table (`src/pages/KeywordTable.tsx`)
- Add sort on all column headers
- Add filter inputs for Business Aim, Videos, Links, Last Run columns (currently missing)

### 8. Create reusable components
- `SortableHeader` component: clickable header with ascending/descending/none arrow
- `ExpandableText` component: inline show more/less for long text
- `ColumnFilter` component: text input or select dropdown for column filtering

## Files to modify
1. **DB migration** -- add `search_rank` to `video_keywords`, `youtube_category` to `channels`
2. `supabase/functions/process-video-links/index.ts` -- match unmatched links by domain
3. `supabase/functions/process-fetch-queue/index.ts` -- 3-page pagination, search_rank, channel category
4. `src/pages/Videos.tsx` -- rank column, filters, sorting, inline expand
5. `src/pages/Channels.tsx` -- category column, filters, sorting, inline expand
6. `src/pages/KeywordTable.tsx` -- complete filter row, sorting
7. `src/hooks/useVideos.ts` -- include search_rank from video_keywords
8. `src/hooks/useChannels.ts` -- include youtube_category
9. `src/components/ui/SortableHeader.tsx` -- reusable sort header
10. `src/components/ui/ExpandableText.tsx` -- reusable show more/less

