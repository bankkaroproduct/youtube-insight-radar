

# Fix Blank Videos Page & Optimize Link Processing

## Problem Analysis

**Blank Videos Page**: The network requests show "Failed to fetch" errors on `video_links` and `video_keywords` queries. After the pagination fix, `useVideos.ts` now fetches 2000+ videos, then passes all 2000+ UUIDs into a single `.in("video_id", videoIds)` filter. This creates a URL that exceeds the HTTP URL length limit (~8KB), causing the request to fail silently and the page to render blank.

**Link Processing**: The edge function currently processes only 100 links per invocation (MAX_TOTAL = 100) with batches of 25. For 32,115 links this means ~321 self-re-trigger cycles, which is very slow.

## Changes

### 1. Fix blank page (`src/hooks/useVideos.ts`)
- Chunk the `videoIds` array into groups of 200 before passing to `.in()` queries for `video_links` and `video_keywords`
- Run each chunk through `fetchAllRows`, then merge results
- This keeps each URL within safe limits

### 2. Optimize edge function (`supabase/functions/process-video-links/index.ts`)
- Increase `MAX_TOTAL` from 100 to 500 (process more per invocation)
- Increase `BATCH_SIZE` from 25 to 50
- Increase fast-path skip-domain limit from 1000 to 5000
- Chunk the `.in()` queries in Step 3 (unmatched links) to avoid URL length issues there too
- Keep the self-re-trigger loop for the remaining links

### 3. Pattern matching logic (already correct)
The existing edge function already matches:
- Original URL domain against platform patterns (affiliate_platform type)
- Unshortened URL domain against retailer patterns (retailer type)
- Unmatched domains get auto-discovered into affiliate_patterns with `is_confirmed: false`

This matches what you described. No logic changes needed, just performance improvements.

## Technical Details

**Chunked `.in()` helper** for useVideos.ts:
```typescript
async function fetchWithChunkedIn<T>(
  ids: string[],
  queryFn: (chunk: string[]) => (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const CHUNK = 200;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map(chunk => fetchAllRows(queryFn(chunk)))
  );
  return results.flat();
}
```

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Chunk `.in()` queries into groups of 200 IDs |
| `supabase/functions/process-video-links/index.ts` | Increase MAX_TOTAL to 500, BATCH_SIZE to 50, skip-domain limit to 5000 |

