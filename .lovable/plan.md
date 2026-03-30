

# Fix Link Classification & Show Affiliate Names in Videos Table

## Root Causes

1. **Links show as NEUTRAL**: The `process-video-links` edge function (which classifies links against affiliate patterns) is never called automatically after videos are fetched. It only runs when manually triggered from the Affiliates page. So all links stay unclassified.

2. **No affiliate name shown**: The Videos UI doesn't fetch or display the affiliate pattern name — it only shows the classification badge (OWN/COMPETITOR/NEUTRAL) without the pattern's `name` field (e.g., "Wishlink").

3. **Missing columns in the video table row**: The main table row doesn't show description or affiliate names inline.

## Plan

### 1. Auto-trigger `process-video-links` after fetch completes
**File: `supabase/functions/process-fetch-queue/index.ts`**
- After all jobs are processed and channel details fetched, invoke `process-video-links` to classify the newly extracted links against affiliate patterns

### 2. Fetch affiliate pattern names with video links
**File: `src/hooks/useVideos.ts`**
- When fetching `video_links`, also fetch the matched `affiliate_patterns` name via a second query or by joining
- Add `affiliate_name` field to the `VideoLink` interface

### 3. Show affiliate name next to classification badge
**File: `src/pages/Videos.tsx`**
- In the expanded detail row, show the affiliate/pattern name next to the classification badge (e.g., "COMPETITOR — Wishlink")
- In the main table row, add a column showing unique affiliate names found across that video's links (comma-separated or as badges)
- Ensure the table columns are: Thumb, Title, Channel, Views, Likes, Links count, Affiliates (names), Published, YouTube link

### 4. Show description snippet in main row
**File: `src/pages/Videos.tsx`**
- Add a truncated description preview below the title in the main table row (or as a subtitle)

## Files to modify
1. `supabase/functions/process-fetch-queue/index.ts` — call `process-video-links` after processing
2. `src/hooks/useVideos.ts` — fetch affiliate pattern names alongside video_links
3. `src/pages/Videos.tsx` — add affiliate name display, description snippet, improved columns

