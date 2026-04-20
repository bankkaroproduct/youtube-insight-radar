

The user is clarifying Fix 3. The new "Excluded" rule should be:

**Excluded = an affiliate platform that appears only once across the entire export** (i.e., single-occurrence affiliate platform = likely noise/one-off, exclude it).

So we go back to a frequency-based exclusion, but counting **affiliate_platform occurrences** instead of unshortened URL occurrences.

# Plan: Change Excluded Logic to Single-Use Affiliate Detection

## New rule for Excluded column (S2 & S3)

Count how many times each `affiliate_platform` value appears across all link rows in the export. Then per row:

| Condition | Excluded value |
|---|---|
| Social/neutral domain (instagram, t.me, wa.me, etc.) | `Excluded - Social ({platform})` (unchanged) |
| `affiliate_platform` is set AND its total count across export === 1 | `Excluded - Single Affiliate` |
| Everything else | (blank — included) |

So if "Amazon Associates" shows up on 50 links → none excluded. If "RandomNetwork123" shows up on just 1 link → that 1 link gets excluded.

## Implementation

**File: `src/services/excelExportService.ts`**

1. Before building S2/S3, build a frequency map:
   ```ts
   const affiliateCounts = new Map<string, number>();
   for (const link of allLinks) {
     if (link.affiliate_platform) {
       affiliateCounts.set(link.affiliate_platform, (affiliateCounts.get(link.affiliate_platform) ?? 0) + 1);
     }
   }
   ```
2. Replace `computeExcluded()` body with the new rule above.
3. Drop the "No Affiliate" exclusion added in the previous round.
4. Keep red-text styling for any cell starting with `Excluded`.

## Unchanged
- Fix 1 (Channel Subscribers in S5) — keep as-is.
- Fix 2 (retailer surfacing with "Via {affiliate}" fallback) — keep as-is.

## Files to edit
- `src/services/excelExportService.ts` (only).

