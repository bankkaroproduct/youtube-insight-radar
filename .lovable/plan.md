
Fix the incorrect details on the Links > Processing tab by making the UI trust live backend stats, not stale browser-stored logs.

1. Confirm the real source of truth
- The live backend data already says processing is finished:
  - total links: 24,643
  - resolved/processed: 24,643
  - pending: 0
  - failed: 0
- So the incorrect part is the UI message, not the underlying data.

2. Fix the root cause in `src/pages/Links.tsx`
- Stop using `logs.length > 0` as the signal for:
  - showing “Previous run logs loaded. Click Resume Processing to continue.”
  - switching the button label to “Resume Processing”
- Replace that with derived states from live stats:
  - `hasPendingWork = stats.unprocessed > 0`
  - `canResume = !running && logs.length > 0 && hasPendingWork`
  - `isCompleted = !running && stats.unprocessed === 0 && stats.failed === 0`
- Update the UI so:
  - the resume banner only shows when `canResume` is true
  - the button says “Resume Processing” only when there is actual pending work
  - completed state does not show a resume instruction

3. Reconcile stale local logs in `src/services/linkProcessingService.ts`
- Add a small method to clear or invalidate persisted resume state when the server says no work remains.
- Keep log persistence for interrupted runs, but do not let old logs masquerade as resumable work forever.
- When a run reaches `remaining === 0`, mark it complete and remove the resumable local state.

4. Wire live stats to cleanup stale resume state
- After `fetchStats()` finishes in `ProcessingTab`, if:
  - `!running`
  - `stats.unprocessed === 0`
  - `stats.failed === 0`
  - and persisted logs exist
- then clear the stale resume state automatically.
- This will prevent completed runs from showing “Resume Processing” after a refresh.

5. Tighten the copy so the tab is self-consistent
- If there are old logs but no pending work, either:
  - hide the warning entirely, or
  - replace it with a neutral “Previous run completed” message
- Keep the CTA disabled only because there is nothing left to process, not because the tab falsely thinks a run is paused.

6. QA to verify before handing back
- Case A: fully complete queue
  - no resume warning
  - no misleading “Resume Processing” CTA
  - stats remain 100% and consistent
- Case B: interrupted run with pending work
  - resume warning appears
  - button says “Resume Processing”
- Case C: after Reset All Links
  - logs are cleared
  - button returns to “Start Processing”
- Case D: refresh/reopen page after completion
  - stale logs no longer create incorrect details

Technical notes
- No database migration needed.
- No backend function change required for this fix.
- Main files to update:
  - `src/pages/Links.tsx`
  - `src/services/linkProcessingService.ts`

Optional polish
- Rename the “Processed” stat to “Resolved” if you want the wording to match what the backend is actually counting (`unshortened_url is not null`).
