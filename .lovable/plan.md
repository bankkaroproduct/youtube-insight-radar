

# Add Keyword Tags, Published Date, Link Tags & Deduplicate Videos Across Keywords

## Problem
1. Videos currently store only one `keyword_id` — if the same video appears for a second keyword, the upsert overwrites the keyword reference instead of tracking both.
2. The Videos table doesn't show which keyword(s) a video was fetched for.
3. Links column shows just a count number instead of individual link tags.
4. Channels similarly don't track which keywords they were discovered through.

## Plan

### 1. DB Migration — Create `video_keywords` junction table
Create a many-to-many table linking videos to keywords:
```sql
CREATE TABLE public.video_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  keyword_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(video_id, keyword_id)
);
ALTER TABLE public.video_keywords ENABLE ROW LEVEL SECURITY;
-- Read for authenticated, manage for admins
```
This replaces the single `keyword_id` on `videos` for tracking purposes.

### 2. Update `process-fetch-queue` edge function
- After upserting a video, insert into `video_keywords(video_id, keyword_id)` with `ON CONFLICT DO NOTHING` so re-fetching a keyword doesn't create duplicates — the same video just gets an additional keyword tag.
- For `video_links`, also use upsert with `ON CONFLICT (video_id, original_url) DO NOTHING` to avoid duplicate link rows.
- Add a unique constraint on `video_links(video_id, original_url)` via migration.

### 3. Update `useVideos` hook
- Fetch from `video_keywords` joined with `keywords_search_runs` to get keyword names for each video.
- Add `keywords: { id, keyword }[]` to the `Video` interface.

### 4. Update Videos page UI
- **Keyword tags**: Show keyword names as badges/tags on each video row.
- **Links column**: Instead of just a count, show link domains/URLs as small tags (truncated). Keep count as a badge too.
- **Published date**: Already shown — confirm it's displaying correctly.

### 5. Channel deduplication
Channels already use `upsert` on `channel_id` so no duplicate channels are created. No change needed there.

## Files to modify
1. **DB migration** — `video_keywords` table + unique constraint on `video_links(video_id, original_url)`
2. `supabase/functions/process-fetch-queue/index.ts` — insert into `video_keywords`, upsert links
3. `src/hooks/useVideos.ts` — fetch keyword names via `video_keywords`
4. `src/pages/Videos.tsx` — show keyword tags, link tags in main row

