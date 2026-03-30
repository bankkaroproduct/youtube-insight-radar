

# Full Video Pipeline: Fetch, Store, Analyze Channels & Links

## Overview

This is a large feature spanning the entire data pipeline: fetching YouTube videos, extracting description links, unshortening URLs, classifying affiliates, computing channel statistics, and building UI for all of it.

## Data Flow

```text
Keywords → YouTube Search → Videos (store) 
  → Extract Description Links → Unshorten URLs 
  → Classify (OUR / COMPETITOR / NEUTRAL) via Affiliate Patterns
  → Aggregate into Channel stats (median views/comments, affiliate status)
```

## Database Tables

### 1. `videos` (new)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| video_id | text UNIQUE | YouTube video ID |
| keyword_id | uuid FK → keywords_search_runs | which keyword found it |
| channel_id | text | YouTube channel ID |
| channel_name | text | |
| title | text | |
| description | text | full description text |
| thumbnail_url | text | |
| published_at | timestamptz | |
| view_count | bigint | fetched via videos.list |
| like_count | bigint | |
| comment_count | bigint | |
| created_at | timestamptz | |

### 2. `video_links` (new)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| video_id | uuid FK → videos | |
| original_url | text | raw URL from description |
| unshortened_url | text | after following redirects |
| domain | text | extracted domain |
| classification | text | 'OWN', 'COMPETITOR', 'NEUTRAL' |
| matched_pattern_id | uuid FK → affiliate_patterns | which pattern matched |
| created_at | timestamptz | |

### 3. `affiliate_patterns` (new)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| pattern | text | regex or domain pattern (e.g. `cashkaro.com`, `wishlink.com`) |
| name | text | display name (e.g. "CashKaro", "Wishlink") |
| classification | text | 'OWN', 'COMPETITOR', 'NEUTRAL' |
| is_auto_discovered | boolean | true if found during unshortening |
| is_confirmed | boolean | false until admin reviews |
| created_at | timestamptz | |

### 4. `channels` (new — replaces placeholder `tracked_channels`)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| channel_id | text UNIQUE | YouTube channel ID |
| channel_name | text | |
| channel_url | text | |
| subscriber_count | bigint | |
| total_videos_fetched | integer | how many we found |
| median_views | bigint | computed skipping first/last 5 |
| median_likes | bigint | |
| median_comments | bigint | |
| affiliate_status | text | 'WITH_US', 'COMPETITOR', 'NEUTRAL', 'MIXED' |
| affiliate_names | text[] | e.g. ['CashKaro', 'Wishlink'] |
| last_analyzed_at | timestamptz | |
| created_at | timestamptz | |

RLS: All tables admin-only for write, authenticated for read.

## Edge Functions

### Update `process-fetch-queue`
After YouTube search, for each video result:
1. Call `videos.list` (part=snippet,statistics) to get view/like/comment counts and full description (costs 1 unit per video)
2. Insert into `videos` table
3. Extract all URLs from description using regex
4. Insert raw URLs into `video_links`

### New: `process-video-links`
- Picks unprocessed `video_links` (where `unshortened_url IS NULL`)
- Follows redirects (HEAD requests) to unshorten URLs
- Extracts domain from final URL
- Matches against `affiliate_patterns`:
  - If match found → set classification from pattern
  - If no match and domain looks like an affiliate (contains tracking params, known shortener domains) → insert as auto-discovered pattern with `is_confirmed = false`
  - If no match → classify as NEUTRAL
- After all links for a channel are processed, compute channel aggregates

### New: `compute-channel-stats`
- For a given channel_id, fetches all its videos from `videos` table
- Sorts by view_count, skips first 5 and last 5
- Computes median of remaining for views, likes, comments
- Checks all `video_links` for this channel:
  - If any OWN link exists → `affiliate_status = 'WITH_US'`
  - If only COMPETITOR links → `affiliate_status = 'COMPETITOR'`
  - If both → `affiliate_status = 'MIXED'`
  - If none → `affiliate_status = 'NEUTRAL'`
- Collects distinct competitor names into `affiliate_names`
- Upserts into `channels` table

## UI Pages

### Videos Page (`/videos`)
- Table of all fetched videos: thumbnail, title, channel, views, likes, comments, published date, keyword
- Filter by keyword, channel, date range
- Link count badge per video

### Channels Page (`/channels`)
- Table: channel name, subscriber count, median views, median comments, affiliate status badge, affiliate names
- Color-coded status: WITH_US (green), COMPETITOR (red), MIXED (orange), NEUTRAL (gray)
- Click to expand → see all videos for that channel

### Links Page (`/links`) — Affiliate Patterns
Two tabs:
1. **Affiliate Patterns** — manage known patterns
   - Table: pattern, name, classification (OWN/COMPETITOR/NEUTRAL), confirmed status
   - Add Pattern button (manual entry)
   - Pre-seed common ones: CashKaro, Wishlink, Lela, Hypd, etc.

2. **Discovered Patterns** — auto-discovered unconfirmed patterns
   - Shows new domains/patterns found during link unshortening
   - Admin can mark each as OWN, COMPETITOR, or NEUTRAL → moves to confirmed
   - Bulk actions for quick classification

### Sidebar Update
- Rename "Links" to "Affiliates" in sidebar intelligence section

## Files to Create/Modify

1. **Migration SQL** — 4 new tables + RLS + realtime on videos
2. **`supabase/functions/process-fetch-queue/index.ts`** — extend to store videos + extract links
3. **`supabase/functions/process-video-links/index.ts`** — new: unshorten + classify
4. **`supabase/functions/compute-channel-stats/index.ts`** — new: median calc + affiliate status
5. **`src/pages/Videos.tsx`** — full video listing UI
6. **`src/pages/Channels.tsx`** — channel intelligence with stats
7. **`src/pages/Links.tsx`** — affiliate patterns management (2 tabs)
8. **`src/hooks/useVideos.ts`** — new hook
9. **`src/hooks/useChannels.ts`** — new hook
10. **`src/hooks/useAffiliatePatterns.ts`** — new hook
11. **`src/components/AppSidebar.tsx`** — rename Links to Affiliates

## Median Calculation Logic

```text
Given N videos for a channel, sorted by view_count:
- If N <= 10: use all videos for median
- If N > 10: skip first 5 and last 5, take median of remaining
Median = middle value (or average of two middle values)
```

## Security
- All new tables: admin-only write, authenticated read (same pattern as existing)
- Edge functions use service role key
- Affiliate pattern management admin-only

