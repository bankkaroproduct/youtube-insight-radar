

# Remove Manual Buttons, Add Instagram + Country to Channels

## Summary

1. Remove "Check Relevance" manual button from Channels page — relevance is already auto-triggered in the fetch pipeline
2. Add `instagram_url` and `country` columns to `channels` table
3. Extract Instagram links from channel description during fetch
4. Extract country from YouTube channel API during fetch
5. Display Instagram link + Country in Channels UI

## Plan

### 1. DB Migration
Add two new columns to `channels`:
- `instagram_url` (text, nullable) — extracted Instagram link
- `country` (text, nullable) — channel country from YouTube API

### 2. Update `fetchChannelDetails` in `process-fetch-queue/index.ts`
- Extract Instagram URL from description using regex (`instagram.com/...`)
- Extract country from `snippet.country` (YouTube API already returns this in the `snippet` part which is already requested)
- Store both in the `channels` update

### 3. Update Channels page (`src/pages/Channels.tsx`)
- Remove the "Check Relevance" button (line 84-86)
- Add Instagram link next to email in Contact column (show Instagram icon + link when available)
- Add Country column with sortable header and filter

### 4. Update `src/hooks/useChannels.ts`
- Add `instagram_url` and `country` to Channel interface

## Files to modify
1. **DB migration** — add `instagram_url`, `country` to `channels`
2. `supabase/functions/process-fetch-queue/index.ts` — extract Instagram URL + country in `fetchChannelDetails`
3. `src/pages/Channels.tsx` — remove Check Relevance button, add Instagram + Country display
4. `src/hooks/useChannels.ts` — update interface

