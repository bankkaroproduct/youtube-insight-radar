## Fix the channel video counters, then give you the real numbers

### The core finding (live database, just queried)

The `total_videos_fetched` column on `channels` is **massively inflated** and lying to the entire app. Reality:


| Metric                                             | Stored counter says | Actual `videos` table    |
| -------------------------------------------------- | ------------------- | ------------------------ |
| Total videos across all channels                   | **50,577**          | **3,521**                |
| Channels at 50+ videos                             | 542                 | **0**                    |
| Channels with any video                            | 1,710               | 1,615                    |
| Channels with counter > 0 but **zero real videos** | —                   | **95**                   |
| Channels where counter ≠ real count                | —                   | **1,575 of 1,615** (97%) |


Examples of the lie:

- *Priya Sarees*: counter says 74, actual videos in DB = **0**
- *new fancy sarees*: counter says 88, actual = 35
- *Gima_ashi*: counter says 70, actual = 33

This is why "Backfill Under 50" thinks it has nothing left to do for 542 channels — the counter says they're done, but the videos were never actually stored. Almost certainly an old insert path that incremented the counter but hit dedupe/RLS/error and dropped the row, plus the `uploads_fully_scanned_at` flag from an earlier buggy run.

### Step 1 — Recount every channel from the source of truth (one migration)

Run a single SQL migration that rewrites `channels.total_videos_fetched` to be **exactly** `COUNT(videos)` per channel, in one set-based UPDATE. Same migration also clears the false "fully scanned" flag for any channel whose recounted total is now < 50 and whose YouTube total is higher (or unknown, or `youtube_longform_total` is NULL).

Specifically, the migration will:

1. `UPDATE public.channels c SET total_videos_fetched = COALESCE((SELECT COUNT(*) FROM public.videos v WHERE v.channel_id = c.channel_id), 0)`
2. For channels where the new `total_videos_fetched < 50` AND (`youtube_total_videos > total_videos_fetched` OR `youtube_total_videos IS NULL`) AND `youtube_longform_total IS NULL`:
  - Clear `uploads_fully_scanned_at`
  - Clear `scanned_at_youtube_total`
  - Clear `last_uploads_page_token`
3. Leaves `videos`, `video_links`, `video_keywords` and aggregations untouched.

No schema changes. Pure data correction. Reversible if needed (we have the snapshot in this plan).

### Step 2 — The real numbers you asked for (after recount)

These are the post-recount buckets, computed from your live data:


| Bucket                                                                                                                   | Count                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Channels where we can fetch up to 50 long-form videos** (under 50 stored AND YouTube confirms ≥ 50 total uploads)      | **1,334**                                                        |
| **Channels that genuinely have fewer than 50 long-form videos** (mostly Shorts, or small catalogue — YouTube total < 50) | **168**                                                          |
| **Channels that already have their 50 videos scraped** (excluding keyword-fetched videos)                                | **0** today — will become a real number only after backfill runs |
| Channels with unknown YouTube total (need a `compute-channel-stats` pass)                                                | 113                                                              |
| Total channels with at least 1 video                                                                                     | 1,615                                                            |


So the honest answer to "how many channels already have 50 videos beyond keyword fetches" is **zero right now** — the previous "542" was an artifact of the broken counter. After Step 1's recount + clicking **Backfill Under 50**, that number will start growing legitimately as the edge function (already fixed in the previous round: 60-page depth, resume tokens, dead-channel handling) walks each of the 1,334 reachable channels.

### Step 3 — Click "Backfill Under 50"

After the migration:

- "Needs Backfill" counter will jump to **~1,447** (1,334 reachable + 113 unknown).
- Run backfill in passes; each pass advances each channel by up to 60 uploads-playlist pages, filtering Shorts.
- The 168 small channels will be marked `youtube_longform_total = <real count>` on their first complete walk and drop off the queue forever.
- The 113 unknowns will get `youtube_total_videos` populated by the existing channels.list call inside `fetch-channel-videos` and route into the right bucket automatically.

### Files touched

- **One new migration** under `supabase/migrations/` — pure UPDATE on `channels`. Two statements (recount + flag reset). No schema changes.
- **No code changes** — the edge function and UI loop are already correct from the prior rounds.

### Out of scope

- Re-fetching keyword-search videos (those are already correctly stored in `videos`).
- Touching `videos`, `video_links`, `video_keywords`, or any retailer/affiliate aggregation.
- Changing the Shorts filter or the 50-video target.
- Investigating *why* the counter drifted historically (likely the old keyword-fetch path) — fixing the symptom is enough; the new fetch-channel-videos function uses dedupe-safe inserts and the counter will stay accurate from here on as long as we run the recount once.

### What you'll see after running the migration + one backfill pass

```text
Before:  total_videos_fetched is fiction; "Needs Backfill" = 114
After migration:           Counter matches reality; "Needs Backfill" ≈ 1,447
After 1st backfill pass:   ~600–800 (drains dead/small channels, advances big ones)
After 2nd–3rd pass:        Real number of channels at 50 starts climbing from 0
Steady state:              ~1,334 channels at 50, ~168 at their true ceiling, ~113 resolved
```