

## Reshape Sheets 2, 3, 4 — full coverage with per-keyword duplication

Sheets 1, 5, 6 unchanged. Sheets 2, 3, 4 rewritten as below. No schema, polling, styling, or header-format changes.

### Current gap

- DB has 80,213 videos, 394,339 links, 1,710 channels.
- S2 today only emits 3,525 keyword-mapped videos and emits each video once (collapses multi-keyword videos).
- S3/S4 today are capped at 50 most-recent rows.

### Target shape

**S2 — Video Deep Dive (keyword-mapped videos, per-keyword rows)**
One row per `(video_keyword, video_link)`. If a video is mapped to N keywords, it appears N times — once per keyword, with the same link rows repeated under each keyword. Headers unchanged:
`Keyword | Category | Business Aim | Priority | Search Rank | KW Status | Video Link | Video Name | Channel Name | Video Views | Video Likes | Video Comments | Video Description | Total Links in Description | Link # | Link | Unshortened Link | Domain | Affiliate Used | Retailer | Social Platform | Excluded`

**S3 — Backfill Video Deep Dive (videos with NO keyword mapping)**
One row per `(video, video_link)` for every video that does not appear in `video_keywords` (~76,688 videos). `Keyword` column literal = `"last 50"`. Same column order as S2 but the keyword-side cells (Category / Business Aim / Priority / Search Rank / KW Status) are blank.

**S4 — Channel Map (every video link across every channel)**
One row per `(channel, video, video_link)` across all 1,710 channels and all 80,213 videos. Rows grouped/sorted by channel. Channel Name + Channel Link + Total Videos From Channel repeat across each channel block. `Keyword` cell = the keyword name when the video came through a keyword search (one row per mapped keyword, just like S2), or `"last 50"` when it came from channel backfill. Headers exactly:
`Keyword | Video Name | Video Link | Channel Name | Channel Link | Total Videos From Channel`

**S1, S5, S6** — untouched.

### Implementation outline

All changes confined to `supabase/functions/export-full-report/index.ts`.

1. **`runStageS2`** — change paging source from `video_keywords` join to: page through `video_keywords` directly (size `CHUNK_VIDEO_PAGE = 800`), then for each row hydrate `videos`, `video_links`, `keywords_search_runs`. Emit one block of link rows per `video_keyword` row. A video mapped to 3 keywords ⇒ 3 row-blocks, identical link content under each.

2. **`runStageS3`** — page through `videos` (size 800) excluding any `id` present in `video_keywords` (anti-join via batched `not in (...)` lookup against an in-memory `Set` of keyword-mapped video ids loaded once at stage start and cached on `cursor.kwVideoIds` for subsequent invocations). Emit one row per (video, link) with `Keyword = "last 50"`.

3. **`runStageS4`** — page through `channels` (size `CHUNK_CHANNEL_PAGE = 100`). For each channel batch:
   - fetch `videos.channel_id IN (...)`
   - fetch `video_links` for those videos
   - fetch `video_keywords` + `keywords_search_runs` for those videos
   - emit one row per `(channel, video_keyword OR "last 50", link)`. Multi-keyword videos repeat per keyword. Channel cells repeat across the block.

4. **Finalize stage** — no change. Existing sync `ZipDeflate` + serialized `writeChain` + temp-file disk spill + streamed upload already handle the larger output.

5. **Stuck-job cleanup migration** — mark only currently-running jobs in any stage from the last 6 hours as failed with reason `"superseded: sheets 2/3/4 reshape"` so the next export starts clean.

### Size and runtime expectations

- S2: ~3,525 videos × ~1.x keywords avg × link rows ⇒ moderate growth vs today.
- S3: ~76,688 backfill videos × link rows ⇒ likely 200–400k rows (largest sheet).
- S4: per-link rows across all videos with per-keyword duplication ⇒ 300k+ rows.
- Compressed `.xlsx` estimate: 30–80 MB. Finalize already streams to disk + compresses, memory stays bounded.
- Per stage stays under 60 s edge-function budget by chunked self-invocation already in place.

### What does NOT change

- Sheet 1, 5, 6 unchanged
- Sheet ordering and names preserved
- Headers, styles, frozen rows, column widths preserved
- `export_jobs` schema, client polling, signed URL flow unchanged
- No DB schema changes

### Verification

1. Trigger Export Full Report from `/links` or `/videos`.
2. Stages advance `s1 → s2 → s3 → s4 → s5 → s6 → finalize → completed`.
3. `export_jobs` row reaches `status=completed`, `result_path` populated, `file_size_bytes` populated.
4. Download workbook, confirm in Excel:
   - S2: a video mapped to 2 keywords appears as 2 separate row-blocks with identical link rows.
   - S3: every row's Keyword cell = `"last 50"`, total ≈ all-link-rows for the ~76,688 backfill videos.
   - S4: rows grouped by channel, Keyword cell shows keyword name or `"last 50"`, Channel Name repeats correctly across the block.
   - S1, S5, S6 unchanged.
5. Finalize logs show sheet-by-sheet progress and successful streamed upload.

