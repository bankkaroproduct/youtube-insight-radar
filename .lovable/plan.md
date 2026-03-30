

# Fix Classification, Add Stats Cards, Auto-Discover Patterns

## Issues Identified

1. **Wishlink links show as NEUTRAL**: The `process-video-links` function correctly auto-discovers new domains and inserts them as unconfirmed patterns. However, it only classifies links against `is_confirmed: true` patterns. Since wishlink domains are auto-discovered as unconfirmed/NEUTRAL, they stay NEUTRAL. The fix: also match against all patterns (confirmed or not) when classifying, so once you confirm "wishlink.com" as COMPETITOR in the Discovered tab, re-processing will classify them correctly.

2. **Keyword Table shows 0 videos/links**: The `get_keyword_stats` DB function still uses `videos.keyword_id` (single FK) instead of the new `video_keywords` junction table. Needs a migration update.

3. **No stats cards on Videos and Channels pages**: Need summary cards like the Keyword Table has.

4. **Discovered patterns already work** but the auto-discovery in `process-video-links` should also discover `wishlink.com` / `www.wishlink.com` even without tracking params — any domain appearing frequently across videos could be an affiliate.

## Plan

### 1. Update `get_keyword_stats` DB function
Use `video_keywords` junction table instead of `videos.keyword_id`:
```sql
CREATE OR REPLACE FUNCTION public.get_keyword_stats()
  -- join video_keywords instead of videos.keyword_id
```

### 2. Fix `process-video-links` — better auto-discovery
**File: `supabase/functions/process-video-links/index.ts`**
- Auto-discover ANY new domain that appears in video descriptions (not just those with tracking params or shortened URLs). This ensures wishlink.com, etc. show up in the Discovered tab.
- When classifying, match against ALL patterns (not just confirmed) — unconfirmed patterns stay NEUTRAL classification but at least get a `matched_pattern_id` so the affiliate name shows.

### 3. Add stats cards to Videos page
**File: `src/pages/Videos.tsx`**
- Total Videos, Total Links, Unique Channels, Classified Links (OWN/COMPETITOR/NEUTRAL counts)

### 4. Add stats cards to Channels page
**File: `src/pages/Channels.tsx`**
- Total Channels, With Us, Competitor, Neutral, Mixed counts

### 5. Wire up Keyword Table stats
**File: `src/pages/KeywordTable.tsx`**
- Call `get_keyword_stats` RPC to populate Videos and Links columns (currently hardcoded to 0)

## Files to modify
1. **DB migration** — update `get_keyword_stats` function to use `video_keywords`
2. `supabase/functions/process-video-links/index.ts` — broader auto-discovery
3. `src/pages/Videos.tsx` — add stats cards
4. `src/pages/Channels.tsx` — add stats cards
5. `src/pages/KeywordTable.tsx` — fetch real video/link counts

