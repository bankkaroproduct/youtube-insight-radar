

# Enable Auto-Confirm for Email Signups

The sign-in is failing because email confirmation is required. Since this is the admin account, I'll enable auto-confirm so users can sign in immediately without needing to verify their email.

## Steps

1. **Enable auto-confirm** using the `configure_auth` tool to skip email verification for signups
2. **Delete the existing unconfirmed account** for `shruti.kratik123@icloud.com` (since it's stuck in unconfirmed state)
3. User can then **re-register** and sign in immediately

## Technical Details

- Use `cloud--configure_auth` to set `enable_signup: true` and `double_confirm_email_changes: false` with auto-confirm enabled
- Run a migration to delete the existing unconfirmed user record so a fresh signup works cleanly

