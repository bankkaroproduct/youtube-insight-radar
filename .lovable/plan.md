

# Fix Platform & Retailer Tagging in Process-Video-Links

## Root Cause Analysis

Three separate bugs in `supabase/functions/process-video-links/index.ts`:

### Bug 1: Step 3 (re-match) doesn't update text columns
Lines 410-451 re-match previously-unmatched links when a user confirms a pattern. It updates `affiliate_platform_id` and `retailer_pattern_id` but **never updates** the text columns (`affiliate_platform`, `resolved_retailer`). Since `useVideos.ts` reads from text columns, re-matched links show blank platform/retailer even after confirmation.

### Bug 2: Auto-discovery misclassifies platforms as retailers
Line 289: Platform auto-discovery only runs when `isShortened` is true. If a `wishlink.com` link fails to unshorten (original == unshortened), `isShortened` is false, so it skips platform discovery. Then line 292 discovers the same domain as a **retailer** — wrong type.

### Bug 3: Affiliate redirect domains not always unshortened
`needsUnshortening()` checks `affiliatePlatformDomains` from DB, but on first encounter (before the domain is in DB), redirect domains like `wishlink.com`, `lehlah.club`, `haulpack.com` won't be unshortened. They need to be in the hardcoded list or the function should always attempt redirect-following.

## Changes

### `supabase/functions/process-video-links/index.ts`

**Fix 1 — Step 3 re-match: also update text columns**
When re-matching unmatched links (lines 419-451), look up the pattern name and populate:
- `affiliate_platform` = platform pattern's `name` (when platform match found)
- `resolved_retailer` = retailer pattern's `name` (when retailer match found)
- `link_type` = "affiliate" / "retailer" / "both"

**Fix 2 — Smarter auto-discovery type assignment**
Change auto-discovery logic (lines 289-294):
- If `originalDomain ≠ unshortenedDomain`: original → discovered as `affiliate_platform`, unshortened → discovered as `retailer`
- If `originalDomain == unshortenedDomain` (unshortening failed or not a redirect): discover as `affiliate_platform` (not retailer), since we can't determine the destination

**Fix 3 — Add known affiliate redirect domains to unshortening list**
Add `wishlink.com`, `lehlah.club`, `haulpack.com` and similar affiliate redirect domains to either `KNOWN_SHORTENERS` or a new `AFFILIATE_REDIRECT_DOMAINS` list so they always get unshortened, even before they appear in DB patterns.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/process-video-links/index.ts` | Fix all 3 bugs: update text columns in Step 3, fix auto-discovery type, add affiliate redirect domains |

