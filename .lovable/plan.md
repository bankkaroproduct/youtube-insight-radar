

## Fix unresponsive screen on Channels page

The page freezes because the Recompute Stats loop runs ~340 sequential edge function calls on the main thread with no progress feedback, no UI refresh, and aborts on any error. Combined with the auth bootstrap timeout warning, the app appears completely frozen.

### Root causes

1. **`recomputeStats` in `src/hooks/useChannels.ts`** — sequential `while(true)` / `for` loop awaits each batch (~340 calls × 1–3s = 5–15 min). UI shows no toast progress, no refresh until done, and any single error kills the whole run.
2. **`backfillTo50` loop in `src/pages/Channels.tsx`** — same pattern: hundreds of sequential `fetch-channel-videos` calls block the user from doing anything else.
3. **Auth bootstrap safety timeout** firing on `/auth` suggests session restore is also racing — but that's a symptom of the tab being busy, not the cause.

### What changes

**1. `src/hooks/useChannels.ts` — make `recomputeStats` resilient + observable**
- Show a single sticky `toast.loading` updated with progress (`Recomputed X / ~Y channels`).
- Continue past transient errors (log + count failures, don't `throw`).
- Refresh `load()` every 10 batches instead of only at the end, so user sees movement.
- On final completion, dismiss loading toast and show `toast.success` with success/failure counts.

**2. `src/pages/Channels.tsx` — same treatment for `backfillTo50`**
- Already has a progress toast — verify it dismisses cleanly on error.
- Wrap each iteration in try/catch so one 503 ("No available API keys") doesn't abort the whole run.
- Add a `Cancel` affordance: a ref-based `abortRef` checked each iteration so the user can stop a long run.

**3. Defensive: prevent double-clicks**
- Disable Recompute / Backfill buttons while their respective loops are in flight (track `isRecomputing` / `isBackfilling` state).

### Why this fixes "unresponsive"

The screen isn't actually frozen — React is responsive, but the user sees no feedback for 5–15 minutes and the action buttons stay clickable, so additional clicks pile on more concurrent loops. After the fix: visible progress, cancellable, single-flight, survives transient API-key-exhaustion errors.

### Files touched

- `src/hooks/useChannels.ts` — rewrite `recomputeStats` (progress toast, error tolerance, periodic refresh).
- `src/pages/Channels.tsx` — harden `backfillTo50` (try/catch per iteration, abort ref, button disable state).

### Not in scope

- No new DB functions, no edge function changes, no schema changes.
- The auth bootstrap warning will resolve on its own once the tab isn't blocked.

