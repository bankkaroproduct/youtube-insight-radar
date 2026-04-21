

## Fix: Blank screen on load

### Root cause

`ProtectedRoute` in `src/App.tsx` renders `null` while either `isLoading` is true or `ipCheck.checked` is false. In `src/hooks/useAuth.tsx`, the initial-session bootstrap (`supabase.auth.getSession().then(async ...)`) has **no try/catch**. If any await inside throws (network blip, IP check rejection, profile query error), the promise rejects silently and `setIsLoading(false)` is never called — leaving the app stuck on a permanent blank screen.

The console even shows `[vite] server connection lost` around the same window, which is exactly the kind of transient that would cause one of those awaits to reject mid-bootstrap.

Secondary issues found:
- The deactivation check re-queries `user_profiles` even though `loadUserData` already loaded the profile a line earlier — wasteful and adds another failure point.
- `loadUserData` itself has no error handling; a single failed query throws and bubbles up.
- The `onAuthStateChange` async handler also lacks try/catch around `loadUserData`, which can leave `isLoading` true after a token refresh failure.

### Changes

**`src/hooks/useAuth.tsx`**

1. Wrap the entire `getSession().then(async ...)` body in `try/catch/finally`. The `finally` block always sets `initialized = true` and `setIsLoading(false)`, plus marks `ipCheck` as checked with a safe fallback (`{ checked: true, allowed: true, ip: "unknown", error: true }` if the IP check never ran), so the app is never stranded.

2. Wrap the `onAuthStateChange` async handler body the same way — guarantee `setIsLoading(false)` runs.

3. Use the already-loaded `profile` from `loadUserData` for the deactivation check instead of re-querying. Removes the duplicate `user_profiles` fetch.

4. Add a try/catch inside `loadUserData` so a single failed sub-query doesn't poison the whole auth bootstrap. Default to empty profile/roles on failure and surface a toast.

5. Add a safety timeout (e.g. 8 seconds): if bootstrap hasn't finished by then, force `setIsLoading(false)` and mark `ipCheck.checked = true` so the user sees either the IP-blocked screen, the auth screen, or the app — never an indefinite blank.

**`src/App.tsx`** (small belt-and-braces change)

- Replace the two `return null` branches in `ProtectedRoute` with a tiny centered loading spinner so even if something hangs, the user sees a visible state instead of a white screen. This also helps debugging future regressions.

### Verification

After the fix:
- Hard reload `/` — should show spinner briefly, then the dashboard.
- Throttle network in DevTools and reload — should still resolve to either dashboard, IP-blocked screen, or `/auth`, never a permanent blank.
- The existing `useDashboard` 60s auto-refresh and error banner continue to work unchanged.

### Files touched

- `src/hooks/useAuth.tsx` — error-hardened bootstrap, dedup deactivation check, safety timeout
- `src/App.tsx` — replace `return null` with a small loading state in `ProtectedRoute`

