# Answers & Fixes for All 4 Issues

## 1. Why Stats Cards Show Different Numbers Across Tabs

**Root cause:** Each tab computes stats from different data sources independently:

- **Keyword Table** (`KeywordTable.tsx`): Calls `get_keyword_stats` RPC which counts from the database directly (accurate aggregate from DB)
- **Videos tab** (`Videos.tsx`): Loads all videos into memory via `useVideos()`, then counts links from the in-memory `video.links[]` array — which was previously capped at 1000 rows by the Supabase default limit (now fixed with `.limit(999999999)`)
- **Channels tab** (`Channels.tsx`): Uses pre-computed JSONB fields on the `channels` table (set by `compute-channel-stats` edge function)

So "Total Links" on the Keyword Table comes from a DB aggregate, while on Videos it comes from in-memory link arrays. They naturally differ if data is stale or if the 1000-row limit was hit.

**Fix:** Unify the stats source — make the Videos tab also use the `get_keyword_stats` RPC for its "Total Links" stat card instead of counting in-memory arrays. This ensures all tabs report the same number.

---

## 2. Add "Reset Quota Usage" Button

Add a button on the API Keys settings page that resets `quota_used_today` to 0 for all keys and re-activates keys that were marked exhausted.


| File                             | Change                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useApiKeys.ts`        | Add `resetQuota` mutation that updates all keys: `quota_used_today = 0`, `is_active = true`, `last_test_status = null` |
| `src/pages/settings/ApiKeys.tsx` | Add "Reset Quota" button next to "Test All Keys"                                                                       |


---

## 3. Speed Up Keyword Processing — Use Multiple API Keys in Parallel

**Current bottleneck:** `process-fetch-queue` picks only **1 API key** (`getNextApiKey` returns a single key) and processes jobs **sequentially** (5 at a time, one after another). With 130+ keys available, this wastes resources.

**Fix:** Process multiple jobs in parallel, each with its own API key:


| File                                              | Change                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `supabase/functions/process-fetch-queue/index.ts` | 1. Fetch up to N available API keys (e.g. 10) instead of 1          |
| &nbsp;                                            | 2. Assign each pending job a different API key                      |
| &nbsp;                                            | 3. Process jobs with `Promise.all` instead of sequential `for` loop |
| &nbsp;                                            | 4. Increase pending job limit from 5 to 20                          |


---

## 4. Why Only 9/13/24 Videos Instead of 30

**Root cause:** The function requests `maxResults: 30` from YouTube Search API, but then filters out:

- Videos shorter than 60 seconds (Shorts/Reels) — line 261
- Videos with `#shorts` in the title — line 264

So if YouTube returns 30 results and 6-21 of them are Shorts, you end up with 9-24 videos. This is expected behavior given the Shorts filter.

**Fix options:**

- **Option A (recommended):** Fetch 50 results to compensate for Shorts filtering. Increase `MAX_PAGES` from 1 to 2 (fetching up to 50 results), then cap at 30 *after* filtering.
- **Option B:** Use `videoDuration=medium` parameter in the YouTube search API to exclude short videos at the API level (though this also excludes videos 1-4 minutes).

**Proposed approach:** Use Option A — set `MAX_PAGES = 2` and add a cap of 30 videos after Shorts filtering. This guarantees closer to 30 qualifying videos per keyword.

---

## Summary of Changes


| #   | Issue                                   | Files Modified                                                                 |
| --- | --------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Unified stats across tabs               | `src/pages/Videos.tsx` — use RPC for total link count                          |
| 2   | Reset Quota button                      | `src/hooks/useApiKeys.ts`, `src/pages/settings/ApiKeys.tsx`                    |
| 3   | Parallel multi-key processing           | `supabase/functions/process-fetch-queue/index.ts`                              |
| 4   | Fetch enough videos after Shorts filter | `supabase/functions/process-fetch-queue/index.ts` — `MAX_PAGES = 2`, cap at 30 |
