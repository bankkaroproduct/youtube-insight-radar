

# Plan: Comprehensive Excel Export Matching Spec

## Goal
Add a new "Export to Excel" feature that generates a single `.xlsx` file with 8 sheets (spec covers 6 — I'll confirm whether the remaining 2 should be added). The file follows precise formatting rules: bold grey headers, frozen row 1, thin black borders, Arial 10, color-coded text (red for Excluded, blue for Social Platform, grey italic for placeholders).

## Where to add it
A new "Export Full Report" button on the **Videos page** (top action bar, next to existing actions). Triggers a client-side build using the existing `xlsx` library (already a dependency).

## Data sources (all in Supabase)
| Sheet | Source tables |
|---|---|
| S1 Video Channel Map (Keywords) | `videos` ⨝ `video_keywords` ⨝ `keywords_search_runs` |
| S2 Video Deep Data (Keywords) | S1 + `video_links` |
| S3 Last 50 Videos Deep Data | `videos` (no `video_keywords` row) + `video_links` |
| S4 Last 50 Channel Map | Same as S3, aggregated |
| S5 Channel Deep Data | `channels` + channel description links (parsed from `channels.description`) |
| S6 Contact Info | `channels` + `instagram_profiles` |

"Last 50" videos are identified as videos whose `id` is **not** in `video_keywords` (channel-fetched, not keyword-searched).

## Implementation steps

### 1. New file: `src/services/excelExportService.ts`
- `fetchAllExportData()` — paginated fetch (1000-row chunks) of all videos, links, keywords, channels, instagram profiles.
- `buildSheet1..Sheet6()` — pure functions that produce 2D arrays of row objects.
- `applySheetFormatting(ws, rowCount, colCount, options)` — applies borders, header style, freeze panes, column widths, and per-cell text colors (red for Excluded, blue for Social, grey italic for placeholders) using `xlsx-js-style` (need to add — `xlsx` alone doesn't support cell styles in community build).
- `exportFullReport()` — orchestrates, builds workbook, triggers download.

### 2. Helper utilities
- `splitKeywords(video)` — produces one row per keyword for S1/S2.
- `classifyLink(link)` — uses existing `video_links` columns (`affiliate_platform`, `resolved_retailer`, `classification`, `domain`) plus a `SOCIAL_DOMAINS` map (instagram.com, facebook.com, twitter.com, x.com, wa.me, t.me, snapchat.com, linkedin.com, pinterest.com, threads.net, spotify.com, discord.gg, youtube.com) to populate Social Platform / Excluded.
- `extractChannelDescriptionLinks(description)` — regex URL extractor reused from `process-video-links` logic.
- Single-use detection: count URL occurrences across all link rows; mark `Excluded - Single Use` when count === 1.
- Unshorten: use existing `video_links.unshortened_url`; if null/empty → `N/A`.

### 3. Add dependency
- `xlsx-js-style` (drop-in replacement for SheetJS community build with style support).

### 4. UI
- New `<Button>` "Export Full Report" on `src/pages/Videos.tsx` with progress toast (Fetching → Building → Downloading).
- Disabled while exporting; uses `sonner` toast.

### 5. Formatting rules implemented per cell
- Header row: `{ font: { bold: true, name: "Arial", sz: 10 }, fill: { fgColor: { rgb: "E0E0E0" } }, border: thinBlackAll }`
- Data rows: `{ font: { name: "Arial", sz: 10 }, border: thinBlackAll }`
- Placeholder cells (`No Links`, `No Description`, `No Email`, `No Instagram`, `N/A`, `Last 50 Scraped Video`): grey italic font.
- Excluded column: red font.
- Social Platform column: blue font.
- `ws['!freeze'] = { xSplit: 0, ySplit: 1 }` and `ws['!cols']` for sensible widths.

## Open question
The spec describes **6 sheets** but the prompt says **8 sheets**. Before I build, please confirm what Sheets 7 and 8 should contain (e.g., Affiliate Mapping table, Retailer Mapping table, Summary stats?), or whether 6 is the final count.

## Risks / notes
- Large datasets (thousands of videos × multiple links × multiple keywords) can produce huge files — I'll fetch in 1000-row pages and warn if total rows exceed ~100k.
- `xlsx-js-style` is ~600KB; loaded only when export is triggered (dynamic import).
- Channel description links currently aren't stored separately — I'll parse them on the fly from `channels.description` when building S5.

