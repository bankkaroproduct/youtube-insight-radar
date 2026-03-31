

# India-Only Filter, No Reels, Clickable Video Titles, and Fix Stat Cards

## Changes

### 1. Filter fetches to India-only channels and exclude Shorts/Reels (`supabase/functions/process-fetch-queue/index.ts`)

Add `regionCode: "IN"` to the YouTube Search API params (line ~174) so only Indian results are returned. Also filter out YouTube Shorts/Reels by checking video titles — exclude videos where the title contains "#shorts" or the video ID appears in a Shorts URL pattern. Additionally, after fetching video details, skip any video with a duration under 60 seconds (requires adding `contentDetails` to the `part` param on line 239) to reliably exclude Shorts.

**Specific changes:**
- Add `regionCode: "IN"` param to the search request (line ~174)
- Add `contentDetails` to the video details `part` param to get duration
- Parse ISO 8601 duration and skip videos shorter than 60 seconds
- This ensures only Indian, non-Shorts videos are stored

### 2. Make video title a clickable link to YouTube (`src/pages/Videos.tsx`)

Replace the plain `ExpandableText` title (line 339) with an anchor tag wrapping it, linking to `https://www.youtube.com/watch?v={video_id}`. Open in new tab. Remove or keep the external link icon column as redundant (keep it for now).

### 3. Fix stat cards to use filtered data (`src/pages/Videos.tsx`)

Currently stat cards (line 208-224) use `videos` (all data) rather than `filteredAndSorted`. Update the `stats` useMemo to compute from `filteredAndSorted` so the cards reflect what the user is currently seeing (matching the screenshot reference showing contextual counts).

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/process-fetch-queue/index.ts` | Add `regionCode: "IN"`, add `contentDetails` part, filter out Shorts (<60s) |
| `src/pages/Videos.tsx` | Wrap title in YouTube link, update stats to use filtered data |

