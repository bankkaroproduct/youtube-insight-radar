

# Keyword Management Module — Implementation Plan

This is a large module with database tables, edge functions, AI integration, real-time subscriptions, and two full pages. It will be implemented in **4 phases** across multiple implementation steps.

---

## Phase 1: Database Schema & Core Tables

### Migration: Create new tables

**Drop existing `keywords` and `tracked_videos` tables** (they have a different schema than what's needed) and create:

1. **`channel_categories`** — lookup table with `id`, `name`, `description`, `business_aim`. RLS: readable by all authenticated users, writable by admins.

2. **`keywords_search_runs`** — main keywords table with all columns from spec (`keyword`, `category`, `business_aim`, `source`, `source_name`, `user_id`, `status`, `priority`, `estimated_volume`, `last_priority_fetch_at`, `run_date`, `created_at`). RLS: all authenticated can read; admins can insert/update/delete.

3. **`fetch_jobs`** — job queue with `keyword_id` (FK to keywords_search_runs), `keyword`, `status`, `videos_found`, `order_by`, `published_after`, `variations_searched` (text[]), `error_message`, `created_at`, `started_at`, `completed_at`. RLS: all authenticated can read; admins can insert/update/delete. Enable realtime.

4. **`get_keyword_stats` RPC** — SQL function returning `keyword_id`, `video_count`, `link_count` via aggregation. Initially returns 0 for video/link counts since videos/video_links tables don't exist yet — will be updated later.

### Seed data
Insert a few default `channel_categories` (e.g., "Technology", "Finance", "Health", "Education").

---

## Phase 2: Keywords Management Page (`/keywords`)

### Components to create:

- **`src/pages/Keywords.tsx`** — full rewrite of existing placeholder
- **`src/components/keywords/AddKeywordDialog.tsx`** — dialog with keyword input, category dropdown (from `channel_categories`), business aim dropdown (auto-fills from category)
- **`src/components/keywords/ExcelUploadCard.tsx`** — file input for .xlsx/.xls, parses with `xlsx` library, download template button
- **`src/components/keywords/KeywordFilters.tsx`** — filter card with keyword search, category, business aim, status, source, uploaded by, priority dropdowns + clear button
- **`src/components/keywords/FetchSettingsCard.tsx`** — video ranking dropdown, published after date picker with quick date buttons, reset button
- **`src/components/keywords/BulkActionBar.tsx`** — appears on selection, shows count + settings, "Fetch Videos" button
- **`src/components/keywords/KeywordsTable.tsx`** — full table with checkbox selection, all columns from spec (keyword, priority badge, category, business aim, last fetched, variations, videos, settings, source, status, actions)
- **`src/components/keywords/FetchQueueCard.tsx`** — collapsible card showing last 20 jobs with real-time updates, kill all / clear finished buttons
- **`src/hooks/useKeywords.ts`** — data fetching, filtering, CRUD operations
- **`src/hooks/useFetchJobs.ts`** — fetch job management with real-time subscription

### Sidebar update
Add "Keyword Table" link to sidebar under Discovery group.

### Route update
Add `/keyword-table` route in `App.tsx`.

---

## Phase 3: Edge Functions

1. **`supabase/functions/queue-fetch-jobs/index.ts`**
   - Accepts array of jobs or `action: 'kill-all'`
   - Admin-only (validate JWT + role check)
   - Inserts into `fetch_jobs` as pending

2. **`supabase/functions/expand-keyword/index.ts`**
   - Uses Lovable AI Gateway (google/gemini-3-flash-preview) to generate keyword variations
   - Returns array of variation strings

3. **`supabase/functions/analyze-keyword-priority/index.ts`**
   - Uses Lovable AI Gateway (google/gemini-2.5-flash) with tool calling
   - Classifies keywords into P1-P5 with estimated volume
   - Updates `keywords_search_runs` with priority and estimated_volume

4. **`supabase/functions/process-fetch-queue/index.ts`**
   - Picks pending jobs, updates to processing
   - Placeholder for YouTube API call (requires API key — will prompt user)
   - Updates job status on completion/failure

---

## Phase 4: Keyword Table Page (`/keyword-table`)

### Components:
- **`src/pages/KeywordTable.tsx`** — read-only analytics view
- **`src/components/keywords/KeywordStatsCards.tsx`** — 5 stat cards (total, completed, pending, videos, links)
- **`src/components/keywords/KeywordAnalyticsTable.tsx`** — filterable table with inline filter row
- **`src/components/keywords/KeywordLinksDialog.tsx`** — modal showing links grouped by video (placeholder until videos table exists)
- **`src/hooks/useUserPermissions.ts`** — permission check hook using existing `useAuth` roles

### Export functionality
Excel export respecting active filters using `xlsx` library.

---

## Technical Details

### Dependencies to install
- `xlsx` — Excel parsing and generation

### Priority color mapping
- P1: red (`bg-red-100 text-red-800`)
- P2: orange (`bg-orange-100 text-orange-800`)
- P3: yellow (`bg-yellow-100 text-yellow-800`)
- P4: blue (`bg-blue-100 text-blue-800`)
- P5: gray (`bg-gray-100 text-gray-800`)

### Real-time subscription pattern
```text
fetch_jobs table → postgres_changes (INSERT, UPDATE)
  → Update queue display
  → Toast on completion/failure
  → Refresh keywords list on completion
  → Deduplicate toasts via Set<job_id>
```

### Files created/modified (total ~20 files)
- 1 migration SQL file
- 4 edge functions
- 8-10 new React components
- 2-3 new hooks
- Modified: `App.tsx`, `AppSidebar.tsx`, `Keywords.tsx`

### YouTube API key
The `process-fetch-queue` function needs a YouTube Data API key. I will prompt you to provide this secret when we reach Phase 3.

