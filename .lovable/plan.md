

# Scrape Instagram Profiles via Apify

## Overview
Create an edge function that uses Apify's Instagram Profile Scraper to fetch full profile data (bio, stats, posts, contact info) for channels that have an `instagram_url`, store results in a new `instagram_profiles` table, and add a UI button on the Channels page to trigger the scrape.

## Prerequisites
- An Apify API key is needed. You don't currently have one stored. I'll need to request it via the secrets tool before proceeding.

## Database Changes

**New table: `instagram_profiles`**
- `id` uuid PK
- `channel_id` uuid (references channels.id)
- `instagram_username` text
- `full_name` text
- `bio` text
- `profile_pic_url` text
- `follower_count` integer
- `following_count` integer
- `post_count` integer
- `is_business` boolean
- `business_category` text
- `contact_email` text
- `contact_phone` text
- `external_url` text
- `recent_posts` jsonb (array of {url, caption, likes, comments, timestamp})
- `scraped_at` timestamptz
- `created_at` timestamptz

RLS: authenticated can read, admins can manage.

## Edge Function: `scrape-instagram-profiles`

1. Accepts `{ channel_ids?: string[] }` — if empty, finds all channels with `instagram_url` not yet scraped (or scraped >7 days ago)
2. Extracts Instagram usernames from the `instagram_url` column
3. Batches usernames (max 10 per Apify run) to avoid overloading
4. Calls Apify Instagram Profile Scraper API (`https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs`)
5. Polls for completion, then fetches results from the dataset
6. Upserts into `instagram_profiles` table
7. Also updates `channels.contact_email` if a new email is found from Instagram

## Frontend Changes

**Channels page (`src/pages/Channels.tsx`)**
- Add "Scrape Instagram" button next to existing action buttons
- Shows loading state while scraping
- On completion, refreshes channel list
- Add Instagram follower count column to the table

**Channels CSV export**
- Include Instagram follower count, bio, and business category from `instagram_profiles`

## Files to Create/Edit
1. **Migration** — create `instagram_profiles` table with RLS
2. **`supabase/functions/scrape-instagram-profiles/index.ts`** — Apify integration
3. **`src/pages/Channels.tsx`** — add scrape button and follower column
4. **`src/hooks/useChannels.ts`** — optionally join instagram profile data

