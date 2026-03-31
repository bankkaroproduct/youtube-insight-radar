

# Delete All Test Data — Full Reset

Delete all data from videos, video_links, video_keywords, fetch_jobs, and keywords_search_runs tables. Also reset channel stats since they were computed from this data.

## SQL Operations (using insert/update tool, not migrations)

Execute these DELETE statements in order (respecting dependencies):

```sql
-- 1. Delete all video links
DELETE FROM video_links;

-- 2. Delete all video-keyword associations
DELETE FROM video_keywords;

-- 3. Delete all videos
DELETE FROM videos;

-- 4. Delete all fetch jobs
DELETE FROM fetch_jobs;

-- 5. Delete all keywords
DELETE FROM keywords_search_runs;

-- 6. Reset channel stats to empty (since computed from deleted data)
UPDATE channels 
SET platform_video_counts = '{}',
    retailer_video_counts = '{}',
    retailer_via_affiliate_counts = '{}',
    retailer_direct_counts = '{}',
    affiliate_platform_names = '{}',
    retailer_names = '{}',
    affiliate_names = '{}',
    total_videos_fetched = 0;
```

No schema changes needed. No code changes needed — the UI will simply show empty tables.

## Files Changed

None — this is a data-only operation using SQL DELETE/UPDATE statements.

