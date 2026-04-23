

## Fix the finalize stall + Sheet 2 memory pressure

### Root cause

Two compounding problems in `runStageFinalize` (lines 900–1015):

1. **Bounded busy-wait drops the zip**: the `while (!zipDone && spins < 1000)` loop on line 982 exits after 1000 microtask ticks. With 127 MB of raw XML (Sheet 2 alone is 118 MB / 7 fragments), fflate's async DEFLATE produces far more than 1000 internal chunks. The loop falls through with `zipDone === false`, then the code uploads a half-built buffer and the job sits in `running/finalize` forever (heartbeats keep firing because the worker is technically alive, but no progress is ever recorded).
2. **fflate `Zip` + 118 MB of input inside a 256 MB Edge Function**: pure-JS DEFLATE keeps the sliding window + output buffer in heap. Logs already show one `Memory limit exceeded` event during this stage.

Evidence: latest job `49acd42a…` has been at `stage=finalize / Stitching workbook...` for ~1h41m, heartbeating but never completing. Fragment sizes confirmed via storage: s1=109KB, **s2=118MB/7frags**, s3=770KB, s4=28KB, s5=6.6MB, s6=1.9MB.

### Fix

**A. Replace the bounded busy-wait with a real completion signal.**

Wrap the `Zip` callback in a Promise that resolves when `final === true` is received, and `await` that promise after `zip.end()`. No `spins` counter, no `setTimeout(0)` loop.

```ts
let resolveDone!: () => void;
let rejectDone!: (e: Error) => void;
const donePromise = new Promise<void>((res, rej) => { resolveDone = res; rejectDone = rej; });

const zip = new Zip((err, dat, final) => {
  if (err) { rejectDone(err as Error); return; }
  if (dat?.length) { totalBytes += dat.length; /* push to chunks or tmpFile */ }
  if (final) resolveDone();
});
// ...
zip.end();
await donePromise;
await Promise.all(pendingWrites);
```

This alone unblocks the current stuck job class — the zip will actually complete instead of being abandoned at spin #1000.

**B. Stream Sheet 2 to disk from the start (don't keep zip output in memory).**

Sheet 2's compressed output will still be ~10–20 MB, but the *uncompressed* working set during DEFLATE is the danger. Switch finalize to **always spill to a tmp file** rather than gating on an 80 MB threshold. This removes the in-memory `zipChunks` array entirely and avoids the OOM seen in logs:

- Open `Deno.makeTempFile()` before calling `addFixedFile`.
- In the `Zip` callback, push every emitted chunk straight to `tmpFile.write(dat)` (track the promise in `pendingWrites`).
- After `await donePromise` and `await Promise.all(pendingWrites)`, close the file, then upload via `Deno.open(tmpPath).readable` as a `ReadableStream` body to `supabase.storage.from("exports").upload()` (the supabase-js v2 client accepts a stream).
- If the storage SDK in this Deno runtime rejects a stream body, fall back to `await Deno.readFile(tmpPath)` and upload the buffer (compressed xlsx is small enough to fit even at this scale).

**C. Garbage-collect fragment buffers between pushes.**

After `entry.push(b, false)`, drop the reference (`b = null as any`) and `await new Promise(r => setTimeout(r, 0))` once per fragment to let the runtime reclaim the 16–20 MB chunk before downloading the next one. Currently the loop on line 967 holds the previous fragment alive until the next iteration's `downloadFragment` resolves.

**D. (Optional safety) Re-chunk Sheet 2 fragments smaller next run.**

S2's fragments average ~17 MB each. If memory remains tight after A–C, halve `CHUNK_VIDEO_PAGE` (or whatever S2's page size constant is named) so each fragment is ~8 MB. This only affects *new* exports; the current stuck job's fragments stay as-is.

### What does NOT change

- Sheet count / order / names / headers / styles
- Row inclusion rules (S2 still contains all keyword-linked videos; S3/S4 still bounded to last 50)
- `export_jobs` schema, stage machine, client polling, signed-URL flow
- Storage bucket / path layout

### Files changed

- `supabase/functions/export-full-report/index.ts` — only `runStageFinalize` (~lines 900–1015). ~40 lines touched. Nothing else.

### Cleanup before retry

The 4 stuck jobs (`49acd42a`, `1f73c31d`, `21dfa0be`, `f6b0c0f4`) need to be marked failed so a new export can start cleanly. The new fix will mark `status='failed'` with `error='superseded'` for any job stuck in `finalize` with `heartbeat_at < now() - interval '15 minutes'` on the next worker tick.

### Verification

1. Mark the 4 stuck jobs failed (one-time SQL during deploy).
2. Trigger a fresh export from `/links` or `/videos`.
3. Watch `export_jobs`: progress should advance through s1→s6, then `Stitching workbook...` should complete in **<60 seconds** and land at `status=completed` with `file_size_bytes` populated.
4. Download the signed URL; open in Excel; confirm all 6 sheets render with correct row counts, frozen header, and cell styles.
5. Watch edge function logs for the absence of `Memory limit exceeded` during finalize.

