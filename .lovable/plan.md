The user wants to redefine Sheet 1 of the Excel export. Instead of one row per video, S1 becomes a per-keyword summary with 7 specific columns.

Let me check the current S1 implementation and the keywords data shape.

Looking at `keywords_search_runs` schema: has `keyword`, `category`, `priority`, `estimated_volume`, `last_priority_fetch_at`, `created_at`, `status`. "Search volume" maps to `estimated_volume`. "Last day of fetching" → `last_priority_fetch_at` (or fall back to most recent video `created_at` linked through `video_keywords`). "Days gap since last fetched till today" = computed.

"Total videos fetched across that keyword" = count from `video_keywords` per `keyword_id` (already available via `get_keyword_stats` RPC).

# Plan: Redefine Sheet 1 as Per-Keyword Summary

## New Sheet 1 columns (one row per keyword)


| #   | Column                | Source                                                                                    |
| --- | --------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Keyword               | `keywords_search_runs.keyword`                                                            |
| 2   | Category              | `keywords_search_runs.category`                                                           |
| 3   | Priority              | `keywords_search_runs.priority` (blank if null)                                           |
| 4   | Search Volume         | `keywords_search_runs.estimated_volume` (Find the search voloume for keyword through AI ) |
| 5   | Total Videos Fetched  | count from `video_keywords` grouped by `keyword_id`                                       |
| 6   | Last Fetch Date       | `keywords_search_runs.last_priority_fetch_at` formatted YYYY-MM-DD, or "Never"            |
| 7   | Days Since Last Fetch | `today - last_priority_fetch_at` in days, or "N/A" if never fetched                       |


## Implementation

**File: `src/services/excelExportService.ts**`

1. **Fetch additions in `fetchAllExportData()**`: already fetches `keywords_search_runs`. Add a per-keyword video count via the existing `get_keyword_stats` RPC (or aggregate from already-fetched `video_keywords`).
2. **Rewrite `buildSheet1()**`:
  - Iterate over all `keywords_search_runs` rows (not videos).
  - For each keyword, compute video count from `video_keywords` map.
  - Format `last_priority_fetch_at` → "YYYY-MM-DD" or grey-italic "Never".
  - Compute days gap: `Math.floor((Date.now() - lastFetch) / 86400000)` → number, or grey-italic "N/A".
3. **Formatting**: keep existing styles (bold grey header, frozen row 1, thin black borders, Arial 10). Apply grey-italic placeholder style to "Never" / "N/A" cells.
4. **Column widths**: Keyword 30, Category 20, Priority 12, Search Volume 18, Total Videos Fetched 22, Last Fetch Date 18, Days Since Last Fetch 22.

## Notes

- Sheets 2–6 remain unchanged.
- No DB schema changes.
- No new dependencies.