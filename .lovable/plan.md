# Fix: Export Full Report — `[finalize] no callback` end-to-end

## Confirmed root cause

`supabase/functions/export-full-report/index.ts` line 2:

```ts
import { deflate, strToU8 } from "https://esm.sh/fflate@0.8.2";
...
function deflateRaw(buf, opts) {
  const z = deflate(buf, opts);   // ← BUG
  return z.subarray(2, z.length - 4);
}
```

In fflate, `deflate(...)` is the **async callback-based** API. Calling it without a callback throws `Error: no callback`. That is exactly the `error = "[finalize] no callback"` value we see on every recent stuck `export_jobs` row.

So sheet building (s1–s6) succeeds, then the very first finalize tick crashes on the first `deflateRaw(...)` call → job dies → client polls until it sees `failed` and shows "last call failed".

The synchronous equivalent in fflate is `deflateSync(...)`, which is exported by the same `https://esm.sh/fflate@0.8.2` bundle. Same return shape (zlib-wrapped), so the existing `subarray(2, length - 4)` strip still produces correct raw DEFLATE for the ZIP `method=8` entries.

## Changes

### 1. `supabase/functions/export-full-report/index.ts` — fix compression

- Replace `import { deflate, strToU8 }` with `import { deflateSync, strToU8 }`.
- Replace the body of `deflateRaw` with `const z = deflateSync(buf, opts); return z.subarray(2, z.length - 4);`.
- Wrap each finalize sub-step (sheet header compress, fragment compress, sheet tail compress, boilerplate compress, central-directory build, storage upload) in a `try/catch` that re-throws with a prefixed label like `finalize/sheet-frag s2#3: <original>` so future failures point at the exact sub-step in `export_jobs.error` instead of a bare `no callback`.
- Keep all existing logic: `cursor.fz` shape, per-tick `FZ_FRAGMENTS_PER_TICK` budget, CRC32 across fragments, central directory, EOCD, streamed-then-buffered upload fallback. None of that changes.

### 2. `src/services/excelExportService.ts` — harden client polling

Today a single transient failure of the `status` invoke immediately throws and the UI shows "last call failed" even when the backend job is still healthy.

- Track `consecutiveStatusErrors`. Increment on `statusErr` (or thrown invoke), reset to `0` on any successful response.
- Allow up to 5 consecutive transient failures with simple linear backoff (3s → 4s → 5s → 6s → 7s) before throwing.
- Still fail immediately when the backend returns `status === "failed"` with a real error string (that's an authoritative server-side failure, not a flaky network call).

### 3. New migration — clean up jobs stuck on the broken finalize

```sql
UPDATE public.export_jobs
SET status = 'failed',
    error = COALESCE(error, '') || ' | superseded: end-to-end finalize fix',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'queued', 'pending')
  AND created_at > now() - interval '6 hours';
```

So the next click on **Export Full Report** starts from a clean slate.

## Verification (after switch to default mode)

1. Apply the three changes above.
2. Deploy `export-full-report`.
3. From `/videos`, click **Export Full Report**.
4. Tail edge logs and confirm we see the normal sequence:
   `[finalize] start → tick sheetIdx=1..6 → tick phase=boilerplate → tick phase=central_dir → tick phase=upload → upload success`.
5. Confirm `export_jobs` row reaches `status=completed`, `result_path` populated, `file_size_bytes` > 0.
6. Confirm browser downloads the `.xlsx` and it opens with all 6 sheets intact.
7. Confirm no toast "last call failed" — UI moves through "Stitching workbook…" → "Downloading…".

## Out of scope

- Sheet content / column layout — unchanged.
- `export_jobs` schema — unchanged.
- Resumable ZIP writer design — unchanged, only the compression call is fixed.

## Files

- `supabase/functions/export-full-report/index.ts` — import + `deflateRaw` body + per-step try/catch labels.
- `src/services/excelExportService.ts` — retry-with-backoff polling.
- New migration: stuck-job cleanup (6h window).
