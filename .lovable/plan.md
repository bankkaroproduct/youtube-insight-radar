

## Why Excel shows blank sheets — and the real fix

### What's happening

The current code uses `wb.xlsx.writeBuffer()` — that's **the non-streaming** ExcelJS writer. With ~394K rows in S2 + ~370K in S3 + S5 link rows, ExcelJS still tries to assemble the entire shared-strings table and sheet XML in memory, then hand it to JSZip. At that scale on Chrome it produces a `.xlsx` whose internal XML is truncated/invalid — Excel opens it, sees the sheets exist (so tabs appear) but can't parse the cell data, so **every sheet renders blank**. No "repair" prompt because the package zip itself is technically valid; only the inner sheet XML is broken.

`writeBuffer()` is **not streaming**. The actual streaming API is `ExcelJS.stream.xlsx.WorkbookWriter`, which writes each row directly to the output zip and discards it from memory. That's what we need.

### The fix — switch to the true streaming writer

Replace the workbook construction + `writeBuffer()` block in `src/services/excelExportService.ts` with `ExcelJS.stream.xlsx.WorkbookWriter` writing into a `BlobWriter`-style chunk collector, then assemble the final Blob.

**Concretely, in `exportFullReport` (lines ~720–749):**

1. Create a `WritableStream` that collects `Uint8Array` chunks into an array.
2. Instantiate `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: writableStream, useStyles: true, useSharedStrings: false })`.
   - `useSharedStrings: false` is important — at this row count, the shared-strings table is itself what blows up. Inline strings are slightly larger on disk but parse correctly in Excel.
3. For each of the 6 sheets:
   - `const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] })`
   - Set `ws.columns` (widths).
   - Add header row, apply header style, call `headerRow.commit()`.
   - For each data row: `const row = ws.addRow(values)`, apply only the conditional cell styles (red Excluded / blue social / italic placeholder) exactly as today, then **`row.commit()`** so memory is freed immediately.
   - After all rows: `ws.commit()`.
4. After all sheets: `await wb.commit()`.
5. Concatenate the collected chunks into a `Blob` and trigger the same `<a download>` click as today.

**Update `addSheetToWorkbook`** to call `.commit()` on each row and on the worksheet (it currently doesn't, because `writeBuffer()` doesn't require it — but `WorkbookWriter` does, and that's the whole point).

### What stays identical

- All 6 sheets, same names (`S1 - Keyword Summary` … `S6 - Contact Info`), same order.
- Same headers, same columns, same column order, same row order, same totals.
- Same per-cell styles (bold gray header, red `Excluded`, blue social, italic placeholders).
- Same frozen top row and same column widths.
- Same file name `youtube_full_report_YYYY-MM-DD.xlsx`.
- Same fetching, joining, and row-building logic above line 720 — untouched.

### Why this actually produces a readable file

`WorkbookWriter` writes each committed row as final XML into the zip stream. There is no point at which the entire sheet XML or the entire shared-strings table sits in one JS object — so neither V8's string limit nor JSZip's in-memory assembly is hit. Excel receives a properly closed `<sheetData>` for every sheet and renders all rows.

Disabling `useSharedStrings` removes the second failure mode: with ~750K+ string cells, the shared-strings dedupe map itself can corrupt at scale.

### Files touched

- **`src/services/excelExportService.ts`** — only file edited. Changes are confined to `addSheetToWorkbook` (add `.commit()` calls) and the tail of `exportFullReport` (swap `Workbook` + `writeBuffer` for `WorkbookWriter` + `commit`).

### Verification after the change

Open the file in Excel and confirm:
- S1: ~keyword count rows, populated.
- S2: ~394K rows, populated, red `Excluded`, blue social, italic placeholders intact.
- S3: ~370K rows, populated.
- S4: backfilled-video count rows, populated.
- S5: 1,710 channels × link pairs, populated.
- S6: 1,710 contact rows, populated.
- All headers bold with gray fill, top row frozen.

### Out of scope

- Server-side export, jobs, storage buckets, edge functions.
- Any change to which rows/columns appear or to styling rules.
- Any other file.

