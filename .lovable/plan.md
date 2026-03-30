

# Clear All Fetched Data for Fresh Testing

All tables with fetched data will be wiped clean so you can test the full flow from scratch.

## Data to delete
- **video_links**: 295 rows
- **videos**: 30 rows
- **channels**: 26 rows
- **fetch_jobs**: 1 row

## Approach
Delete in order (child tables first to avoid FK issues):
1. Delete all `video_links`
2. Delete all `videos`
3. Delete all `channels`
4. Delete all `fetch_jobs`
5. Optionally reset `keywords_search_runs` status back to "pending" so they can be re-fetched

No schema changes needed — just data deletion using the insert tool.

