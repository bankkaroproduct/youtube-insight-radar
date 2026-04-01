

# Fix Link Processing Timeout

## Problem
The `process-video-links` edge function is timing out (confirmed by "connection closed before message completed" error in logs). There are 549 unprocessed links. The function tries to process up to 500 links per invocation, but URL unshortening (amzn.to, wsli.nk, etc.) takes 5-8 seconds per URL, causing the function to exceed the ~60s edge function limit.

## Root Causes
1. **Batch too large**: `MAX_TOTAL = 500` and `BATCH_SIZE = 50` — even with concurrency of 10, unshortening 50 URLs can take 40+ seconds per batch
2. **No self-re-triggering**: Unlike `process-fetch-queue`, this function doesn't chain itself for remaining unprocessed links
3. **Skip-domain links waste slots**: YouTube, Facebook, Instagram links (549 unprocessed) don't need unshortening but still occupy batch slots

## Changes

### `supabase/functions/process-video-links/index.ts`

| Change | Detail |
|--------|--------|
| Reduce `MAX_TOTAL` | From 500 → 100 to stay within timeout |
| Reduce `BATCH_SIZE` | From 50 → 25 for faster per-batch completion |
| Skip social/skip-domain links early | For links whose domain is in `SKIP_DOMAINS`, immediately set `unshortened_url = original_url` without fetching — they don't need processing |
| Add self-re-triggering | After completing a batch cycle, check if more unprocessed links remain. If yes, fire-and-forget a new invocation of itself (same pattern as `process-fetch-queue`) |

## Technical Detail

**Skip-domain optimization**: Currently YouTube, Facebook, Instagram links go through the full unshorten pipeline. These should be fast-pathed: set `unshortened_url = original_url`, `domain = original_domain`, `classification = NEUTRAL`, and move on. This alone clears ~80% of the 549 backlog instantly.

**Self-re-trigger**: After the processing loop, query for remaining `unshortened_url IS NULL` links. If any exist, POST to itself fire-and-forget before returning.

