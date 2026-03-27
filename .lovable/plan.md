

# YouTube Competitor Intelligence & Affiliate Tracking Platform

## Phase 1: Foundation & Auth
- Set up Supabase with Lovable Cloud (Postgres, Auth, Edge Functions)
- Email/password authentication with login/signup pages
- User roles system: `super_admin`, `admin`, `manager`, `analyst`, `viewer` using `app_role` enum + `user_roles` table + `has_role()` security-definer function
- `user_profiles` table linked to `auth.users` with auto-creation trigger
- IP whitelist table and access control middleware
- Admin user management panel (create/edit/deactivate users, assign roles)

## Phase 2: App Shell & Navigation
- Collapsible sidebar with YouTube branding (red accent `#FF0000`, YouTube icon)
- Grouped navigation sections: Discovery, Intelligence, CRM, Settings
- Responsive layout with mobile sidebar collapse
- Skeleton loading components, toast notification system
- Role-based route protection and menu visibility

## Phase 3: Keyword Management
- `keywords` table with category, priority, status, fetch history tracking
- CRUD UI with data table (pagination, sorting, filters)
- Fetch queue system: batch-queue keywords for YouTube video discovery
- Edge function: `expand-keyword` — AI-powered keyword expansion from seed terms
- Edge function: `fetch-youtube-videos` — YouTube Data API integration to discover videos per keyword
- API key management table with quota tracking and daily reset

## Phase 4: Video Discovery & Intelligence
- `videos` table storing full metadata (title, description, views, likes, comments, published date, thumbnail, keyword association)
- Video listing with filters: keyword, date range, view count, like count, affiliate status
- Bulk CSV export respecting all active filters
- Filter chips with clear-all functionality
- Edge function: `categorize-content` — AI video categorization (product review, tutorial, comparison, etc.)
- Edge function: `analyze-video-sentiment` — AI sentiment analysis
- Edge function: `backfill-video-stats` — bulk refresh video statistics

## Phase 5: Channel Intelligence
- `channels` table auto-populated when videos are discovered (title, subscribers, video count, country, description, email)
- Channel detail page with notes, POC assignment, business fit score display
- Filter by subscriber range, country, POC, business fit score, affiliate status
- Edge function: `scrape-channel-videos` — fetch latest videos for a channel
- Edge function: `analyze-business-fit` — AI scoring (0-100) of channel relevance
- Edge function: `detect-channel-country` — AI country detection from metadata
- Edge function: `summarize-channel-notes` — AI note summarization
- Bulk country detection and email re-fetch capabilities

## Phase 6: Link Processing Pipeline
- `links` table for extracted URLs from video descriptions
- `link_queue` table with status tracking (pending → processing → done/failed)
- `affiliate_patterns` table for configurable regex-based pattern matching
- Affiliate pattern management UI (add/edit/delete with brand, regex, type)
- Link classification: OWN, COMPETITOR, NEUTRAL
- Manual link resolver tool for individual URL testing
- Edge function: `process-video-links` — extract and store links from descriptions
- Edge function: `process-link-queue` — batch URL unshortening/resolution
- Edge function: `manage-affiliate-patterns` — CRUD for patterns
- Supabase Realtime on link processing queue for live status updates

## Phase 7: CRM & Task Management
- `influencers` table with lifecycle status (new → qualified → converted → churned)
- `tasks` table with types (review, outreach-prep, follow-up, content-check, general), priority levels, assignee, due date
- `task_activities` table for timeline (status changes, comments, notes)
- Task list with filters by status, priority, assignee, due date
- Channel notes sheet with history
- Task detail view with activity timeline

## Phase 8: Automated Triggers
- `triggers` table with configurable conditions and actions
- Trigger conditions: subscriber count, view count, affiliate link status, business fit score, country
- Trigger actions: create CRM task, update channel status
- `trigger_runs` table for execution history with match counts
- Preview matches before activating, enable/disable toggles
- Edge function: `evaluate-triggers` — run trigger rules against channel/video data

## Phase 9: Dashboard & Analytics
- Global stats cards: total keywords, videos, channels, links processed
- Affiliate link distribution chart (own vs competitor vs neutral) using Recharts
- Channel conversion funnel visualization
- POC performance breakdown (channels per POC, conversion rates)
- API key quota usage tracking with daily reset display
- Auto-refresh toggle on data tables

## Phase 10: Settings & Admin Polish
- API key management UI with quota limits and usage tracking
- Scraper configuration page (run history, manual trigger)
- IP whitelist management UI
- IP access logs and user activity logs
- RLS policies on all tables using `has_role()` function
- Edge function: `manage-api-keys` — API key lifecycle

