

# Fix Cleared Jobs Reappearing & Videos Not Fetching

## Problem 1: Cleared finished jobs reappear on tab switch
The "Clear Finished" button only stores cleared IDs in React state (`useState`). When you navigate away and come back, the component remounts, the state resets to empty, and `fetchJobs` re-fetches all recent jobs from the database -- including the ones you cleared.

**Fix**: Change `clearFinished` to actually delete the completed/failed jobs from the database instead of just hiding them in memory.

### File: `src/hooks/useFetchJobs.ts`
- Remove `clearedIds` state entirely
- Update `clearFinished` to delete completed/failed jobs from the `fetch_jobs` table, then re-fetch

## Problem 2: Videos are not being fetched
The `queue-fetch-jobs` edge function only **inserts** rows into the `fetch_jobs` table with status "pending". But nothing ever **calls** `process-fetch-queue` to actually process those jobs. The job just sits there as "pending" forever.

**Fix**: After queuing jobs, automatically invoke `process-fetch-queue` to start processing them.

### File: `src/pages/Keywords.tsx`
- After successfully calling `queue-fetch-jobs`, immediately invoke `process-fetch-queue` to trigger actual YouTube API fetching

### File: `supabase/functions/queue-fetch-jobs/index.ts` (alternative/belt-and-suspenders)
- After inserting jobs, call `process-fetch-queue` from within the edge function itself so processing is guaranteed to start

## Summary of changes
1. **`src/hooks/useFetchJobs.ts`** -- delete finished jobs from DB in `clearFinished`
2. **`src/pages/Keywords.tsx`** -- invoke `process-fetch-queue` after queuing jobs
3. **`supabase/functions/queue-fetch-jobs/index.ts`** -- also trigger `process-fetch-queue` after inserting jobs as a backup

