

# Fix Stat Cards to Show Exact Unlimited Values

## Problem
The `daily_quota_limit` column defaults to `10,000` per key, which artificially caps the "Quota Remaining" stat and marks keys as "exhausted" based on this limit. YouTube's actual daily quota per key is `10,000 units`, but the user wants no artificial ceiling — just raw, accurate numbers.

## Changes

### 1. Database Migration
- Change `daily_quota_limit` default from `10000` to `0` (meaning unlimited/no cap)
- Update all existing rows: set `daily_quota_limit = 0` where it's still `10000`

### 2. `src/hooks/useApiKeys.ts` — Fix stats calculation
- **Quota Remaining**: When `daily_quota_limit` is `0` (unlimited), show total quota used instead of remaining. Or simply show `quota_used_today` totals as the stat
- **Exhausted**: Only mark as exhausted if `daily_quota_limit > 0` AND usage exceeds it — keys with limit `0` are never "exhausted"
- Change `quotaRemaining` to `quotaUsed` showing total units consumed today across all active keys (exact value, no cap)

### 3. `src/components/api-keys/ApiKeyStatsCards.tsx`
- Rename "Quota Remaining" card to "Quota Used Today" showing exact usage
- Keep `.toLocaleString()` for comma formatting (this is display formatting, not a limit)

### 4. `supabase/functions/process-fetch-queue/index.ts`
- In `getNextApiKey`: skip the `quota_used_today >= daily_quota_limit` check when `daily_quota_limit` is `0` (unlimited)

## What Stays the Same
- All other stat cards (Total, Healthy, Invalid, Exhausted) keep their logic
- API key table, testing, export unchanged

