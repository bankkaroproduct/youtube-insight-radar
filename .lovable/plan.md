

# Fix: AI Analysis (Priority & Relevance) Not Running

## Problem

The `process-fetch-queue` edge function triggers the AI analysis functions (`analyze-keyword-priority` and `analyze-channel-relevance`) at the very end of execution (lines 346-387). The function log shows a `shutdown` event, meaning the edge function **timed out** before reaching those trigger calls. That's why priority and relevance are both null — the AI functions were never invoked.

## Root Cause

The function processes all videos sequentially (inserting each video, its links, keyword mappings, and channel records one by one). With 63 videos and hundreds of links, this exhausts the edge function's wall-clock limit before reaching the auto-trigger section at the bottom.

## Fix

**Make the auto-trigger calls fire-and-forget** (don't `await` them) AND **move them earlier** — fire them right after video processing completes but before waiting for secondary operations:

1. **In `process-fetch-queue/index.ts`**: Remove `await` from the four downstream function calls (`process-video-links`, `compute-channel-stats`, `analyze-keyword-priority`, `analyze-channel-relevance`) so they fire without blocking the response.

2. **Alternatively (more robust)**: Move the trigger calls to happen immediately after the main video insert loop finishes, before the response is returned, using `Promise.allSettled` with no await — or use `event.waitUntil`-style pattern. Since Deno edge functions don't support `waitUntil`, the simplest approach is to remove `await` from all four `fetch()` calls so they fire immediately and the function can return.

3. **Redeploy** the `process-fetch-queue` function.

## Technical Details

```typescript
// Change from:
await fetch(fnUrl, { method: "POST", headers: {...}, body: ... });

// To (fire-and-forget):
fetch(fnUrl, { method: "POST", headers: {...}, body: ... }).catch(e => console.error("...", e));
```

This applies to all four auto-trigger calls:
- `process-video-links` (line 320)
- `compute-channel-stats` (line 334)  
- `analyze-keyword-priority` (line 358)
- `analyze-channel-relevance` (line 376)

The function will return its response immediately after dispatching these calls, and each downstream function runs independently.

