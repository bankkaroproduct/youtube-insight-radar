

# Fix Retailer Visibility + Domain Deduplication

## Problems Identified

### 1. Retailer not visible after adding
The `addPattern` function in `useAffiliatePatterns.ts` uses `insert`, but the unique index on `affiliate_patterns(pattern)` causes a conflict error if the pattern was previously auto-discovered. The error toast shows briefly but the pattern doesn't appear. **Fix**: Change `insert` to `upsert` so adding a pattern that already exists (e.g. from auto-discovery) updates it instead of failing.

### 2. Hardcoded domain maps ignore user-added patterns
`process-video-links` uses hardcoded `AFFILIATE_SHORT_DOMAINS` and `RETAILER_DOMAINS` maps. When users add new retailers/platforms via bulk upload, those are only in the DB — the edge function doesn't use them for populating `affiliate_platform` and `resolved_retailer` text columns. **Fix**: After fetching patterns from DB, build the lookup maps dynamically from `affiliate_patterns` table entries, merging with the hardcoded defaults.

### 3. Multiple domains → same name deduplication
When `amazon.in` and `amazon.com` both have name "Amazon", the `compute-channel-stats` function groups by pattern ID, not by name. Two separate patterns with the same name would be counted separately. **Fix**: In `compute-channel-stats`, use the text columns (`affiliate_platform`, `resolved_retailer`) from `video_links` directly instead of joining to pattern IDs. This naturally deduplicates because both `amazon.in` and `amazon.com` resolve to "Amazon".

## Changes

### 1. `src/hooks/useAffiliatePatterns.ts` — Fix addPattern
Change `insert` to `upsert` with `onConflict: "pattern"`. When the user adds a pattern that already exists (auto-discovered or duplicate domain), it updates the name/classification/type instead of failing silently.

### 2. `supabase/functions/process-video-links/index.ts` — Dynamic lookup maps
After fetching `affiliate_patterns` from DB, build `AFFILIATE_SHORT_DOMAINS` and `RETAILER_DOMAINS` maps dynamically:
- For each confirmed pattern with `type = "affiliate_platform"`, add `pattern → name` to affiliate map
- For each confirmed pattern with `type = "retailer"`, add `pattern → name` to retailer map
- Merge with hardcoded defaults (DB values take priority)

This means user-added patterns via bulk upload are immediately used for text column population.

### 3. `supabase/functions/compute-channel-stats/index.ts` — Use text columns
Change the `select` to include `affiliate_platform, resolved_retailer, link_type` from `video_links`. Group by these text fields instead of looking up pattern IDs → names. This naturally handles deduplication (amazon.in + amazon.com both set `resolved_retailer = "Amazon"`).

Also compute `retailer_via_affiliate_counts` and `retailer_direct_counts` using `link_type`:
- `retailer_via_affiliate_counts`: count videos where `link_type = "both"` grouped by `resolved_retailer`
- `retailer_direct_counts`: count videos where `link_type = "retailer"` grouped by `resolved_retailer`

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAffiliatePatterns.ts` | `insert` → `upsert` with `onConflict: "pattern"` |
| `process-video-links/index.ts` | Build lookup maps from DB patterns + hardcoded defaults |
| `compute-channel-stats/index.ts` | Use text columns for grouping, compute via/direct splits |

