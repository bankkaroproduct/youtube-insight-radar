

# Add Description Column to CSV Exports

## Changes

### 1. Videos CSV (`src/pages/Videos.tsx`)
Add "Description" column to the headers array (after "Title") and include `v.description || ""` in the row data.

- Line 95: Add `"Description"` to headers after `"Title"`
- Line 116: Add `v.description || ""` after `v.title`

### 2. Channels CSV (`src/pages/Channels.tsx`)
Add "Description" column to the headers array and include `ch.description || ""` in the row data.

- Line 63: Add `"Description"` to headers after `"Channel Name"`
- Line 74: Add `ch.description || ""` after `ch.channel_name`

Note: The `channels` table already has a `description` column and the channels data is already fetched with `select("*")`. For videos, `description` is already part of the Video interface and fetched data.

## Files Modified
1. `src/pages/Videos.tsx` — add Description column to CSV export
2. `src/pages/Channels.tsx` — add Description column to CSV export

