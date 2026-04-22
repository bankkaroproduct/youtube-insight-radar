
## Where your data went — and how to recover/prevent it

You're not seeing a bug in the UI this time. The data physically isn't there anymore. Here's what happened, what's still salvageable, and what to change so it stops happening.

### What's actually in the database right now

From earlier diagnosis on your live backend:
- `videos`: **3,525 rows** (you remember ~53,000)
- `video_links`: **24,643 rows** (you remember ~200,000 / "2 lakh")
- `channels.total_videos_fetched` sums to **53,197** — this is a *cumulative fetch counter*, not a row count. It only goes up, even when the underlying videos are later deleted.

So the "53k" number you remember was real at fetch time, but those video rows have since been removed from the `videos` table. The "2 lakh links" figure came from stale browser logs showing an in-flight processing queue from before a reset/cleanup — those link rows were also deleted.

### Why the rows disappeared

There are three deletion paths in this project, and at least two of them have been firing:

1. **`cleanup_orphaned_videos()`** — deletes any video in `videos` that has no row in `video_keywords`. So the moment a keyword is deleted, every video that was *only* attached to that keyword is wiped, and every `video_links` row tied to those videos goes with it (cascade via app logic / FK behavior).
2. **`reset-video-links` edge function** — clears resolved fields on links. This doesn't delete rows, but it's often run alongside #3.
3. **Manual "Reset All Links" / keyword deletes from the UI** — when keywords were removed, their videos became orphans and the cleanup job swept them.

The cumulative `total_videos_fetched` counter on `channels` was never decremented when any of this happened, which is why the channel-level number (53k) and the actual `videos` table (3.5k) drifted so far apart.

### Plan — three parts

**Part 1: Forensics (read-only, no changes)**
- Check `audit_log` for `cleanup_orphaned_videos`, keyword deletions, and link resets in the last 30 days to confirm timing and who triggered them.
- Pull edge function logs for `reset-video-links`, `process-video-links`, and any cleanup invocations to build a timeline of what was deleted when.
- Cross-check `channels.total_videos_fetched` vs actual per-channel `videos` count to quantify the gap per channel (we already know the total gap is ~49,500 videos).
- Report back: how many videos were lost, when, and which action caused each wave.

**Part 2: Recover what we can**
- **Re-fetch from YouTube**: every channel still has its `channel_id`, `last_uploads_page_token`, and uploads playlist. We can reset `uploads_fully_scanned_at = NULL` and `total_videos_fetched = 0` on the affected channels and re-run the existing fetch flow. This will repopulate `videos` and `video_keywords` for channels that still exist on YouTube. Cost: YouTube API quota (~1 unit per 50 videos via playlistItems).
- **Re-resolve links**: once videos come back, the link extraction + `process-video-links` pipeline will rebuild `video_links` from video descriptions. The 24,643 currently-resolved links stay intact.
- We **cannot** recover the *exact same* `video_links.id` UUIDs or any link that was in a video description that has since been edited/deleted on YouTube. Any manual classifications stored only on `video_links` rows are gone.

**Part 3: Stop the bleeding (schema + UX guardrails)**
- **Add a confirmation gate to keyword deletion**: before deleting a keyword, show the user how many videos and links will be orphaned and require typed confirmation. Right now this is silent.
- **Soft-delete instead of hard-delete for videos**: add `deleted_at` to `videos` and have `cleanup_orphaned_videos` set `deleted_at` instead of `DELETE`. Add a separate "Purge soft-deleted older than N days" job the admin runs explicitly. This gives a recovery window.
- **Fix `total_videos_fetched` to mean what it says**: replace the cumulative counter with a live count derived from `videos` per channel (or add a separate `lifetime_videos_seen` column so the two concepts are not conflated). Recompute current values from `videos` so the Channels page stops lying.
- **Audit-log every destructive action**: keyword delete, link reset, orphan cleanup, channel reset — all should write to `audit_log` with row counts so this is never a mystery again.
- **Dashboard "data health" card**: show `videos` row count, `video_links` row count, last cleanup run, last reset run, and the gap between `SUM(total_videos_fetched)` and actual `videos` count — so drift is visible immediately, not weeks later.

### Decisions I need from you before implementing

1. **Recovery scope** — re-fetch videos for **(A)** all 114+ channels under 50 videos, **(B)** only channels that currently have 0 videos in the `videos` table but >0 in `total_videos_fetched`, or **(C)** skip recovery and just put guardrails in?
2. **Soft-delete** — okay to add `deleted_at` to `videos` and `video_links` and make cleanup a two-stage process (mark, then purge after 30 days)? This is the single biggest protection against repeats.
3. **Counter fix** — replace `total_videos_fetched` with a live count, or keep it as "lifetime fetched" and add a new `videos_in_db` column next to it? The second is more honest, the first is simpler.

### Files / objects that will change once you decide

- `supabase/migrations/<new>.sql` — soft-delete columns, counter recompute, audit triggers
- `supabase/functions/cleanup-orphaned-videos` (new) or update existing RPC — soft-delete behavior
- `supabase/functions/recover-channel-videos` (new) — orchestrates the re-fetch for selected channels
- `src/pages/Keywords.tsx` — confirmation dialog with impact preview before delete
- `src/pages/Channels.tsx` — surface the `videos_in_db` vs `total_videos_fetched` gap
- `src/hooks/useDashboard.ts` + new `DataHealthCard` — drift visibility on the dashboard
- `src/pages/Links.tsx` — show last reset timestamp and row count from audit log

No data has been touched while preparing this plan. Nothing will be deleted or re-fetched until you pick A/B/C and confirm the soft-delete + counter approach.
