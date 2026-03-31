

# Delete All Scraped Data

## What Will Happen

Run DELETE statements (via the insert tool) against these tables in dependency order:

1. **`video_links`** — all rows (depends on videos)
2. **`video_keywords`** — all rows (depends on videos and keywords)
3. **`fetch_jobs`** — all rows (job history)
4. **`videos`** — all rows
5. **`channels`** — all rows
6. **`keywords_search_runs`** — reset status to `'pending'` on all rows (keeps keywords but marks them as unfetched)

## What Stays

- Keywords themselves remain in `keywords_search_runs` (status reset to `pending`)
- Affiliate patterns, competitor names, API keys, user accounts — untouched
- All configuration and settings preserved

## Technical Details

Six sequential DELETE/UPDATE statements executed via the data insert tool. Order matters to avoid foreign key-like integrity issues (even though no formal FKs exist, the edge functions reference these IDs).

