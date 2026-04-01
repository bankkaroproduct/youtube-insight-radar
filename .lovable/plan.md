

# Fix Inconsistent Stats Across Pages

## Root Causes

**1. Total Links: 32,115 (Videos) vs 21,814 (Processing)**
The Videos page computes "Total Links" by summing `link_count` from the `get_keyword_stats` RPC. That RPC joins `video_links` through `video_keywords`, so a link is counted once per keyword its video is associated with. Videos linked to 2 keywords get their links double-counted, inflating the number to 32,115. The Processing tab queries `video_links` directly with `COUNT(*)` — the true count is 21,814.

**2. Unique Channels: 1,289 (Videos) vs 1,000 (Channels)**
Despite `.limit(999999999)`, Supabase enforces a server-side max of 1,000 rows per response. The Channels hook hits this cap silently. The Videos page counts unique `channel_id` values from its own loaded data (which uses batched fetching), so it sees 1,289.

## Changes

### 1. `src/pages/Videos.tsx` — Fix Total Links stat
Replace the `get_keyword_stats` RPC sum with a direct exact count query on `video_links`:
```typescript
supabase.from("video_links").select("id", { count: "exact", head: true })
  .then(({ count }) => setDbTotalLinks(count));
```

### 2. `src/hooks/useChannels.ts` — Fix 1,000 row cap
Use the same batched fetching pattern as `useVideos.ts` to paginate through all channel rows:
- Remove `.limit(999999999)` 
- Add a `while` loop fetching in batches of 1,000 using `.range(from, to)`
- Concatenate results until a batch returns fewer than 1,000 rows

### 3. `src/pages/Channels.tsx` — Add direct DB count for total channels
Add a `HEAD` count query for the total channels stat card so it matches reality, similar to the Videos page pattern.

| File | Change |
|------|--------|
| `src/pages/Videos.tsx` | Replace RPC-based link count with direct `video_links` count |
| `src/hooks/useChannels.ts` | Batch-fetch channels to bypass 1,000 row limit |
| `src/pages/Channels.tsx` | Use exact DB count for total channels stat |

