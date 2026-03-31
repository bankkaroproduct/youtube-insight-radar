

# Add Download Button to Videos + Enhance Channels Tab

## Changes

### 1. Videos tab — Add CSV download with market share columns (`src/pages/Videos.tsx`)

Add a `downloadVideosCSV` function and a "Download CSV" button next to the Refresh button. The CSV will include:

- Video ID, Title, Channel Name, Keywords, Rank, Views, Likes, Comments, Published Date, Total Links
- For each unique platform across all videos: two columns — `Platform: {name} (count)` and `Platform: {name} (%)` 
- For each unique retailer across all videos: two columns — `Retailer: {name} (count)` and `Retailer: {name} (%)`

Percentage = `count / total_links * 100`, rounded to nearest integer.

### 2. Channels tab — Add percentage columns to CSV export (`src/pages/Channels.tsx`)

Update `downloadCSV` to add `%` columns alongside the existing count columns:
- `Platform: {name}` (count) → add `Platform: {name} (%)` = `count / total_videos * 100`
- `Retailer: {name}` (count) → add `Retailer: {name} (%)` = `count / total_videos * 100`

### 3. Channels tab — Add Channel Link column (`src/pages/Channels.tsx`)

Add a "Channel Link" column showing the YouTube channel URL as a clickable link (the channel name already links, but add an explicit column with the URL visible/copyable).

### 4. Channels tab — Add "Videos" link column (`src/pages/Channels.tsx`)

Add a "Videos" column with a link that navigates to `/videos?channel={channel_name}`, allowing users to see all videos for that channel.

### 5. Videos tab — Support channel filter from URL (`src/pages/Videos.tsx`)

Read `?channel=` query param from the URL on mount and pre-fill the channel filter, so the link from Channels tab works.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Videos.tsx` | Add `downloadVideosCSV`, Download CSV button, read `?channel` query param |
| `src/pages/Channels.tsx` | Add `%` columns to CSV, add Channel Link column, add Videos link column |

