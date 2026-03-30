

# Fix Missing Data Across Videos, Keywords, and Channels Pages

## Issues Identified

1. **Videos page**: Title truncated, description not shown, no affiliate names, no extracted links displayed
2. **Keywords table**: Video count and link count come from `fetch_jobs` (temporary) instead of actual `videos`/`video_links` tables. The `get_keyword_stats()` RPC already exists but is unused.
3. **Channels page**: Missing channel description and contact info columns. The `channels` table itself lacks `description` and `contact_info` columns.

## Plan

### 1. Videos page — show full details (`src/pages/Videos.tsx`, `src/hooks/useVideos.ts`)
- Add an expandable row or detail panel showing: full title, description, extracted links (from `video_links` table), affiliate classification per link
- Join `video_links` data: fetch video_links with classification and matched pattern name
- Show affiliate badge (OWN/COMPETITOR/NEUTRAL) next to each link
- Remove `truncate` from title so it wraps properly

### 2. Keywords table — show real video & link counts (`src/hooks/useKeywords.ts`, `src/components/keywords/KeywordsTable.tsx`)
- Call the existing `get_keyword_stats()` RPC to get per-keyword video_count and link_count
- Display these counts in the Keywords table instead of relying on fetch_jobs data
- Remove "Business Aim" column (since we removed the field from the add dialog)

### 3. Channels page — add description & contact info (`src/pages/Channels.tsx`)
- **DB migration**: Add `description` and `contact_email` columns to `channels` table
- Update `process-fetch-queue` edge function to fetch channel details from YouTube Channels API (`part=snippet,statistics,brandingSettings`) and store description + contact email
- Display these new columns in the Channels table

### 4. Update process-fetch-queue to fetch channel details (`supabase/functions/process-fetch-queue/index.ts`)
- After upserting channels, batch-fetch channel details using YouTube Channels API
- Store `subscriber_count`, `description`, `contact_email` from the channel response

## Files to modify
1. `src/pages/Videos.tsx` — expandable rows with description, links, affiliates
2. `src/hooks/useVideos.ts` — join video_links data
3. `src/hooks/useKeywords.ts` — call `get_keyword_stats()` RPC
4. `src/components/keywords/KeywordsTable.tsx` — show real counts, remove Business Aim column
5. `src/pages/Channels.tsx` — add description and contact columns
6. **DB migration** — add `description text`, `contact_email text` to `channels` table
7. `supabase/functions/process-fetch-queue/index.ts` — fetch channel details from YouTube API

