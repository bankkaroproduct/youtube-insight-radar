# YouTube Insight Radar

Competitor intelligence and affiliate tracking for YouTube. Built on Vite + React + Supabase.

## What it does
- Track keywords and discover videos via the YouTube Data API with rotating keys.
- Analyze channels (subscribers, medians, affiliate status) and their Instagram presence.
- Classify video description links by affiliate platform / retailer / social / neutral.

## Stack
- Frontend: Vite, React 18, Tailwind, shadcn/ui, TanStack Query, React Router.
- Backend: Supabase (Postgres + edge functions, Deno).
- Auth: Supabase email + password with role-based access (`viewer`, `editor`, `admin`, `super_admin`).

## Setup
1. `bun install`
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID`.
3. Run migrations from `supabase/migrations/` against your Supabase project.
4. Enable `pg_cron` and `pg_net` in the Supabase dashboard under Database → Extensions.
5. Deploy edge functions in `supabase/functions/`.
6. `bun dev`.

## Notes
- YouTube API quota resets daily; keys auto-rotate and self-heal via `reset_daily_quotas_if_stale`.
- IP whitelist fails closed; super-admins bypass.
- Link processing persists batch state in localStorage; refresh does not auto-resume.
