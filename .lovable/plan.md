

## Why "Export failed: Invalid string length" — and the fix that keeps every row

### What's actually breaking

`xlsx-js-style` builds the final `.xlsx` by serializing the **entire workbook into one giant string in memory**, then base64-encoding it. JavaScript engines (V8/Chrome) have a hard limit of ~512 MB per string. With your sheet sizes:

- **S2 — Video Deep Data**: ~394K link rows × 22 columns
- **S3 — Last 50 Deep Data**: similar shape, tens of thousands of rows
- **S5 — Channel Deep Data**: 1,710 channels × all their links

…the serialized XML for S2 alone exceeds that ceiling, and the `writeFile` step throws `Invalid string length`. This is a hard engine limit — no amount of retry/batching/memory tuning fixes it because the failure is in the final string, not the data fetch.

### The fix — swap the writer to a streaming engine, keep everything else identical

Replace **only** the workbook builder/writer (last ~80 lines of `excelExportService.ts`) with **`exceljs`**, which writes each row to a streamed zip on disk-equivalent (browser `Blob` chunks) instead of one giant string. All fetching, all joining, all row-building logic stays exactly the same.

**What changes:**
- Replace `xlsx-js-style` import with `exceljs` (already a common Lovable dep; if not present, add via package update — pure client lib, no backend).
- Replace `buildWorksheet` + `XLSX.utils.book_append_sheet` + `XLSX.writeFile` with an `ExcelJS.stream.xlsx.WorkbookWriter` that:
  - Writes header row with the same `headerStyle` (bold, gray fill, Arial 10).
  - Writes data rows in chunks of 5,000 via `worksheet.addRow(...).commit()` so memory is freed as it goes.
  - Applies the same conditional cell styles (red for `Excluded`, blue for social, italic gray for placeholders) per cell during the row write.
  - Sets the same column widths and frozen top row (`worksheet.views = [{ state: 'frozen', ySplit: 1 }]`).
  - Calls `workbook.commit()` then triggers a browser download via `Blob` + `URL.createObjectURL`.

**What stays byte-equivalent:**
- All 6 sheets in the same order, same names (`S1 - Keyword Summary` … `S6 - Contact Info`).
- Same headers, same columns, same column order, same row order.
- Same totals — every video, every link, every keyword join, every channel.
- Same file name pattern: `youtube_full_report_YYYY-MM-DD.xlsx`.
- Same per-cell styles (header gray, red Excluded, blue social, italic placeholders).
- Same `compression: true` behavior (`exceljs` zips by default).

### Why this actually fixes it

`exceljs` `WorkbookWriter` never holds the whole workbook in one string. It writes each row to the output zip stream as it's added and the row's memory can be GC'd. There's no 512 MB ceiling because there's no single string — only a stream of small chunks. The browser tab will use ~100-300 MB peak instead of trying to allocate >512 MB.

### Files touched

- **`src/services/excelExportService.ts`** — replace `buildWorksheet` and the final block of `exportFullReport` (sheet append + `writeFile`) with the streaming `exceljs` equivalent. Everything from data fetching through map construction stays as-is.
- **`package.json`** — add `exceljs` if not already present. Keep `xlsx-js-style` for now in case any other code still imports it (no other usage in the project — safe to remove later).

### What I'll verify after the change

| Sheet | Expected rows |
|---|---:|
| S1 Keyword Summary | one per keyword in `keywords_search_runs` |
| S2 Video Deep Data | ≈ keyword-discovered videos × their keywords × their links (matches today's count exactly) |
| S3 Last 50 Deep Data | ≈ backfilled videos × their links (~370K) |
| S4 Last 50 Channel Map | one per backfilled video |
| S5 Channel Deep Data | one per channel × link-pairs (or "No Links" placeholder) |
| S6 Contact Info | 1,710 (one per channel) |

Same totals as the current code computes — just actually delivered.

### Out of scope

- Server-side / edge-function export (you don't want it).
- Job queue, storage buckets, signed URLs.
- Any change to which rows or columns appear, or to styling rules.
- Anything outside `excelExportService.ts` (and the one-line `package.json` add for `exceljs`).

### Honest expectation

This removes the hard string-length ceiling, so the export will complete reliably for your current 80K video / 394K link corpus and well beyond (tested by `exceljs` users with millions of rows). Combined with the retry wrapper already in place, transient network blips and the size ceiling are both handled.

