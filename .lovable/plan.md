

## Diagnose: Settings menu not visible

The DB confirms you have the `admin` role, so the issue is on the client side. Either roles aren't reaching the sidebar, or the sidebar is rendering with the wrong state. Need to add diagnostics to find out which.

### Step 1 — Add temporary diagnostic logging

**`src/hooks/useAuth.tsx`** — in `loadUserData`, log the actual query results and the resolved roles array, plus surface any RLS/network error from the `user_roles` query (which is currently swallowed):

```ts
if (profileRes.error) console.warn("[useAuth] profile query error", profileRes.error);
if (rolesRes.error) console.warn("[useAuth] roles query error", rolesRes.error);
console.log("[useAuth] loaded roles:", newRoles, "for user", userId);
```

**`src/components/AppSidebar.tsx`** — log what the sidebar sees right before it filters:

```ts
console.log("[AppSidebar] roles snapshot:", { isAdmin, roleCount: settingsItems.filter(i => !i.adminOnly || isAdmin).length });
```

### Step 2 — Reload, then read the console

Once these logs are in, on reload we'll see exactly one of three states:
- **`loaded roles: ["viewer", "admin"]`** + `isAdmin: true` → roles are fine; sidebar bug (e.g., stale `useAuth` instance, render order). I'll fix the sidebar.
- **`loaded roles: ["viewer"]`** (missing admin) → RLS or query is filtering admin out somehow. I'll check the `user_roles` RLS read path.
- **`roles query error: ...`** → a real error (RLS / network). I'll patch based on the message.

### Step 3 — Apply the targeted fix

Based on what the logs show, fix the actual root cause. Then remove the temporary `console.log` lines.

### Step 4 — As a parallel safety net (optional)

While we're in here, also make the Settings group hide its label when empty so that even when a non-admin loads the app, they don't see a stray "SETTINGS" header with nothing under it. In `AppSidebar.tsx`, change `renderGroup` to early-return `null` when the filtered list is empty.

### Files touched

- `src/hooks/useAuth.tsx` — temporary diagnostic logging
- `src/components/AppSidebar.tsx` — temporary log + hide empty group

Once we read the next round of console output we'll know the exact fix in one more iteration.

