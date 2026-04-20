

The user wants 3 fixes to the Excel export:

1. **S5 Channel Deep Data**: missing "Channel Subscribers" column.
2. **S2 / S3 Video Deep Data**: many haul/pack links are classified with an affiliate platform but no retailer — need to surface retailer better, OR ensure rows show retailer info even when only affiliate is present.
3. **Excluded column logic**: currently excludes based on unshortened URL duplicate detection. Change to exclude based on affiliate platform usage (i.e. mark as Excluded when the link is an affiliate platform link without a resolved retailer, OR when no affiliate is used — need to clarify).

Let me check the current export service to understand exactly what columns exist and how Excluded works.

I need to look at `src/services/excelExportService.ts` to confirm column structure and exclusion rules before planning.

Based on prior conversation context: the Excluded column currently uses "Single Use" detection — counting unshortened URL occurrences across all link rows and marking `Excluded - Single Use` when count === 1. The user wants this changed to be based on whether an affiliate is used.

# Plan: Fix Channel Subscribers, Retailer Display, and Excluded Logic

## Fix 1 — Add "Channel Subscribers" to S5 Channel Deep Data
Insert a new column right after Channel Name in `buildSheet5()`:
- Header: `Channel Subscribers`
- Value: `channel.subscriber_count` (formatted as number; "N/A" grey-italic if null/0)
- Update column widths array to include `wch: 18` for the new column.

## Fix 2 — Better retailer surfacing in S2 & S3 (Video Deep Data)
Currently when a link has `affiliate_platform` set but `resolved_retailer` is null, the Retailer column shows "N/A" — making haul/pack videos look like they have no retailer.

Change retailer column logic for S2 and S3:
- If `resolved_retailer` exists → show it.
- Else if `unshortened_url` (or `original_url`) domain matches a known retailer pattern from `affiliate_patterns` table (type = `retailer`) → show that retailer name.
- Else if it's clearly an affiliate-only link (e.g. amzn.to, fkrt.it, bit.ly going through affiliate platform) → show `"Via {affiliate_platform}"` in grey italic instead of blank "N/A", so it's clear retailer wasn't resolved by the unshortener.
- Else → "N/A" grey italic.

This requires loading `affiliate_patterns` (already fetched in the export service per prior changes) and matching domains.

## Fix 3 — Change "Excluded" logic from Single-Use to Affiliate-based
Replace the current rule (`count === 1` → `Excluded - Single Use`) with:

| Condition | Excluded value |
|---|---|
| No affiliate platform AND no retailer detected | `Excluded - No Affiliate` |
| Social/neutral domain (instagram, t.me, wa.me, etc.) | `Excluded - Social` (already handled — keep) |
| Has affiliate platform OR retailer | (blank — included) |

So the Excluded column flags links that don't monetize (no affiliate involvement). Red text styling on the Excluded column stays the same.

Apply this to S2 and S3 (the two sheets with the Excluded column).

## Files to edit
- `src/services/excelExportService.ts` — only file that needs changes.

## Notes
- No DB schema changes, no new dependencies.
- "Single Use" detection logic and the cross-row URL counting can be removed entirely — simplifies code and reduces memory.
- Sheet 5 column reorder: `Channel Name | Channel Subscribers | Channel URL | …` (subscribers right after name for readability).

