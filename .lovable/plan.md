

## Diagnose & relieve unresponsive backend

The unresponsiveness is **not in the React code**. Network logs show `504 upstream timeout` and `IDLE_TIMEOUT (150s)` on trivial queries (`user_profiles`, `user_roles`, `check-ip`, `fetch_jobs`). The Lovable Cloud instance / database is overloaded — every page load stalls in auth bootstrap because even a single-row `user_profiles` lookup never returns.

### Likely cause

Heavy recent workloads (recompute-stats over ~340 channels, backfill-to-50 sequential loops, `process-fetch-queue`, `scrape-channel-links`) are saturating the DB connection pool and CPU. New requests sit in queue past the 150s gateway timeout and fail.

### Two-track fix

**Track 1 — Immediate relief (user action, no code change)**

Upgrade the Lovable Cloud instance so the backend can absorb concurrent edge-function load + interactive queries:

- Project → **Cloud** (Connectors) → **Advanced settings** → **Upgrade instance**
- Docs: https://docs.lovable.dev/features/cloud#advanced-settings-upgrade-instance

If upgrade is unavailable, the workspace plan may need to change. Resizing takes a few minutes; the app will stay slow until it completes.

**Track 2 — Code hardening (after upgrade, prevents recurrence)**

1. **Stop background loops from starving the pool.** In `useChannels.ts > recomputeStats` and `Channels.tsx > backfillTo50`, add a small inter-batch delay (e.g. `await sleep(500)`) so simple reads can interleave; today batches fire back-to-back.
2. **Cap concurrency on the server.** In `compute-channel-stats`, `fetch-channel-videos`, and `process-fetch-queue` edge functions, ensure each invocation uses ONE Postgres client (no per-row clients) and `await`s sequentially within the batch — verify no `Promise.all` over many DB writes.
3. **Auth bootstrap timeout guard.** In `useAuth.tsx`, wrap the initial `user_profiles` / `user_roles` fetch in a `Promise.race` with a 5s timeout and render the app in a degraded state if it loses, so a slow DB doesn't freeze the entire UI on `/auth`.
4. **Single-flight guard for heavy jobs.** Add a DB row in a `running_jobs` table (or a simple `localStorage` flag) so refreshing the tab during a recompute can't kick off a parallel run.

### Files touched (Track 2)

- `src/hooks/useChannels.ts` — add 500ms `await sleep` between batches in `recomputeStats`.
- `src/pages/Channels.tsx` — same delay in `backfillTo50`.
- `src/hooks/useAuth.tsx` — `Promise.race` timeout around initial profile/role fetch + fallback render.
- `supabase/functions/compute-channel-stats/index.ts` — confirm sequential DB writes, single client.

### Not in scope

- No schema changes.
- No new tables or RLS edits.
- We will NOT touch `src/integrations/supabase/{client,types}.ts`.

### Order of operations

1. **You upgrade the Cloud instance first** (Track 1) — this restores responsiveness right now.
2. After it's back, approve Track 2 and I'll apply the code hardening so this doesn't recur next backfill.

