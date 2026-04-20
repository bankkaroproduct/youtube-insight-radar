

The user has 2 issues from the screenshot:

1. **Haul Pack retailer wrong**: Links like `https://www.haulpack.com/deeplink?dl=https%3A%2F%2Fwww.myntra.com%2F37002996%3F...` show `Retailer = "Via Haul Pack"`, but the actual retailer is **Myntra** (URL-encoded inside the `dl=` query param). The "Via Haul Pack" fallback fires because the unshortener never decoded the `dl=` parameter.

2. **Add Rank column** to S2 Video Deep Data and S5 Channel Deep Data. Rank already exists in the DB as `video_keywords.search_rank` (per keyword) and a derived `best_rank` (min across keywords). For S5 (channels), rank doesn't exist directly — we'll use the channel's best video rank (min `search_rank` across all that channel's videos that came from a keyword search).

# Plan: Decode Haul Pack Retailer + Add Rank Columns

## Fix 1 — Decode retailer from deeplink/redirect URLs

In `src/services/excelExportService.ts`, enhance `resolveRetailerDisplay()`:

- Before falling back to `"Via {affiliate_platform}"`, scan the `original_url` and `unshortened_url` query string for any `dl`, `url`, `u`, `r`, `redirect`, `target`, `to`, `link`, `dest` parameters.
- If found, URL-decode the value, extract its hostname, and look it up in `retailerByDomain`.
- Also handle the case where the param value contains a full encoded URL (e.g., `dl=https%3A%2F%2Fwww.myntra.com%2F...` → decode → `myntra.com` → match).
- If matched → return the real retailer name (e.g., "Myntra").
- Only if no embedded retailer can be found → fall back to "Via {affiliate}".

This fixes Haul Pack → Myntra, and also helps for similar redirector patterns (myhaulstore, etc. — though `myhaulstore.com` may need to be added as an affiliate platform / retailer pattern manually).

**Note**: For URLs without a `dl=` style param (e.g. `https://www.haulpack.com/p/haulpackinfluencer/neha-singhs-myntra-haul-19032026` — a landing page, not a deeplink), there's no retailer to extract. Those will keep showing "Via Haul Pack" which is correct, since the actual product retailer can't be inferred from a landing-page URL.

## Fix 2 — Add Rank column

### S2 (Video Deep Data) — per-keyword rank
- Add column `Search Rank` after `Priority` (since rank is per-keyword for the video).
- Source: `video_keywords.search_rank` for the (video, keyword) pair already being iterated.
- Display: number, or grey-italic "N/A" when null.
- Update `excelExportService.ts`:
  - Fetch `search_rank` in the `video_keywords` query.
  - Change `vkMap` to store `{ keyword_id, search_rank }` instead of just `keyword_id`.
  - Insert rank into the row.
  - Bump `socialColIdx` (19 → 20) and `excludedColIdx` (20 → 21) for S2.

### S5 (Channel Deep Data) — channel's best rank
- Add column `Best Video Rank` after `Channel Subscribers`.
- Compute: for each channel, find the minimum `search_rank` across all videos belonging to that channel that have any `video_keywords.search_rank` set.
- Display: number, or grey-italic "N/A".
- Bump `socialColIdx` (13 → 14) and `excludedColIdx` (14 → 15) for S5.

## Files to edit
- `src/services/excelExportService.ts` (only)

## Notes
- No DB schema or migration changes.
- No new dependencies.
- Sheets 1, 3, 4, 6 untouched.
- Column-width arrays stay auto-sized via the existing logic (no manual width changes needed except S1 which is already explicit).

