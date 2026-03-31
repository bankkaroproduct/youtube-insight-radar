

# Fix: Use Text Columns for Platform/Retailer Display in Videos

## Problem

The `useVideos.ts` hook derives `platform_name` and `retailer_name` by looking up pattern IDs (`affiliate_platform_id`, `retailer_pattern_id`) in the `affiliate_patterns` table. This approach fails because:

1. **Platform ID is only set for shortened links** — when a wishlink.com URL doesn't successfully unshorten (original_url = unshortened_url), `isShortened` is `false`, so no `platformMatch` is attempted, and `affiliate_platform_id` stays `null`.
2. **The text columns already exist and are populated** — the edge function already writes `affiliate_platform` and `resolved_retailer` as text columns directly on `video_links`. These are the correct values. The hook just doesn't use them.

Additionally, the edge function only identifies a platform via `lookupAffiliatePlatform()` when `isShortened` is true (line 242). For cases where unshortening fails (common with wishlink.com), no platform or retailer is tagged even though the domain is known.

## Changes

### 1. `src/hooks/useVideos.ts` — Use text columns instead of pattern ID lookups

Remove the entire `affiliate_patterns` lookup (lines 82-99) and map `platform_name` / `retailer_name` from the text columns already on `video_links`:

- `platform_name` → `link.affiliate_platform`
- `retailer_name` → `link.resolved_retailer`
- `affiliate_name` → `link.affiliate_platform || link.resolved_retailer`

This eliminates the indirection that causes misattribution.

### 2. `supabase/functions/process-video-links/index.ts` — Always check platform from original domain

Currently line 234 calls `lookupAffiliatePlatform(originalDomain)` but line 242 only uses the result when `isShortened` is true. Fix: always check the original domain against platform patterns regardless of whether unshortening changed the URL. Also check the original domain against DB patterns for platform matching even when not shortened.

This ensures that even when unshortening fails (wishlink.com → wishlink.com), the platform is still identified from the original URL, and the retailer check happens on the unshortened URL (or skipped if same).

### 3. Edge function — Also check non-shortened retailer matches against DB patterns

When `isShortened` is false, the current code checks `lookupRetailer(originalDomain)` but doesn't populate `resolved_retailer` text column in the "non-affiliate" path properly. Fix the logic so retailer text columns are always populated when a retailer match is found, regardless of whether a platform was also detected.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Remove pattern ID lookup; use `affiliate_platform` and `resolved_retailer` text columns directly |
| `supabase/functions/process-video-links/index.ts` | Always identify platform from original domain; fix retailer tagging for non-shortened links |

