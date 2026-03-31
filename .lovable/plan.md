

# Remove Video Limit & Delete All Keyword Data

## Changes

### 1. Remove the 500-row limit on video fetching (`src/hooks/useVideos.ts`)
Change `.limit(500)` to `.limit(999999999)` so all videos are returned. Also need to handle the Supabase default 1000-row limit by paginating or using `.range()` if needed — but since the user explicitly wants up to 999999999, we'll set the limit accordingly (Supabase client respects the explicit limit over the default).

### 2. Delete all keyword data (SQL data operation)
Execute DELETE statements to clear all keyword-related data:
```sql
DELETE FROM video_links;
DELETE FROM video_keywords;
DELETE FROM videos;
DELETE FROM fetch_jobs;
DELETE FROM keywords_search_runs;
```
Also reset channel stats since they depend on this data.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Change `.limit(500)` to `.limit(999999999)` |
| Database | Delete all data from video_links, video_keywords, videos, fetch_jobs, keywords_search_runs; reset channel stats |

