

# Fix: Wishlink Not Showing Red Tag

## Root Cause

When `process-video-links` runs, it processes links with `unshortened_url IS NULL`. Once processed, links get `classification: "NEUTRAL"` because `wishlink.com` was auto-discovered as unconfirmed. **Even after you confirm Wishlink as COMPETITOR in the Affiliates tab, the existing `video_links` rows are never re-classified** — they keep their stale `NEUTRAL` classification.

## Fix

### 1. Add re-classification step to `process-video-links`
**File: `supabase/functions/process-video-links/index.ts`**

After processing new links, add a second pass that re-classifies ALL already-processed links whose `matched_pattern_id` points to a now-confirmed pattern but whose `classification` doesn't match:

```sql
-- Pseudocode: For each confirmed pattern, update video_links 
-- where matched_pattern_id = pattern.id AND classification != pattern.classification
```

This ensures that when you confirm "wishlink.com" as COMPETITOR, the next time `process-video-links` runs, all Wishlink links get reclassified to COMPETITOR (red tag).

### 2. Also re-trigger `compute-channel-stats` after reclassification
So channel affiliate statuses update too.

## Files to modify
1. `supabase/functions/process-video-links/index.ts` — add bulk reclassification of already-processed links based on confirmed patterns

