

## Why channels are stuck at 49, 16, 4 videos and 114 still "need backfill"

### The diagnosis (from your live data)

I ran the actual numbers on your `channels` table. The pattern is **not** a bug in the 50-video target — it's the Shorts filter combined with `uploads_fully_scanned_at` flagging.

**Example slices of stuck channels (under 50 videos):**

| Stored count | # channels | Avg YT total uploads | Already fully scanned |
|---|---|---|---|
| 49 | 27 | 296 | **25 / 27** |
| 16 | 34 | 351 | 28 / 34 |
| 4  | 40 | 425 | **39 / 40** |
| 8  | 43 | 490 | 33 / 43 |

The avg YouTube total for these channels is **300–800 uploads**, well above 50. So why do we only store 4, 16, or 49?

### Root cause: the Shorts filter eats the budget

In `fetch-channel-videos/index.ts` (lines 191–197), every video shorter than 60 seconds OR with `#shorts` in the title is skipped:

```ts
if (totalSeconds > 0 && totalSeconds < 60) continue;
if ((snippet.title || "").toLowerCase().includes("#shorts")) continue;
```

We page through the uploads playlist up to `maxPages = 25` (1250 uploads inspected). For Shorts-heavy creators, those 1250 uploads might contain only 4 or 16 long-form videos. We then mark `uploads_fully_scanned_at` and never revisit them. **So your rule "every channel must have 50 videos unless YouTube has fewer than 50" is silently being violated for any channel where YouTube has <50 *long-form* videos — even if it has 500 Shorts.**

The 49-video bucket is a different flavor: scan stopped exactly one short of target on a page boundary, then got marked fully scanned.

### The 114 "needs backfill"

These are the channels where `uploads_fully_scanned_at IS NULL` AND stored count <50 AND YouTube total > stored. They simply haven't had Backfill Under 50 run on them yet (or a previous run hit an API-key exhaustion and bailed before finishing). Just clicking **Backfill Under 50** and letting it run should clear them — *but* many will end up in the same "stuck under 50 because of Shorts" bucket above.

### What I propose to fix

**1. Make the Shorts filter explicit in the rule.** Decide one of:
- **(A)** Treat Shorts as valid videos for the "must have 50" rule (count them, store them).
- **(B)** Keep filtering Shorts, but redefine the rule as: "50 long-form videos, or all long-form videos that exist if fewer than 50."

I recommend **(B)** since you've been deliberately filtering Shorts — but we make this honest by computing a separate `youtube_longform_total` once we've fully scanned, and treating that as the cap. Then the UI's "Needs Backfill" only counts channels that genuinely have more long-form videos available.

**2. Tighten the "fully scanned" gate.** Right now we mark `uploads_fully_scanned_at` even if we returned 0 long-form videos after 25 pages, because `nextPageToken` is null. That's correct for "we saw every upload" but wrong for "we hit page cap". I'll separate:
- `uploads_fully_scanned_at` — only set when `nextPageToken` actually became null (whole channel walked).
- If we hit `maxPages` without finishing, leave the flag null so the next backfill pass continues from where we left off (we'd need to persist `last_uploads_page_token` to resume — added as a column).

**3. Bump `maxPages` for backfill mode.** Currently 25 pages × 50 = 1250 uploads. For Shorts-heavy creators with 5k+ uploads, that's not enough. I'll raise it to 60 pages (3000 uploads) when `backfill_under_50=true`, and keep 25 for normal first-pass.

**4. Resume token.** Add `channels.last_uploads_page_token TEXT NULL`. When a backfill iteration hits `maxPages` without finding 50 long-form videos, save the token. Next iteration resumes from it instead of restarting at the newest upload.

### Files touched

- `supabase/functions/fetch-channel-videos/index.ts` — separate "page cap hit" from "fully scanned"; raise maxPages for backfill; persist + resume `last_uploads_page_token`; track `youtube_longform_total` once a true full scan finishes.
- DB migration — add `channels.last_uploads_page_token TEXT`, `channels.youtube_longform_total INT`.
- `get_channels_needing_backfill()` — update to use `youtube_longform_total` when present, so the count reflects channels that *can actually* reach 50.

### Not in scope

- No change to the Shorts definition (still <60s OR `#shorts` in title) unless you pick option (A) instead.
- No change to UI buttons or Channels page layout.
- No change to compute-channel-stats / API key rotation.

### Decision I need from you before implementing

Do you want **(A)** count Shorts toward the 50-video minimum, or **(B)** keep filtering Shorts and accept that some channels will legitimately have fewer than 50 long-form videos (with the UI honestly reflecting that)?

