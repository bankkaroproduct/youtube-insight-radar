

# Optimize Link Unshortening Pipeline

## Analysis of Current State
- **Parallel processing**: Already uses `parallelMap` with concurrency 10, but it's a worker-pool style (no inter-batch delays for rate limiting)
- **Timeouts**: Already has 5s/8s timeouts via `AbortSignal.timeout()` — already done
- **No URL cache**: Each URL resolved independently even if duplicated
- **HTML fetch**: Downloads full body every time, even when redirect already resolved
- **DB writes**: Individual `update().eq("id")` calls wrapped in `Promise.all` — functional but not batched upserts
- **No progress tracking**: Frontend only sees results after full batch completes

## Changes

### 1. Edge Function (`supabase/functions/process-video-links/index.ts`)

**a) Replace `parallelMap` with batched `Promise.all` + delay**
- Remove the worker-pool `parallelMap` function
- Process shortened links in groups of 10 with `Promise.all`, 200ms delay between groups
- This gives explicit rate-limit protection the worker pool lacks

**b) Add in-memory URL cache**
- `const urlCache = new Map<string, string>()` at top of handler
- Before calling `unshortenUrl()`, check cache → skip API if hit
- After resolving, `cache.set(originalUrl, resolvedUrl)`

**c) Add database-level cache lookup**
- Before resolving a batch, query `video_links` for rows where `original_url IN (batch URLs) AND unshortened_url IS NOT NULL AND unshortened_url != original_url`
- Pre-populate the in-memory cache from DB results → skip API calls for previously-resolved URLs

**d) Skip HTML body fetch when not needed**
- In `unshortenUrl()`: if the unshorten.me API returns a different URL that is NOT a JS-redirect domain, return immediately without calling `resolveJsRedirect`
- In `fallbackUnshorten()`: if HEAD/GET redirect lands on a non-JS-redirect domain, skip HTML parsing
- This is already partially done but `resolveJsRedirect` is called even when we have a good retailer URL

**e) Limit HTML body to 20KB**
- In `resolveJsRedirect()`: use streaming reader, stop after 20KB instead of `resp.text()`

**f) Batch database writes**
- Replace the individual `update().eq("id")` calls with chunked upserts
- Collect all link updates, then write in groups of 50 using a single query per group
- Since `video_links` has no upsert-friendly unique constraint on `id` being the PK, we'll keep individual updates but batch them more efficiently with fewer concurrent calls

**g) Add progress response data**
- Include `{ total, resolved, failed, cached }` counts in the response JSON so the frontend can display progress

### 2. Frontend Service (`src/services/linkProcessingService.ts`)

**h) Show progress in logs**
- Parse the new `cached`, `resolved`, `failed` fields from edge function response
- Display richer log messages: `"✅ Batch #3: 50 processed (12 cached, 35 resolved, 3 failed), 150 remaining"`

### 3. Links Page UI (`src/pages/Links.tsx`)
- Update log display to show cache hit info if available (no structural changes needed — the log messages will just be more detailed)

## Files Modified
1. `supabase/functions/process-video-links/index.ts` — main optimization target
2. `src/services/linkProcessingService.ts` — richer log output

## Technical Notes
- No database schema changes needed (no new columns — progress is returned in the API response, not stored)
- Point 6 (skip already-resolved) is already handled: the query uses `.is("unshortened_url", null)`
- Point 3 (timeouts) is already implemented with `AbortSignal.timeout()`
- The existing 4-step resolution pipeline logic is preserved exactly
- Rate limit protection: 10 concurrent + 200ms gap ≈ safe for unshorten.me API

