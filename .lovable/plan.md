

# Reset All Links & Add Batch Processing Tab

## What We'll Do

1. **Reset all 32,115 links** to unprocessed state via a database migration (clearing `unshortened_url`, `domain`, `original_domain`, `classification`, `matched_pattern_id`, `affiliate_platform_id`, `retailer_pattern_id`, `is_shortened`, `link_type`, `affiliate_platform`, `affiliate_domain`, `resolved_retailer`, `resolved_retailer_domain`).

2. **Add a "Link Processing" tab** to the Links page (`src/pages/Links.tsx`) with:
   - Stats showing: total links, processed, unprocessed, with platform, with retailer
   - A "Process Next 100" button that calls the `process-video-links` edge function
   - Live progress display showing how many were processed and how many remain
   - A "Reset All Links" button (with confirmation) for future resets

## Technical Details

### Database Update (via insert tool)
```sql
UPDATE video_links SET
  unshortened_url = NULL,
  domain = NULL,
  original_domain = NULL,
  classification = 'NEUTRAL',
  matched_pattern_id = NULL,
  affiliate_platform_id = NULL,
  retailer_pattern_id = NULL,
  is_shortened = NULL,
  link_type = NULL,
  affiliate_platform = NULL,
  affiliate_domain = NULL,
  resolved_retailer = NULL,
  resolved_retailer_domain = NULL;
```

### Edge Function Change (`supabase/functions/process-video-links/index.ts`)
- Accept optional `batch_size` param from request body (default 500, max 500)
- When called with `{ "batch_size": 100 }`, process only 100 links and do NOT self-re-trigger
- This gives the user manual control from the UI

### Frontend (`src/pages/Links.tsx`)
- Add 4th tab "Processing" with:
  - Count cards: Total / Processed / Unprocessed / With Platform / With Retailer
  - "Process Next 100" button that invokes the edge function with `batch_size: 100`
  - Shows result after each batch (processed count, remaining count)
  - "Reset All Links" button with AlertDialog confirmation
  - Auto-refreshes counts after each batch

| File | Change |
|------|--------|
| Database | Reset all video_links to unprocessed |
| `supabase/functions/process-video-links/index.ts` | Add `batch_size` param, skip self-re-trigger when manual |
| `src/pages/Links.tsx` | Add "Processing" tab with batch button and stats |

