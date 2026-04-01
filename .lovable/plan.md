

# Optimize Fetch Data Processing

## Current Bottlenecks

1. **Single invocation cap**: `process-fetch-queue` processes max 20 jobs per invocation. If you queue 50 keywords, the remaining 30 sit as "pending" until manually re-triggered.
2. **No auto-continuation**: After processing 20 jobs, the function doesn't re-invoke itself for remaining pending jobs.
3. **Edge function timeout risk**: Processing 20 jobs in parallel (each doing 2 pages of search + video details + upserts) can exceed the ~60s edge function timeout, causing jobs to silently fail.
4. **Frontend triggers processing only once**: `Keywords.tsx` fires a single `process-fetch-queue` call after queuing, with no follow-up.

## Plan

### 1. Self-re-triggering loop in `process-fetch-queue`
After completing a batch of jobs, check if more pending jobs remain. If yes, fire-and-forget a new invocation of itself before returning. This creates an automatic chain that drains the entire queue without user intervention.

| File | Change |
|------|--------|
| `supabase/functions/process-fetch-queue/index.ts` | After `Promise.all(jobPromises)` completes, check for remaining pending jobs. If any exist, fire-and-forget a new call to itself. |

### 2. Reduce batch size to avoid timeouts
Lower `MAX_PARALLEL_JOBS` from 20 to 10 to stay safely within the edge function execution window. More frequent, smaller batches with self-re-triggering will be faster overall than large batches that risk timeout.

| File | Change |
|------|--------|
| `supabase/functions/process-fetch-queue/index.ts` | `MAX_PARALLEL_JOBS = 10` |

### 3. Batch video detail requests more efficiently
Currently each job fetches video details independently. Within `processJob`, the video details API call is already chunked by 50, but each search page is fetched sequentially. We'll keep the search sequential (required for pagination) but parallelize the video details chunks within a single job.

| File | Change |
|------|--------|
| `supabase/functions/process-fetch-queue/index.ts` | Parallelize video detail chunk fetches with `Promise.all` instead of sequential `for` loop |

### 4. Remove duplicate trigger from frontend
`Keywords.tsx` triggers `process-fetch-queue` twice — once inside `queue-fetch-jobs` (server-side, line 65) and once from the frontend (line 83). Remove the frontend duplicate to avoid race conditions.

| File | Change |
|------|--------|
| `src/pages/Keywords.tsx` | Remove the second `fetch` call to `process-fetch-queue` (lines 83-91) |

## Summary

| # | Optimization | Impact |
|---|-------------|--------|
| 1 | Self-re-trigger for remaining jobs | Processes entire queue automatically |
| 2 | Reduce batch to 10 parallel jobs | Avoids timeout failures |
| 3 | Parallelize video detail fetches | Faster per-job processing |
| 4 | Remove duplicate frontend trigger | Eliminates race conditions |

