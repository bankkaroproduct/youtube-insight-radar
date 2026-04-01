

# Remove Zero-Video Channels from Database

## What We'll Do

Delete all rows from the `channels` table where `total_videos_fetched = 0` (the ~862 empty channels causing the count mismatch). After deletion, the Channels page count will match the Videos page unique channels count.

Additionally, remove the "Include 0-video channels" toggle from the Channels page since there won't be any empty channels left.

## Technical Details

| Step | Detail |
|------|--------|
| **1. Delete empty channels** | `DELETE FROM channels WHERE total_videos_fetched = 0` via the insert tool |
| **2. Clean up UI** | Remove `showEmpty`/`setShowEmpty` toggle from `src/pages/Channels.tsx` |
| **3. Simplify hook** | Remove `showEmpty` state and filter logic from `src/hooks/useChannels.ts` |
| **4. Fix Channels DB count** | Remove the `showEmpty` conditional from the DB count query in `src/pages/Channels.tsx` — just count all channels |

