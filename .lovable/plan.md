

# Fix 1000-Row Limit on Video Links & Keywords

## Problem
The `useVideos` hook fetches `video_links` and `video_keywords` without specifying a limit, so Supabase applies its default 1000-row cap. This truncates link counts in the stat cards.

## Solution (`src/hooks/useVideos.ts`)

Add `.limit(999999999)` to both the `video_links` and `video_keywords` queries (lines 75-76):

```typescript
supabase.from("video_links").select("*").in("video_id", videoIds).limit(999999999),
supabase.from("video_keywords").select("video_id, keyword_id, search_rank").in("video_id", videoIds).limit(999999999),
```

Also add the same limit to the keywords lookup query (~line 88).

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Add `.limit(999999999)` to video_links, video_keywords, and keywords_search_runs queries |

