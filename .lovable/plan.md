

## Goal
Add a "Forgot Password" flow so any user (including `shruti@cashkaro.com`) can reset their own password via email.

## What gets built

### 1. "Forgot password?" link on the login form
File: `src/pages/Auth.tsx` — add a small link under the password field on the Sign In tab that navigates to `/forgot-password`.

### 2. New page: `/forgot-password`
File: `src/pages/ForgotPassword.tsx`
- Simple form with one email field.
- On submit, calls:
  ```ts
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })
  ```
- Shows a success toast: "If an account exists for this email, a reset link has been sent." (Generic message — does not leak whether the email exists.)
- Link back to `/auth`.

### 3. New page: `/reset-password` (REQUIRED public route)
File: `src/pages/ResetPassword.tsx`
- Reads the recovery token from the URL hash (Supabase puts it there automatically).
- Shows a "New password" + "Confirm password" form.
- On submit, calls `supabase.auth.updateUser({ password })`.
- On success: toast + redirect to `/auth` to sign in with the new password.
- Handles the case where the link is expired/invalid with a clear error message.

### 4. Route registration
File: `src/App.tsx` — register both new routes as **public** (outside any auth guard), so users who are logged out can access them.

## How you'll use it (for the `shruti@cashkaro.com` account)
1. Go to `/auth`, click **Forgot password?**
2. Enter `shruti@cashkaro.com`, submit.
3. Check that inbox for the reset email from Lovable Cloud.
4. Click the link → land on `/reset-password` → set a new password → sign in.

## Notes
- Uses the default Lovable Cloud auth emails (no custom domain or template scaffolding needed). The reset email will arrive from the default sender.
- No DB changes, no new dependencies.
- If the reset email doesn't arrive, the most common causes are: spam folder, or the email isn't actually registered in the system — I can help diagnose either after we ship this.

