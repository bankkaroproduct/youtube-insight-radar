

# Fix Platform/Retailer Display in Videos Page

## Root Cause

`useVideos.ts` fetches `video_links` and then looks up `affiliate_platform_id` and `retailer_pattern_id` in the `affiliate_patterns` table to get names. It uses those names as `platform_name` and `retailer_name`. Problem: the pattern lookup doesn't respect the type — it just gets the name from whichever pattern ID is stored. If Wishlink's pattern record exists but the IDs are mapped incorrectly (or the same pattern appears as both platform and retailer in the lookup), names end up in the wrong column.

The `video_links` table already has text columns `affiliate_platform` and `resolved_retailer` that are correctly populated by the edge function. The hook should use those directly.

## Changes

### `src/hooks/useVideos.ts`
- Remove the `affiliate_patterns` lookup entirely (no need to fetch pattern names separately)
- Use the `affiliate_platform` and `resolved_retailer` text columns directly from `video_links` data
- Map `platform_name` → `link.affiliate_platform` and `retailer_name` → `link.resolved_retailer`
- This eliminates the pattern ID → name indirection that causes misattribution

### `src/pages/Videos.tsx`
- No changes needed — it already reads `platform_name` and `retailer_name` from the link objects

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Use text columns from video_links instead of pattern ID lookups |

