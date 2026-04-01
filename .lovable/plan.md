

# Fix Video Count Discrepancy & Quota Reset Error

## Issue 1: Video counts differ between Keywords and Videos pages

**Root cause**: This is expected behavior, not a bug. The Keywords table shows video counts *per keyword* via `get_keyword_stats()`. A single video can appear under multiple keywords (e.g., a video found via "best sneakers" AND "top shoes" counts once in each keyword row). The Videos page shows 1,224 unique videos, while the keyword-level sum is 1,544 because of these overlaps.

**Fix**: No data change needed. Add a tooltip or note in the Keywords table header clarifying "Videos found for this keyword (a video may appear under multiple keywords)."

| File | Change |
|------|--------|
| `src/components/keywords/KeywordsTable.tsx` | Add tooltip to the "Videos" column header explaining per-keyword counting |

## Issue 2: Quota Reset fails with "UPDATE requires a WHERE clause"

**Root cause**: In `useApiKeys.ts` (line 80-83), after calling `reset_daily_quotas` RPC, a second client-side UPDATE attempts to re-activate all keys using `.neq("id", "00000000-...")` as a fake WHERE clause. PostgREST rejects this pattern in newer versions.

**Fix**: Move the re-activation logic into the `reset_daily_quotas` SQL function itself. This eliminates the client-side UPDATE entirely and runs everything in a single server-side call with SECURITY DEFINER privileges.

| Component | Change |
|-----------|--------|
| Database migration | Update `reset_daily_quotas` function to also set `is_active = true` and `last_test_status = null` |
| `src/hooks/useApiKeys.ts` | Remove the second `.update()` call from `resetQuota` mutation — the RPC now handles everything |

### Updated SQL function
```sql
CREATE OR REPLACE FUNCTION public.reset_daily_quotas()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.youtube_api_keys 
  SET quota_used_today = 0, is_active = true, last_test_status = null;
$$;
```

### Updated hook code
```typescript
resetQuota: useMutation({
  mutationFn: async () => {
    const { error } = await supabase.rpc("reset_daily_quotas" as any);
    if (error) throw error;
  },
  // ... success/error handlers unchanged
})
```

