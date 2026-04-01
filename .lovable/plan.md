

# Delete All Keyword Data & Discovered Patterns

## What will be deleted

1. **Keyword-related data** (same as previous reset):
   - `video_links` — all rows
   - `video_keywords` — all rows
   - `videos` — all rows
   - `fetch_jobs` — all rows
   - `keywords_search_runs` — all rows

2. **Discovered patterns** (auto-discovered, unconfirmed):
   - `affiliate_patterns` where `is_auto_discovered = true` and `is_confirmed = false`

3. **Channel stats reset**:
   - Reset `total_videos_fetched` to 0 and JSONB count fields to `'{}'` on the `channels` table

## Technical Details

All operations use the database insert tool (DELETE/UPDATE statements). Manually confirmed patterns are preserved.

