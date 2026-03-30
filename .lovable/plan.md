

# Fix Active Keys Stats Discrepancy

## Problem
The "Active Keys" stat card counts all keys where `is_active = true` (198), ignoring their test status. But in the table, those same keys show "Invalid" badges because `last_test_status = "invalid"`. This is confusing — the board says 198 active, but scrolling through the list shows most are invalid.

## Root Cause
In `useApiKeys.ts`, the stats calculation:
```ts
active: keys.filter((k) => k.is_active).length  // only checks is_active flag
```
But the table badge logic in `ApiKeysTable.tsx` also checks `last_test_status`, so a key can be `is_active = true` but display as "Invalid".

## Fix

### 1. Update stats in `src/hooks/useApiKeys.ts`
Add more granular stats:
- **Active & Valid**: `is_active && last_test_status !== "invalid" && last_test_status !== "quota_exceeded"`
- **Invalid**: `last_test_status === "invalid"`
- Keep existing exhausted and quota remaining

### 2. Update `src/components/api-keys/ApiKeyStatsCards.tsx`
Change "Active Keys" to show only truly healthy keys. Add an "Invalid Keys" card with a count so the admin can see at a glance how many need attention.

New cards: Total Keys | Healthy Keys | Invalid Keys | Exhausted Today | Quota Remaining (5 cards in a responsive grid).

### 3. Auto-deactivate invalid keys (optional but recommended)
After testing, if a key is "invalid", automatically set `is_active = false` in the `test-api-key` edge function so invalid keys stop being rotated into use. This keeps the stats honest.

## Files
1. `src/hooks/useApiKeys.ts` — update stats calculation
2. `src/components/api-keys/ApiKeyStatsCards.tsx` — add Invalid card, rename Active → Healthy
3. `supabase/functions/test-api-key/index.ts` — auto-deactivate invalid keys after test

