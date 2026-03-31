

# Separate Affiliate Platforms from Retailers

## The Problem

Currently, `affiliate_patterns` mixes affiliate platforms (e.g., impact.com, linksynergy.com, awin.com) with retailers (e.g., Amazon, Flipkart, Myntra). There's no way to show market share at both levels:
- **Affiliate Platform market share**: Which affiliate networks are used across videos/channels?
- **Retailer market share**: Which retailers are being promoted?

The key insight: the **shortened URL domain** reveals the affiliate platform (e.g., `amzn.to` = Amazon Associates), while the **unshortened URL domain** reveals the retailer (e.g., `amazon.in` = Amazon).

## Changes

### 1. Database Migration — Add `type` to `affiliate_patterns`

Add a `type` column to `affiliate_patterns`:
- `'affiliate_platform'` — networks like impact.com, awin.com, shareasale.com
- `'retailer'` — actual stores like Amazon, Flipkart, Myntra

### 2. Database Migration — Extend `video_links`

Add columns to `video_links`:
- `original_domain` (text) — domain extracted from the shortened/original URL
- `affiliate_platform_id` (uuid, nullable) — matched affiliate platform pattern
- `retailer_pattern_id` (uuid, nullable) — matched retailer pattern

Keep existing `matched_pattern_id` and `domain` for backward compatibility initially.

### 3. Database Migration — Extend `channels`

Add to `channels`:
- `affiliate_platform_names` (text[], default '{}') — affiliate platforms found
- `retailer_names` (text[], default '{}') — retailers found

### 4. Update `process-video-links` Edge Function

Split the matching logic:
- Match `original_domain` (from shortened URL) against patterns of type `affiliate_platform`
- Match `domain` (from unshortened URL) against patterns of type `retailer`
- Store both matches on each link
- Auto-discover new domains: shortened URL domains as `affiliate_platform`, unshortened URL domains as `retailer`

### 5. Update `compute-channel-stats` Edge Function

Compute separate arrays: `affiliate_platform_names` and `retailer_names` per channel based on the two pattern types.

### 6. Update Links Page (`src/pages/Links.tsx`)

- Add a third tab or split the "Known Patterns" tab into two sections: "Affiliate Platforms" and "Retailers"
- When adding a pattern, allow selecting the type
- Discovered patterns show whether they're likely a platform or retailer

### 7. Update Videos Page (`src/pages/Videos.tsx`)

- Show two separate badge groups per video: "Platforms" and "Retailers"
- Add separate filters for affiliate platform and retailer
- Update stat cards: split "Own Links" / "Competitor Links" into platform vs retailer counts

### 8. Update Channels Page (`src/pages/Channels.tsx`)

- Show two columns: "Affiliate Platforms" and "Retailers" (instead of single "Affiliates")
- Add filters for each
- Update stat cards or add market share breakdown

### 9. Update Hooks

- `useAffiliatePatterns.ts` — add `type` field, split into platform/retailer lists
- `useVideos.ts` — fetch both pattern matches per link
- `useChannels.ts` — expose new `affiliate_platform_names` and `retailer_names` fields

## Summary

This gives you two-level market intelligence:
- "60% of videos use Impact.com as their affiliate platform" (platform share)
- "45% of videos promote Amazon products" (retailer share)

Both viewable at video-level and channel-level, enabling the Amazon pitch to show exactly where competitors stand at each layer.

