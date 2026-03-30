

# API Key Management for YouTube Data API

## Overview

Build a full API key management system to store, rotate, and monitor 170 YouTube Data API keys. Each key gets quota tracking (YouTube allows 10,000 units/day per key) and a health-check test button.

## Database

### New table: `youtube_api_keys`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| api_key | text, NOT NULL | the YouTube API key (encrypted at rest by DB) |
| label | text | optional friendly name, e.g. "Key #42" |
| is_active | boolean | default true; set false when exhausted/revoked |
| daily_quota_limit | integer | default 10000 |
| quota_used_today | integer | default 0 |
| last_tested_at | timestamptz | when last health check ran |
| last_test_status | text | 'valid', 'invalid', 'quota_exceeded' |
| last_used_at | timestamptz | when last used for a fetch job |
| created_at | timestamptz | auto |

- RLS: admin-only for all operations (read/insert/update/delete)
- Index on `is_active` for quick key selection during fetch jobs

### Migration also adds:
- A daily cron-reset mechanism (or an RPC `reset_daily_quotas` that sets `quota_used_today = 0` for all keys)

## Edge Functions

### `test-api-key` (new)
- Accepts `{ key_id }` or `{ key_ids: [] }` for bulk testing
- For each key: calls YouTube Data API `search.list` with `maxResults=1` (costs 100 quota units) to verify the key works
- Updates `last_tested_at`, `last_test_status` in `youtube_api_keys`
- Returns results per key: valid / invalid / quota_exceeded

### Update `process-fetch-queue`
- Instead of a hardcoded API key, query `youtube_api_keys` for the next available active key with remaining quota
- After each API call, increment `quota_used_today` and update `last_used_at`
- If a key returns quota exceeded, mark it and rotate to the next key

## UI: `src/pages/settings/ApiKeys.tsx`

### Summary Cards (top row)
- **Total Keys**: count of all keys
- **Active Keys**: count where `is_active = true`
- **Exhausted Today**: count where `quota_used_today >= daily_quota_limit`
- **Total Quota Remaining**: sum of `(daily_quota_limit - quota_used_today)` across active keys

### Actions Bar
- **Add Key(s)** button: dialog with a textarea to paste one key per line (supports bulk paste of 170 keys)
- **Test All Keys** button: triggers `test-api-key` for all keys, shows progress
- **Export** button: download keys + status as Excel

### Keys Table
| Column | Details |
|--------|---------|
| Label | editable inline |
| API Key | masked (`AIza...xxxx`), copy button |
| Status | badge: Active (green) / Inactive (gray) / Invalid (red) |
| Quota Used | progress bar showing `quota_used_today / daily_quota_limit` |
| Last Tested | relative time + status badge (valid/invalid/exceeded) |
| Last Used | relative time |
| Actions | Test (single key), Toggle Active, Delete |

- Sortable by quota used, status, last tested
- Bulk select + bulk test / bulk delete / bulk toggle

### Hook: `src/hooks/useApiKeys.ts`
- CRUD operations on `youtube_api_keys`
- `testKeys(ids)` — invokes `test-api-key` edge function
- Real-time subscription for quota updates

## Files Created/Modified

1. **Migration SQL** — create `youtube_api_keys` table + RLS policies
2. **`supabase/functions/test-api-key/index.ts`** — new edge function
3. **`supabase/functions/process-fetch-queue/index.ts`** — update to use key rotation
4. **`src/pages/settings/ApiKeys.tsx`** — full rewrite with management UI
5. **`src/hooks/useApiKeys.ts`** — new hook for API key data + operations
6. **`src/components/api-keys/AddKeysDialog.tsx`** — bulk key entry dialog
7. **`src/components/api-keys/ApiKeyStatsCards.tsx`** — summary cards
8. **`src/components/api-keys/ApiKeysTable.tsx`** — table with quota bars

## Security
- API keys are never exposed to non-admin users (RLS admin-only)
- Keys are masked in the UI (only first 4 + last 4 chars shown)
- Test function validates admin role before proceeding

