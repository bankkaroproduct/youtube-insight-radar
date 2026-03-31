

# Speed Up the Entire Pipeline

## Current Bottlenecks

The main fetch function was optimized, but 4 downstream functions still run slowly due to sequential DB calls and serial HTTP requests.

### 1. `process-video-links` — Slowest (~60s+ for 200 links)
- Unshortens URLs **one at a time** (each up to 10s timeout)
- Updates each link individually
- Looks up `channel_id` per link individually

### 2. `compute-channel-stats` — Slow for many channels
- Loops through each channel sequentially with 3 queries + 1 update per channel

### 3. `analyze-keyword-priority` & `analyze-channel-relevance`
- Update DB records one-by-one after AI response

### 4. `process-fetch-queue` — Minor remaining issues
- `incrementQuota` does SELECT then UPDATE (2 calls) every time
- `fetchChannelDetails` updates channels one-by-one

---

## Fix Plan

### File: `supabase/functions/process-video-links/index.ts`
- **Parallelize URL unshortening**: Use `Promise.allSettled` to unshorten up to 10 URLs concurrently instead of sequentially
- **Batch update video_links**: Collect all updates and write in bulk instead of per-link
- **Pre-fetch all video→channel mappings** in one query instead of per-link lookups
- **Batch pattern lookups**: Check all unknown domains at once

### File: `supabase/functions/compute-channel-stats/index.ts`
- **Replace per-channel loop with a single RPC function** that computes stats for all channels in one SQL query (videos + links + patterns joined), returning results in one call
- Or at minimum: parallelize channel processing with `Promise.allSettled`

### File: `supabase/functions/analyze-keyword-priority/index.ts`
- **Batch update**: Replace per-keyword `update` loop with a single batch update after AI response

### File: `supabase/functions/analyze-channel-relevance/index.ts`
- **Batch update**: Replace per-channel `update` loop with parallel `Promise.all` updates

### File: `supabase/functions/process-fetch-queue/index.ts`
- **Cache API key**: Call `getNextApiKey` once, reuse throughout
- **Simplify `incrementQuota`**: Use a single UPDATE with raw SQL increment instead of SELECT+UPDATE
- **Batch `fetchChannelDetails` updates**: Collect all channel updates, write once

## Expected Result
- Link processing: 60s+ → ~10s (parallel unshorten + batch writes)
- Channel stats: 20s+ → ~2s (single query or parallel)  
- Priority/relevance: minor speedup from batch writes
- Overall pipeline: from 2+ minutes down to ~15-20 seconds total

