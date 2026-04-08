

# Backend Audit & Hardening Plan

## Issues Found

### 1. process-fetch-queue: Self-re-trigger check is broken
**Line 516-522**: Uses `select("id", { count: "exact", head: true })` with `head: true`, which returns NO rows (only count). Then checks `remaining.length > 0` which will always be falsy since `data` is `null` when `head: true`. The self-re-trigger for remaining pending jobs **never fires**.

**Fix**: Use `count` instead of `remaining.length`:
```typescript
const { count: remainingCount } = await supabase
  .from("fetch_jobs")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending");

if (remainingCount && remainingCount > 0) { ... }
```

### 2. process-fetch-queue: Race condition on parallel job processing
**Line 440**: All pending jobs are processed via `Promise.all` using shared `quotaCache`. Multiple concurrent jobs call `incrementQuota` with stale cache values, leading to inaccurate quota tracking (last-write-wins). This can cause quota over-consumption.

**Fix**: Process jobs sequentially instead of parallel to ensure accurate quota tracking, or use atomic DB increment instead of read-then-write.

### 3. process-fetch-queue: No auth validation
Unlike `queue-fetch-jobs`, the `process-fetch-queue` function has **no auth check**. While it's called server-to-server with the service role key, anyone with the anon key could invoke it directly since `verify_jwt = false`.

**Fix**: Add service-role-key validation or JWT check at the top.

### 4. fetch-channel-videos: No auth validation
Same issue -- no authentication check. Any user could trigger expensive YouTube API calls.

**Fix**: Add auth header validation (admin role check).

### 5. compute-channel-stats: `remaining` count query is wrong
**Line 162**: `.or("last_analyzed_at.is.null")` only counts channels never analyzed, not channels analyzed before *this* run. After the first full run, `remaining` will always be 0, so the frontend batch loop stops after one batch.

**Fix**: Track the run start time and count channels analyzed before that timestamp:
```typescript
.or(`last_analyzed_at.is.null,last_analyzed_at.lt.${runStartTime}`)
```

### 6. process-video-links: `requestedBatchSize` is capped at 500 but frontend sends 1000
**Line 308**: `Math.min(Math.max(body.batch_size, 1), 500)` caps at 500, but `linkProcessingService.ts` sends `batch_size: 1000`. This means the frontend thinks it processes 1000 but only 500 are processed per call, causing the progress log to show misleading numbers.

**Fix**: Increase cap to 2000 or remove the artificial cap, since the function already has internal batching.

### 7. process-video-links: Mutating module-level constants
**Lines 281-288**: `AFFILIATE_SHORT_DOMAINS` and `RETAILER_DOMAINS` are `const` objects but get mutated at runtime by adding DB patterns. In Deno edge functions, module-level state can persist across invocations on the same isolate, causing stale or cumulative data.

**Fix**: Clone these into local variables inside the handler instead of mutating the module-level objects.

### 8. test-api-key: Auth is optional (bypassed if no header)
**Line 19**: `if (authHeader)` makes the entire auth check optional. If no Authorization header is sent, the function proceeds without any auth, allowing anyone to test/deactivate API keys.

**Fix**: Make auth required -- throw error if no auth header.

### 9. analyze-channel-relevance & analyze-keyword-priority: No auth check
These functions execute with service role and call AI APIs but have **no authentication** -- any anonymous request could trigger AI costs.

**Fix**: Add service-key or JWT validation.

### 10. scrape-instagram-profiles: No auth check
Same issue. Any anonymous call could trigger Apify costs.

### 11. process-fetch-queue: `youtube_total_videos` from `search.totalResults` is unreliable
In `fetch-channel-videos` **line 100**, `searchData.pageInfo.totalResults` from YouTube's search endpoint is an *estimate* and often wildly inaccurate. This is stored as `youtube_total_videos`.

**Fix**: Use the `channels.list` API with `statistics` part to get the accurate `videoCount` instead.

### 12. expand-keyword: No input sanitization
**Line 12**: Takes `keyword` directly from user input and passes it to AI without length or content validation.

**Fix**: Add max length check (e.g., 200 chars) and sanitize.

---

## Implementation Plan

### Step 1: Fix self-re-trigger bug in `process-fetch-queue`
Change `remaining.length` to use the `count` value from the head query.

### Step 2: Add auth guards to unprotected edge functions
Add service-role-key validation to: `process-fetch-queue`, `fetch-channel-videos`, `compute-channel-stats`, `analyze-channel-relevance`, `analyze-keyword-priority`, `scrape-instagram-profiles`. Fix `test-api-key` to require auth.

### Step 3: Fix quota race condition in `process-fetch-queue`
Switch from `Promise.all` to sequential processing for jobs, or use DB-level atomic increment.

### Step 4: Fix `compute-channel-stats` remaining count
Pass a `run_start` timestamp and use it to count channels not yet recomputed in this run.

### Step 5: Fix module-level mutation in `process-video-links`
Clone `AFFILIATE_SHORT_DOMAINS` and `RETAILER_DOMAINS` into local variables inside the request handler.

### Step 6: Align batch size cap in `process-video-links`
Increase cap from 500 to 2000 to match frontend expectations.

### Step 7: Add input validation to `expand-keyword`
Add keyword length check and basic sanitization.

### Step 8: Fix `test-api-key` auth bypass
Make Authorization header required instead of optional.

