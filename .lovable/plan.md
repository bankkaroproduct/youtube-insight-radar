

## Stage 3 — Fix the finalize OOM crash

### Root cause

The job runs end-to-end through stages s1→s6 successfully. It dies in `finalize` at `supabase/functions/export-full-report/index.ts:892-921` with `Array buffer allocation failed`. Three compounding allocations:

1. `bodies: Uint8Array[]` holds every fragment for every sheet in RAM at once
2. `out = new Uint8Array(head + totalBody + tail)` allocates one contiguous buffer per sheet (Sheet 2 alone ≈ hundreds of MB of XML)
3. `zipSync(zipInput)` then allocates the entire compressed `.xlsx` output buffer on top of that

Combined heap easily exceeds the ~256MB Edge Function limit. No data, schema, or output change is needed — only how finalize streams bytes.

### Fix: stream finalize through fflate's async `Zip` + `ZipPassThrough`

Replace `runStageFinalize` so it never holds a full sheet — or the full xlsx — in memory:

1. Use `Zip` (async streaming) + `ZipPassThrough` from `fflate` instead of `zipSync`. Pipe each file's bytes through as they arrive; collect zip output chunks into an array of small `Uint8Array`s.
2. For the small fixed files (`[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml`) — push directly into a `ZipPassThrough` and `end()` it.
3. For each sheet:
   - Open a `ZipPassThrough` for `xl/worksheets/sheetN.xml`
   - Push the header XML chunk
   - List fragments via `listFragments` (already chunked at 100/page)
   - For each fragment path: download → push the bytes into the passthrough → drop the reference → continue. Never accumulate all fragments. Never build a single giant `out` buffer.
   - Push the footer XML, then `end()` the passthrough
4. After all entries are pushed, call `zip.end()` to flush the central directory.
5. Concatenate the collected zip output chunks into one buffer **only at upload time**, then upload to storage. The compressed `.xlsx` is far smaller than the raw XML (XLSX zip ratio is typically 10–20x for repetitive data), so the final concatenated buffer fits comfortably.
6. Switch the import line at the top of the file from `import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2"` to also include `Zip, ZipPassThrough`.

If even the final concatenated zip exceeds memory at very large scales (it won't at 80k videos / 394k links, but as a guard): write each emitted zip chunk to `Deno.makeTempFile()` via append mode, then stream the tmp file directly to `supabase.storage.from("exports").upload()` using a `ReadableStream` from `Deno.open(...).readable`. This is a one-line change inside the chunk handler and doesn't affect anything else.

### What does NOT change

- All 6 sheets, sheet order, sheet names, headers
- Row inclusion rules for every sheet
- Styles (bold/red/blue/italic), frozen header
- `export_jobs` schema
- Stage machinery (s1…s6 already work — logs confirm 343 successful self-invocations before the crash)
- Client polling in `src/services/excelExportService.ts`
- Filename pattern, storage bucket, signed-URL flow
- Toast UX in `src/pages/Videos.tsx`

### Files changed

- `supabase/functions/export-full-report/index.ts` — only `runStageFinalize` (lines ~892–941) plus the `fflate` import line at the top. ~60 lines touched. Nothing else.

### Verification

1. Trigger export from `/videos`. Watch progress reach `Stitching workbook...`, then `Done`.
2. Check `export_jobs`: latest row should land on `status=completed`, `stage=completed`, `file_size_bytes` populated, `result_path` set.
3. Download the signed URL. Open the `.xlsx` in Excel. Confirm:
   - All 6 sheets present in correct order with correct names
   - Row counts match prior partial exports / DB counts
   - Header row bold + frozen
   - "Excluded" cells red, social cells blue, placeholder cells gray italic
4. If finalize still throws OOM (it shouldn't), apply the `Deno.makeTempFile` spill fallback described above — same function, ~10 extra lines.

