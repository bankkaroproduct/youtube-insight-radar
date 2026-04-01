

# Add Second Unshorten API Key for Faster Processing

## What We'll Do

Add support for a second `UNSHORTEN_API_KEY_2` secret so the edge function can round-robin between two API keys, effectively doubling throughput and reducing rate-limit hits.

## Steps

| Step | Detail |
|------|--------|
| **1. Add secret** | Use the `add_secret` tool to request `UNSHORTEN_API_KEY_2` from you |
| **2. Update edge function** | Modify `supabase/functions/process-video-links/index.ts` to load both keys, build an array, and rotate between them using a simple counter (`callIndex++ % keys.length`) |
| **3. Deploy** | Redeploy the edge function |

## Technical Detail

In `unshortenUrl()`, instead of a single key:

```typescript
const keys = [
  Deno.env.get("UNSHORTEN_API_KEY"),
  Deno.env.get("UNSHORTEN_API_KEY_2"),
].filter(Boolean) as string[];

let keyIndex = 0;
function getNextKey(): string {
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}
```

Each call to `unshortenUrl` picks the next key in rotation. If one key gets rate-limited (429), the function falls back to the HTTP method as it does today — no breakage.

