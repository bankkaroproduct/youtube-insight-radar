

## Root cause found

Console shows `[AppSidebar] roles snapshot: { roles: Array(0), isAdmin: false }` but **`[useAuth] loaded roles:` never appeared**. That means `loadUserData` either deadlocked or never ran for the active session — which is why `isAdmin` is `false` even though the database confirms you have the `admin` role.

Two real bugs in `src/hooks/useAuth.tsx`:

1. **Supabase deadlock inside `onAuthStateChange`.** The handler does `await loadUserData(...)` directly inside the auth callback. Supabase explicitly warns this can deadlock the auth client because Supabase DB calls inside auth callbacks can hang while the auth lock is held. That matches what we see: no `loaded roles:` log at all.

2. **No retry on empty roles.** Even if `loadUserData` does run, the `user_roles` RLS policy is `auth.uid() = user_id`. On a freshly activated JWT there's a brief window where PostgREST doesn't yet see the user and returns `[]` with no error. We then set roles to `[]` and never recover until the 5-min poll.

### Fix

**`src/hooks/useAuth.tsx`**

1. Inside `onAuthStateChange`, defer all Supabase calls with `setTimeout(..., 0)` so the auth callback returns immediately and the lock is released. This is the official Supabase pattern.

2. In `loadUserData`, if the roles query returns `data.length === 0` and no error, wait 400 ms and retry once. If the retry returns rows, use those.

3. Remove the temporary `console.log` lines once the fix is verified.

**`src/components/AppSidebar.tsx`**

- Remove the temporary diagnostic log added in the previous step.

### Expected outcome

On reload: console shows `[useAuth] loaded roles: ["viewer", "admin"]` (possibly preceded by `roles retry succeeded`), `isAdmin` becomes `true`, and the Settings group with all four items (User Management, API Keys, IP Whitelist, Audit Log) appears in the sidebar.

### Files touched

- `src/hooks/useAuth.tsx` — defer DB calls in `onAuthStateChange`, add empty-roles retry in `loadUserData`, drop debug log
- `src/components/AppSidebar.tsx` — drop debug log

