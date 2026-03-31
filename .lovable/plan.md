

# Fix URL Unshortening + Remove competitor_names + Correct Platform/Retailer Flow

## Problems

### 1. URL unshortening not happening
The screenshot shows `original_url` = `unshortened_url` for wishlink.com, haulpack.com, meesho.com URLs. Root cause: the edge function only unshortens URLs whose domain is in `KNOWN_SHORTENERS` (bit.ly, wsli.nk, etc.). URLs like `www.wishlink.com/share/xyz` or `share.haulpack.com/abc` are NOT short URLs in the traditional sense — they're **affiliate platform redirect URLs** that resolve to retailer destinations. The function treats them as normal links and copies `original_url` → `finalUrl` without following redirects.

**Fix**: After building dynamic lookup maps from `affiliate_patterns`, treat any URL whose domain matches a known **affiliate platform pattern** as needing unshortening (redirect following). Add these domains to the shortener detection logic dynamically.

### 2. Platform = original URL, Retailer = unshortened URL
The correct flow:
- **Platform** is identified from the `original_url` domain (e.g., `wishlink.com` → Wishlink, `share.haulpack.com` → Haulpack)
- **Retailer** is identified from the `unshortened_url` domain after resolving redirects (e.g., `amazon.in` → Amazon, `meesho.com` → Meesho)
- If a domain doesn't match any platform or retailer → goes to **Discovered** with auto-detected type (`affiliate_platform` if it was the original domain of a shortened link, `retailer` if it was the destination)

Currently the logic partially does this but fails because unshortening doesn't happen for affiliate platform URLs.

### 3. Delete `competitor_names` table
The `competitor_names` table is redundant — the `name` field in `affiliate_patterns` already serves the same purpose. The NameDropdown in Links.tsx should instead pull unique names from the existing `affiliate_patterns` table.

## Changes

### 1. Migration — Drop `competitor_names` table
```sql
DROP TABLE IF EXISTS public.competitor_names;
```

### 2. `supabase/functions/process-video-links/index.ts` — Fix unshortening logic
- After building dynamic affiliate platform maps from DB, collect all affiliate platform domains (both hardcoded and from DB)
- Change the shortener detection: a URL needs unshortening if its domain is in `KNOWN_SHORTENERS` **OR** matches any known affiliate platform pattern
- This ensures `wishlink.com/share/xyz` gets resolved via redirect following to find the actual retailer destination
- Platform is always identified from `original_domain`, retailer from `unshortened_domain` (the resolved URL)

### 3. `src/pages/Links.tsx` — Remove competitor_names dependency
- Remove `useCompetitorNames` import and usage
- Replace `NameDropdown` with a simple `Input` for name entry, or derive unique names from existing `affiliate_patterns` data
- The `DiscoveredNamePicker` can use unique names extracted from `confirmedPatterns` instead

### 4. Delete `src/hooks/useCompetitorNames.ts`
No longer needed.

### Files Changed

| File | Change |
|------|--------|
| Migration SQL | `DROP TABLE competitor_names` |
| `process-video-links/index.ts` | Unshorten affiliate platform URLs (wishlink, haulpack, etc.), not just generic shorteners |
| `src/pages/Links.tsx` | Remove competitor_names usage, use names from affiliate_patterns |
| `src/hooks/useCompetitorNames.ts` | Delete file |
| `src/hooks/useAffiliatePatterns.ts` | Add `uniqueNames` derived from confirmed patterns |

