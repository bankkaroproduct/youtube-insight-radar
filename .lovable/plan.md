

# Clear Videos & Channels Data for Fresh Testing

## What will be deleted

| Table | Records | Action |
|-------|---------|--------|
| video_links | 331 | DELETE ALL |
| video_keywords | 17 | DELETE ALL |
| videos | 17 | DELETE ALL |
| channels | 15 | DELETE ALL |
| fetch_jobs | 1 | DELETE ALL |

Keywords will be preserved.

## Execution order (respecting dependencies)

1. `DELETE FROM video_links;`
2. `DELETE FROM video_keywords;`
3. `DELETE FROM videos;`
4. `DELETE FROM channels;`
5. `DELETE FROM fetch_jobs;`

Also reset keyword statuses back to pending:
6. `UPDATE keywords_search_runs SET status = 'pending', priority = NULL, last_priority_fetch_at = NULL;`

This resets keywords so the full pipeline (fetch → analyze priority → analyze relevance) can be tested end-to-end.

