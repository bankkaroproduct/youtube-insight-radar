

# Build Out Keywords, Videos, and Channels Pages

## Database Tables (3 new tables via migrations)

### `keywords` table
- `id` (uuid, PK), `user_id` (uuid, NOT NULL), `keyword` (text), `search_volume` (integer), `competition` (text: low/medium/high), `status` (text: active/paused), `created_at`, `updated_at`
- RLS: users see own keywords, admins see all

### `tracked_videos` table
- `id` (uuid, PK), `user_id` (uuid, NOT NULL), `video_url` (text), `title` (text), `channel_name` (text), `views` (bigint), `likes` (bigint), `published_at` (timestamptz), `status` (text: tracking/archived), `created_at`
- RLS: users see own videos, admins see all

### `tracked_channels` table
- `id` (uuid, PK), `user_id` (uuid, NOT NULL), `channel_url` (text), `channel_name` (text), `subscriber_count` (bigint), `video_count` (integer), `category` (text), `business_fit_score` (integer, 0-100), `status` (text: tracking/archived), `created_at`
- RLS: users see own channels, admins see all

## Page UIs

### Keywords Page (`src/pages/Keywords.tsx`)
- Header with "Add Keyword" button opening a dialog
- Table listing keywords with columns: Keyword, Search Volume, Competition (badge), Status (badge), Date Added, Actions (edit/delete)
- Search/filter bar
- CRUD operations via Supabase

### Videos Page (`src/pages/Videos.tsx`)
- Header with "Add Video" button (paste YouTube URL)
- Card/table view showing: thumbnail placeholder, title, channel, views, likes, published date, status
- Search/filter bar
- CRUD operations

### Channels Page (`src/pages/Channels.tsx`)
- Header with "Add Channel" button (paste channel URL)
- Table/card view: channel name, subscribers, video count, category, business fit score (progress bar), status
- Search/filter bar
- CRUD operations

## Files Modified/Created
- **Migration SQL** — create 3 tables with RLS policies
- `src/pages/Keywords.tsx` — full CRUD UI
- `src/pages/Videos.tsx` — full CRUD UI
- `src/pages/Channels.tsx` — full CRUD UI

All pages will use consistent design with the existing dashboard styling (Poppins font, shadcn/ui components, colored badges, hover effects).

