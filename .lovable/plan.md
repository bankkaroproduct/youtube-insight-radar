

# Fix Instagram Profiles Layout + Re-scrape Existing Profiles

## Problem
1. The table columns are cramped — Username column isn't visible in the screenshot, Bio text bleeds into Followers area, and several columns (Following, Posts, Category) take space but the important new columns (Avg Likes, Avg Comments, Affiliate Score) show dashes
2. Existing profiles were scraped before the post-scraping + AI analysis was added, so they all show "—" for avg likes, avg comments, affiliate score, bio links, storefront, and recent posts

## Changes

### 1. Fix table layout in `src/pages/InstagramProfiles.tsx`
- Add `min-w-[1400px]` to the Table to prevent column squishing on smaller viewports
- Add explicit `min-w-` and `max-w-` constraints to columns:
  - Username: `min-w-[140px]` — show @handle + full name
  - Channel: `min-w-[100px]` — truncate long names
  - Bio: `min-w-[180px] max-w-[220px]` — proper ExpandableText containment
  - Followers: `min-w-[90px]` right-aligned
  - Following + Posts: keep as sortable headers but remove from default view to save space (move to CSV only), OR combine into a compact format
  - Avg Likes / Avg Comments: `min-w-[80px]` each
  - Affiliate: `min-w-[120px]` — badge + short reasoning
  - Bio Links: `min-w-[140px]` — truncated link hostnames
  - Storefront: `min-w-[100px]`
  - Recent Posts: `min-w-[100px]` — expandable
  - Email: `min-w-[100px]`
  - Scraped: `min-w-[90px]`
- Remove the Following and Posts columns from the table (keep in CSV) to reduce clutter since avg engagement metrics are more useful
- Add `whitespace-nowrap` to numeric cells
- Fix Bio column with proper `overflow-hidden` and `text-ellipsis`

### 2. Add "Re-scrape All" functionality to `supabase/functions/scrape-instagram-profiles/index.ts`
- Accept a new optional body parameter: `force: true`
- When `force` is true, skip the 7-day recency filter — scrape ALL profiles regardless of when they were last scraped
- This allows the "Scrape Now" button to re-scrape existing profiles that are missing post data

### 3. Update `src/pages/InstagramProfiles.tsx` Scrape Now button
- Pass `{ force: true }` in the body when calling scrape-instagram-profiles
- This ensures clicking "Scrape Now" will re-scrape all existing profiles to populate the new columns (posts, avg likes, avg comments, affiliate score, bio links, storefront)

## Technical Details
- The edge function already works correctly for new scrapes — it fetches 20 posts, computes averages, detects storefronts, and runs AI analysis. The issue is purely that existing profiles were scraped before this logic existed.
- Adding `force: true` bypasses the `recentlyScraped` filter so all profiles get re-processed.
- The table layout fix uses CSS min-width constraints on a horizontally scrollable table to prevent column overlap.

