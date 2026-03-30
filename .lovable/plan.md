

# Fix RLS Error on User Roles + Build IP Whitelist

## Issue 1: RLS Error on `user_roles`

The error "new row violates row-level security policy for table user_roles" occurs because the current user has "viewer" role (assigned by default on signup) and is trying to change roles. The RLS policies require `admin` or `super_admin` to insert/delete roles — but no one has admin yet.

### Fix
1. **Migration**: Grant the current user (`shruti.kratik123@icloud.com`) the `super_admin` role so they can manage other users. Look up their `user_id` from `user_profiles` and insert into `user_roles`.
2. **Also add an UPDATE policy** on `user_roles` for admins, since the current delete-then-insert pattern could fail mid-way. Better to have it covered.

## Issue 2: IP Whitelist Feature

Build a real IP-based access control system so only whitelisted IPs can use the app.

### Database: `ip_whitelist` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| ip_address | text NOT NULL | e.g. "203.0.113.5" |
| label | text | optional description |
| is_active | boolean | default true |
| created_by | uuid FK → auth.users | who added it |
| created_at | timestamptz | auto |

- UNIQUE on `ip_address`
- RLS: admin-only for all operations

### Edge Function: `check-ip`
- Called on app load to verify the user's IP is whitelisted
- Gets client IP from request headers (`x-forwarded-for`)
- Checks against `ip_whitelist` table
- Returns `{ allowed: true/false, ip: "x.x.x.x" }`

### UI: `src/pages/settings/IpWhitelist.tsx`
- Table of whitelisted IPs with label, status, added-by, date
- **Add IP** button with dialog (IP address + optional label)
- **"Add My Current IP"** quick button that auto-detects and adds the user's IP
- Toggle active/inactive per IP
- Delete IP button
- Show current user's IP at the top for reference

### Hook: `src/hooks/useIpWhitelist.ts`
- CRUD operations on `ip_whitelist` table
- `checkCurrentIp()` — calls the edge function

### App Integration
- On login, call `check-ip` edge function
- If IP not whitelisted and whitelist has entries, show a blocked screen
- If whitelist is empty, allow all (so the feature is opt-in)

## Files to Create/Modify
1. **Migration SQL** — grant super_admin to current user, add UPDATE policy on user_roles, create `ip_whitelist` table + RLS
2. **`supabase/functions/check-ip/index.ts`** — new edge function
3. **`src/hooks/useIpWhitelist.ts`** — new hook
4. **`src/pages/settings/IpWhitelist.tsx`** — full rewrite with management UI
5. **`src/App.tsx`** — add IP check on auth

