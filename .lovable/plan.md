

# Fix Unidentified Links — Root Cause & Solution

## Problem Analysis

Querying the database reveals:
- **21,814 total links**; **5,998 still unprocessed** (unshortened_url IS NULL)
- **5,521 processed but unmatched** (have unshortened_url but no matched_pattern_id)
- **12,492 links with link_type = 'unknown'**

The top unmatched domains fall into two categories:

**Social domains that should be NEUTRAL but weren't caught:**
instagram.com (1,071), youtu.be (946), youtube.com (635), facebook.com (468), twitter.com (356), t.me (167), whatsapp.com (91), tiktok.com (38), mobile.twitter.com (16), discord.gg (15), wa.me (25), wa.link (15)
→ ~3,800 links. These ARE in SKIP_DOMAINS but were processed in the main loop before the fast-path could catch them. They got `link_type: 'unknown'` instead of being skipped.

**Real affiliate/shortener domains not in lookup tables:**
geni.us (124), go.shopmy.us/shopmy.us (134), amzn.openinapp.co (81), fktr.in (66), amzlink.to (44), bitli.in (41), rstyle.me (20), fkrt.to (15), fkart.openinapp.co (14), howl.link (13), linktw.in (21), urlgeni.us (23), amzn.eu (17)
→ ~600+ links from affiliate platforms not in KNOWN_SHORTENERS or AFFILIATE_SHORT_DOMAINS.

## Solution — Two Changes

### 1. Edge Function Updates (`supabase/functions/process-video-links/index.ts`)

**Expand SKIP_DOMAINS** — add: `mobile.twitter.com`, `wa.link`, `x.com`

**Expand KNOWN_SHORTENERS** — add: `geni.us`, `urlgeni.us`, `bitli.in`, `fktr.in`, `fkrt.to`, `amzlink.to`, `amzn.eu`, `linktw.in`, `goo.gl` (already listed but not working because domain check differs)

**Expand AFFILIATE_SHORT_DOMAINS** (platform name mapping):
| Domain | Platform |
|--------|----------|
| `geni.us` / `urlgeni.us` | Genius Link |
| `go.shopmy.us` / `shopmy.us` | ShopMy |
| `rstyle.me` | LTK (RewardStyle) |
| `howl.link` | Howl |
| `linktw.in` | LinkTwin |
| `amzlink.to` / `amzn.eu` | Amazon Associates |
| `fktr.in` / `fkrt.to` | Flipkart Affiliate |
| `bitli.in` | Bitli |

**Expand AFFILIATE_REDIRECT_DOMAINS** — add: `openinapp.co`, `shopmy.us`, `geni.us`

**Fix main loop skip-domain handling** — In the main processing loop, after determining `originalDomain`, check SKIP_DOMAINS early and mark as NEUTRAL (same as fast-path) instead of trying to unshorten/match. This prevents social links from getting `link_type: 'unknown'`.

### 2. Database Migration — Fix already-processed social links

Run a migration to retroactively fix the ~3,800 social-domain links that were already processed with wrong classification:

```sql
UPDATE video_links 
SET link_type = 'unknown', classification = 'NEUTRAL'
WHERE original_domain IN (
  'instagram.com','youtu.be','youtube.com','facebook.com',
  'twitter.com','t.me','whatsapp.com','tiktok.com',
  'mobile.twitter.com','discord.gg','wa.me','wa.link',
  'reddit.com','linkedin.com','pinterest.com','x.com'
)
AND matched_pattern_id IS NULL;
```

After deploying the updated function, trigger `process-video-links` to:
1. Process the remaining 5,998 unprocessed links with the new shortener/platform mappings
2. Re-match the 600+ affiliate links that were previously unrecognized

| File | Change |
|------|--------|
| `supabase/functions/process-video-links/index.ts` | Add ~15 new shortener/platform domains, add skip-domain early-exit in main loop |
| Database migration | Fix ~3,800 social-domain links to NEUTRAL classification |

