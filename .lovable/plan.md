

# Delete All Keyword-Related Data

Current data to be deleted:
- 2,384 video links
- 321 video-keyword associations  
- 239 videos
- 26 fetch jobs
- 50 keywords

## Execution Order (respecting foreign key dependencies)

Using the database insert tool, execute these DELETE statements in order:

1. `DELETE FROM video_links` — 2,384 rows
2. `DELETE FROM video_keywords` — 321 rows
3. `DELETE FROM videos` — 239 rows
4. `DELETE FROM fetch_jobs` — 26 rows
5. `DELETE FROM keywords_search_runs` — 50 rows
6. `UPDATE channels SET total_videos_fetched = 0, platform_video_counts = '{}', retailer_video_counts = '{}', retailer_via_affiliate_counts = '{}', retailer_direct_counts = '{}', affiliate_names = '{}', affiliate_platform_names = '{}', retailer_names = '{}'` — reset channel stats

No schema changes needed. All operations are data-only.

