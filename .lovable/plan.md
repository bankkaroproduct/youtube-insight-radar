

# Fix: Add Keyword Button and Excel Upload Not Visible

## Problem

The "Add Keyword" button and the Excel Upload card are **hidden behind an admin check**. In `Keywords.tsx`:
- Line 92: `{isAdmin && <AddKeywordDialog ... />}` 
- Line 100: `{isAdmin && <ExcelUploadCard ... />}`

Your account does not have the `admin` or `super_admin` role in the `user_roles` table, so `isAdmin` is `false` and these components are not rendered.

## Solution Options

**Option A (recommended):** Assign your user the `admin` role in the database so admin-gated features become visible.

**Option B:** Remove the `isAdmin` guard so all authenticated users can add keywords and upload Excel files.

## Plan

1. **Check your user ID** in the database and insert an `admin` role into `user_roles` for your account.
2. **Keep the admin guard** on destructive actions (delete) but **remove the admin guard** from Add Keyword and Excel Upload so all users can contribute keywords — or keep them admin-only if that's your intent.

I'll go with **Option A** — assign your account the admin role, so all admin features work. If you also want to remove the admin restriction from these buttons for all users, let me know.

