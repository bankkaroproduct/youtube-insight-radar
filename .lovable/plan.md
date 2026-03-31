

# Channel-Level Platform & Retailer Bifurcation with Video Counts and Market Share

## What You Get

Each channel will show **how many videos** use each affiliate platform and each retailer, with **market share percentages** displayed as tags. Plus a CSV/Excel download with full breakdowns.

## Changes

### 1. Update `compute-channel-stats` Edge Function

Currently stores just name arrays (`affiliate_platform_names`, `retailer_names`). Change to store **video count per platform/retailer** as JSONB objects instead of simple arrays.

**New channel columns** (migration):
- `platform_video_counts` (jsonb, default '{}') — e.g. `{"Impact.com": 12, "Awin": 5}`
- `retailer_video_counts` (jsonb, default '{}') — e.g. `{"Amazon": 18, "Flipkart": 7}`

**Edge function logic change**: For each channel, group links by video_id, then count distinct videos per platform_id and per retailer_id. Store as `{ "PlatformName": videoCount }` objects.

### 2. Update Channel Interface & Hook

Add `platform_video_counts` and `retailer_video_counts` to the `Channel` interface in `useChannels.ts`.

### 3. Update Channels Page — Display as Tags with Counts & Market Share

Replace the current simple badge lists in "Platforms" and "Retailers" columns with tags showing:
- Platform/Retailer name
- Video count
- Market share % (relative to total videos fetched for that channel)

Example tag: `Impact.com: 12 (48%)`

### 4. Add CSV/Excel Download Button

Add a "Download" button on the Channels page that exports a CSV with:
- Channel name, subscribers, total videos, median views/likes
- **One column per retailer** with video counts
- **One column per platform** with video counts
- Or alternatively: two summary columns with semicolon-separated `Name:Count` pairs

### 5. Summary of Files Changed

| File | Change |
|------|--------|
| Migration | Add `platform_video_counts` jsonb and `retailer_video_counts` jsonb to `channels` |
| `compute-channel-stats/index.ts` | Count videos per platform/retailer, store as JSONB |
| `src/hooks/useChannels.ts` | Add new fields to Channel interface |
| `src/pages/Channels.tsx` | Show tags with counts + %, add Download CSV button |

