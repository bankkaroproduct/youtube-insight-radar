

# Fix Total Videos Count Discrepancy Between Pages

## Problem
The Keyword Table page sums per-keyword video counts from `get_keyword_stats()`, which double-counts videos that appear under multiple keywords. The Videos page shows unique videos (1000), while the Keyword Table shows the inflated sum (1551).

## Solution
Replace the Keyword Table's "Total Videos" stat with a count of unique videos from the `videos` table, and rename the current sum to a separate label or remove the ambiguity.

## Changes

### `src/pages/KeywordTable.tsx`
- Add a separate query to get the actual unique video count: `supabase.from("videos").select("id", { count: "exact", head: true })`
- Use this count for the "Total Videos" stat card
- Optionally keep the per-keyword sum as "Total Video-Keyword Associations" or remove it

| Stat | Before | After |
|------|--------|-------|
| Total Videos | Sum of per-keyword counts (1551) | Unique video count from `videos` table (1000) |

### Technical Detail
Add a `useEffect` that runs:
```typescript
const { count } = await supabase
  .from("videos")
  .select("id", { count: "exact", head: true });
```
Use this `count` for the "Total Videos" stat card value.

