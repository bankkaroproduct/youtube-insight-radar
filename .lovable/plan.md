

# Fix Videos Page Showing Only 1000 Videos

## Problem
The Videos page shows "Total Videos: 1000" because PostgREST enforces a default maximum of 1000 rows per query, regardless of the `.limit(999999999)` set in `useVideos.ts`. The stat `totalVideos: data.length` simply counts the client-side array, which is capped at 1000.

## Solution
Two changes needed:

### 1. `src/pages/Videos.tsx` — Fetch true video count from DB
Add a direct count query (same approach used in KeywordTable fix):
```typescript
const [dbTotalVideos, setDbTotalVideos] = useState<number | null>(null);
useEffect(() => {
  supabase.from("videos").select("id", { count: "exact", head: true })
    .then(({ count }) => setDbTotalVideos(count));
}, [videos]);
```
Use `dbTotalVideos ?? data.length` for the "Total Videos" stat.

### 2. `src/hooks/useVideos.ts` — Paginate to fetch all videos
The `.limit(999999999)` doesn't bypass the 1000-row PostgREST cap. Replace with a pagination loop using `.range()` to fetch all rows in batches of 1000:
```typescript
let allRows: any[] = [];
let from = 0;
const batchSize = 1000;
while (true) {
  const { data, error } = await supabase
    .from("videos").select("*")
    .order("created_at", { ascending: false })
    .range(from, from + batchSize - 1);
  if (error) { /* handle */ break; }
  allRows = allRows.concat(data);
  if (data.length < batchSize) break;
  from += batchSize;
}
```
Same pagination for `video_links` and `video_keywords` queries.

| File | Change |
|------|--------|
| `src/hooks/useVideos.ts` | Replace single query with paginated fetch loop for videos, video_links, video_keywords |
| `src/pages/Videos.tsx` | Add DB count query for accurate "Total Videos" stat |

