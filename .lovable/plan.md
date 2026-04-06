

# Separate Instagram Profiles Page + Auto-Scraping

## Overview
Create a dedicated `/instagram` page for viewing Instagram profile data, remove the manual "Scrape Instagram" button from Channels, and make IG scraping happen automatically when channels are processed.

## Changes

### 1. New page: `src/pages/InstagramProfiles.tsx`
- Fetch all `instagram_profiles` rows with a join to `channels` for channel name
- Table columns: Username, Channel Name, Full Name, Bio, Followers, Following, Posts, Business Category, Contact Email, Phone, External URL, Scraped At
- Search filter (username, channel name, full name)
- Sortable headers for followers, following, post count
- CSV download button for IG-specific data
- "Scrape Now" button to manually trigger for any missing/stale profiles (keeps the ability but on the right page)

### 2. `src/components/AppSidebar.tsx`
- Add "Instagram" entry to `intelligenceItems` array with `Instagram` icon from lucide-react, linking to `/instagram`

### 3. `src/App.tsx`
- Import `InstagramProfiles` component
- Add route: `/instagram` → `<ProtectedRoute><InstagramProfiles /></ProtectedRoute>`

### 4. `src/pages/Channels.tsx`
- Remove `scrapingIG` state, `scrapeInstagramProfiles` function, and the "Scrape Instagram" button
- Keep `igProfiles` fetch and IG Followers column in the table (useful context)

### 5. Auto-scrape: `supabase/functions/fetch-channel-videos/index.ts`
- At the end (where it already fire-and-forgets `process-video-links` and `compute-channel-stats`), add a fire-and-forget call to `scrape-instagram-profiles` with the processed `channelIds`
- This means whenever new channel videos are fetched, Instagram profiles get scraped automatically

### 6. No database changes needed

## Technical Details
- The `fetch-channel-videos` function already has a pattern for fire-and-forget downstream calls (lines 278-285). We add one more for `scrape-instagram-profiles` passing the channel IDs that were just processed.
- The `scrape-instagram-profiles` function already handles filtering out recently scraped profiles (within 7 days), so duplicate calls are safe.

