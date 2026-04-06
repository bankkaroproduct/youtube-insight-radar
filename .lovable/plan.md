

# Enhanced AI Analysis for Private/No-Post Accounts

## Problem
Currently, profiles with no accessible posts (private accounts) show "—" for affiliate score because the AI analysis relies heavily on post captions. Private accounts still have a public bio that often contains collaboration signals like "DM for collab", "Open for partnerships", "Brand inquiries", etc.

## Changes

### 1. Update AI prompt in `supabase/functions/scrape-instagram-profiles/index.ts`

Enhance the `analyzeAffiliatePotential` function to:
- Detect private accounts (Apify returns `isPrivate` field) and adjust analysis accordingly
- When no posts are available, focus analysis entirely on bio content, bio links, storefront presence, and follower count
- Add explicit detection of collaboration signals in bio: "DM for collab", "collab", "brand inquiries", "business inquiries", "PR", "partnerships", "paid promotions", "for collabs DM", "open to work", "brand ambassador", "sponsored", "PR packages", etc.
- Pass `isPrivate` and `followerCount` to the AI prompt so it can reason about private accounts with high followers being likely affiliates
- Update the prompt to instruct the AI: "If the account is private, focus on bio signals. Look for collaboration keywords like DM for collab, brand inquiries, partnerships, etc. A private account with collab signals and high followers can still be rated Good."

### 2. Store `is_private` field

- Add `is_private boolean` column to `instagram_profiles` table via migration
- Populate from Apify's `isPrivate` field during scraping
- Display a lock icon next to username on the frontend when `is_private` is true

### 3. Update frontend `src/pages/InstagramProfiles.tsx`

- Show a small lock icon (🔒) next to username for private accounts
- When affiliate score exists but no posts, the reasoning column explains it was bio-based analysis

## Technical Details

The key change is in the AI prompt — adding a section like:

```
Account Privacy: ${isPrivate ? "PRIVATE (no posts visible)" : "Public"}
Follower Count: ${followerCount}

IMPORTANT: If the account is private, analyze based on bio and links only.
Look for collaboration signals: "DM for collab", "business inquiries", 
"brand partnerships", "PR", "paid promotions", "open for collabs", 
"brand ambassador", "sponsored content", etc.
A private account with collaboration signals and decent followers 
can still be rated Good or Average for affiliate potential.
```

The Apify scraper already returns `isPrivate` — we just need to use it and pass it through.

