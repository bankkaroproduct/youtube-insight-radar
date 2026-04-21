

## Goal

In **S5 — Channel Deep Data**, surface per-channel video coverage so reviewers can see whether the 50-video backfill is complete for each channel and how many videos that channel has on YouTube overall.

## Changes

**File:** `src/services/excelExportService.ts`

1. Extend the `Channel` type to include `total_videos_fetched` and `youtube_total_videos`.
2. Update both `fetchAll<Channel>(...)` select lists (in `ensureChannelLinksScraped` and the main `exportFullReport` fetch) to include those two columns.
3. In `buildSheet5`, add two new columns just before `Channel Description`:
   - **Videos Fetched (max 50)** — `ch.total_videos_fetched ?? 0`
   - **Total Videos on YouTube** — `ch.youtube_total_videos ?? "N/A"`
4. Update `S5` Social/Excluded column indexes in `exportFullReport` since the sheet grows from 17 → 19 columns: change `buildWorksheet(XLSX, s5, 15, 16)` to `buildWorksheet(XLSX, s5, 17, 18)`.

## Acceptance

- S5 shows two new columns per row: how many videos we have stored for the channel (capped at 50), and the channel's total uploads on YouTube.
- Channels with `total_videos_fetched < 50` are obvious at a glance.
- Sheet still classifies links via affiliate_patterns and merges scraped channel links as before.
- Social (blue) and Excluded (red) styling continues to highlight the correct columns after the index shift.

