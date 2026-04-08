

# Fix: Videos Page Filters Not Working with Server-Side Pagination

## Problem

The Videos page uses **server-side pagination** (50 per page), but applies filters **client-side** on only the current page's 50 rows. When you filter by channel "Gima_ashi", it only checks the 50 videos loaded for the current page. If none of those 50 happen to be from that channel, the table shows empty — even though matching videos exist on other pages.

## Solution

Move all filters (title, channel, keyword, classification) to the server side so the database returns only matching rows.

### Changes

**File: `src/hooks/useVideos.ts`**

1. Accept a `filters` parameter: `{ title, channel, keyword, classification }`
2. In `fetchPage`, apply filters to the Supabase query:
   - `title` → `.ilike("title", "%...%")`
   - `channel` → `.ilike("channel_name", "%...%")`
   - `keyword` → join through `video_keywords` + `keywords_search_runs` (use a subquery or fetch matching video IDs first)
   - `classification` → filter videos that have at least one link with that classification (fetch matching video IDs from `video_links`)
3. Update `fetchStats` (specifically `totalCount`) to reflect filtered count
4. Reset to page 0 whenever filters change

**File: `src/pages/Videos.tsx`**

1. Pass `filters` to `useVideos(filters)`
2. Remove the client-side `filteredAndSorted` filter logic — keep only the sort
3. Debounce filter changes (300ms) so typing doesn't spam queries
4. Add active filter badges that are clearly visible and dismissable

### Technical approach for keyword/classification filters

Since keyword and classification filters require joins across tables, the approach will be:
- For **channel** and **title**: apply directly via `.ilike()` on the `videos` query
- For **keyword**: first query `video_keywords` joined with `keywords_search_runs` to get matching `video_id`s, then use `.in("id", matchingIds)` on the videos query
- For **classification**: first query `video_links` with the classification filter to get matching `video_id`s, then use `.in("id", matchingIds)`
- The `totalCount` will come from a separate filtered count query so pagination shows correct page numbers

