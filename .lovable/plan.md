

# Integrate unshorten.me API for URL Resolution

## What Changes

Replace the current manual HEAD/GET redirect-following in `process-video-links` with the unshorten.me API, which is more reliable for resolving shortened affiliate URLs.

## Files to Change

### 1. `supabase/functions/process-video-links/index.ts`

**Replace the `unshortenUrl` function** (lines 23-43) to call the unshorten.me API instead of doing HEAD/GET redirect follows:

```typescript
async function unshortenUrl(url: string): Promise<string> {
  const apiKey = Deno.env.get("UNSHORTEN_API_KEY");
  if (!apiKey) {
    console.warn("UNSHORTEN_API_KEY missing — falling back to redirect follow");
    return fallbackUnshorten(url);
  }
  try {
    const resp = await fetch(
      `https://unshorten.me/api/v2/unshorten?url=${encodeURIComponent(url)}`,
      {
        headers: { Authorization: `Token ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (resp.status === 429) {
      console.warn("unshorten.me rate limited — falling back");
      return fallbackUnshorten(url);
    }
    const data = await resp.json();
    if (data.success && data.unshortened_url) {
      return data.unshortened_url;
    }
    return fallbackUnshorten(url);
  } catch {
    return fallbackUnshorten(url);
  }
}
```

Keep the old HEAD/GET logic as `fallbackUnshorten()` so the system degrades gracefully if the API key is missing or rate-limited.

**Add shortener domains** from user's list that are currently missing: `fkrt.it`, `wsli.nk`, `tiny.cc`, `short.io`, `amzn.to`.

### 2. Add Secret: `UNSHORTEN_API_KEY`

Use the `add_secret` tool to request the API key from the user. This secret will be available to the edge function at runtime via `Deno.env.get("UNSHORTEN_API_KEY")`.

### 3. `src/utils/unshortenUrl.ts` (new file)

Create a client-side utility with `unshortenUrl()`, `unshortenMany()`, and `isShortUrl()` as specified. This uses `VITE_UNSHORTEN_API_KEY` for any client-side usage (though primary processing happens in the edge function).

## What Does NOT Change

- The overall pipeline flow remains identical
- Affiliate pattern matching, classification, and channel stats triggering are untouched
- The `parallelMap` with concurrency 10 stays the same
- Batch DB writes stay the same

## Summary

- Edge function gets the real improvement (unshorten.me API replaces unreliable redirect-following)
- Graceful fallback if API key missing or rate limit hit
- Client-side utility created for any future front-end usage
- One new secret to add: `UNSHORTEN_API_KEY`

