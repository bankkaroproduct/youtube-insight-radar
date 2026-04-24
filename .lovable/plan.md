

## Fix `BootFailure: deflateRaw not exported` from fflate

Edge function logs confirm:
```
worker boot error: Uncaught SyntaxError:
The requested module 'https://esm.sh/fflate@0.8.2' does not provide an export named 'deflateRaw'
```

The function never starts → client gets the generic "Failed to send a request to the Edge Function".

### Root cause

`esm.sh`'s default bundle of `fflate@0.8.2` does not re-export the sync `deflateRaw`. It does export the sync `deflate` (zlib-wrapped). My previous edit imported a non-existent symbol.

### Fix

Two tiny changes in `supabase/functions/export-full-report/index.ts`:

1. **Replace the `deflateRaw` import with `deflate`**, and derive raw DEFLATE bytes by stripping the 2-byte zlib header and 4-byte adler32 trailer:
   ```ts
   import { deflate } from "https://esm.sh/fflate@0.8.2";

   function deflateRawSync(buf: Uint8Array): Uint8Array {
     const z = deflate(buf, { level: 1 });   // zlib-wrapped output
     return z.subarray(2, z.length - 4);     // strip 2-byte zlib header + 4-byte adler32 → raw DEFLATE
   }
   ```
   Replace every existing `deflateRaw(...)` call with `deflateRawSync(...)`. CRC32 (which the zip central directory uses) is computed by us, so dropping the adler32 trailer is fine — output is byte-identical to a real raw deflate.

2. **Stuck-job cleanup migration** — boot-failed jobs from the last hour get stuck with `status=running`. Mark them failed so the next click starts clean:
   ```sql
   UPDATE public.export_jobs
   SET status = 'failed',
       error = 'superseded: deflate-import fix',
       completed_at = now(),
       lease_expires_at = NULL
   WHERE status IN ('running', 'queued', 'pending')
     AND created_at > now() - interval '2 hours'
     AND error IS DISTINCT FROM 'superseded: deflate-import fix';
   ```

### What does NOT change

- All chunked-finalize logic from the previous turn (per-tick budget, manual zip writing, CRC32 across fragments, `cursor.fz` shape, central directory + EOCD, streamed upload).
- Sheet content, headers, styling, sheet order — unchanged.
- Client (`exportFullReport`) — unchanged.

### Verification

1. Migration flips stuck jobs to `failed`.
2. Edge logs no longer show `BootFailure`; show normal `[finalize] tick phase=sheets sheetIdx=…` progression.
3. Trigger Export Full Report from `/videos` → toast advances past "Stitching workbook…" into "Downloading…".
4. `export_jobs` row reaches `status=completed`, `result_path` set, file opens cleanly in Excel with all 6 sheets.

### Files

- `supabase/functions/export-full-report/index.ts` — swap import + add `deflateRawSync` helper + replace call sites.
- New migration: stuck-job cleanup.

