

## Goal

1. **Auto-scrape channel links** whenever new channel(s) appear — no manual button click.
2. **Backfill all 1,710 channels to 50 videos each** — every channel must reach 50 videos, except channels whose total YouTube uploads are < 50 (those just get all available).

---

## Part 1 — Auto-scrape channel links on new channels

**Where channels first get created:** `supabase/functions/fetch-channel-videos/index.ts` upserts into `videos` (which carries `channel_id`), and channels rows are created/updated by downstream `compute-channel-stats`.

**Change:** Right after `fetch-channel-videos` finishes processing a batch, fire-and-forget a call to `scrape-channel-links` with the same `channel_ids` it just touched (alongside the existing `compute-channel-stats` and `scrape-instagram-profiles` triggers). The scrape function already skips channels with `custom_links_scraped_at` set, so re-runs are cheap.

```ts
fetch(`${supabaseUrl}/functions/v1/scrape-channel-links`, {
  method: "POST", headers: triggerHeaders,
  body: JSON.stringify({ channel_ids: channelIds }),
}).catch(e => console.error("Failed to trigger scrape-channel-links:", e));
```

This guarantees: every new channel discovered through a fetch run gets its YouTube "More info" links scraped automatically. The Excel export's existing `ensureChannelLinksScraped` stays as a safety net.

---

## Part 2 — Bring every channel to 50 videos

**Current behavior:** `fetch-channel-videos` pulls one page (max 50) per channel per call, and the page loop is hard-capped at `for (let page = 0; page < 1; page++)`. So one invocation = up to 50 newest videos per channel. Good — 50 is the target.

**Problem:** The function only processes `limit` channels per call (default 50, max ~100 before timeout). With 1,710 channels we need a way to march through all of them automatically until each has ≥50 videos OR has hit its YouTube total cap.

### A. New "Backfill to 50" button on Channels page

Add a button next to the existing "Scrape Channel Links" button: **"Backfill to 50 Videos"**.

It loops on the client side, repeatedly calling `fetch-channel-videos` with a filter that targets only under-served channels:

```ts
// Pseudocode for the loop
while (true) {
  const { data } = await supabase.functions.invoke("fetch-channel-videos", {
    body: { 
      limit: 25,
      backfill_under_50: true,   // NEW flag
    },
  });
  if (!data.channels_processed) break;
  setProgress(`Processed ${total += data.channels_processed} channels…`);
}
```

Progress toast updates after each batch. Stops when the function reports 0 channels processed.

### B. Edge function changes (`fetch-channel-videos`)

Add a new request param `backfill_under_50: boolean`. When true, change the channel selection query to:

```ts
// Channels that haven't reached 50 yet AND whose YouTube total > current count
// (i.e., more videos still exist on YouTube to fetch)
query = supabase
  .from("channels")
  .select("channel_id, channel_name, total_videos_fetched, youtube_total_videos")
  .lt("total_videos_fetched", 50)
  .or("youtube_total_videos.is.null,youtube_total_videos.gt.total_videos_fetched")
  .order("total_videos_fetched", { ascending: true })
  .limit(limit);
```

Channels where `youtube_total_videos < 50` are still selected once (so we capture whatever they have), but on the next pass they'll be skipped because `total_videos_fetched` will equal `youtube_total_videos` — satisfying the rule "less than 50 is allowed only when YouTube total < 50."

### C. Concurrency / timeout safety

Keep `BATCH_SIZE = 5` and `limit = 25` per invocation (≈5 parallel batches × 5 channels). At ~3-5s per channel that's well under the 60s edge timeout. 1,710 channels ÷ 25 = ~70 invocations, fully automated by the client loop.

---

## Files to change

1. `supabase/functions/fetch-channel-videos/index.ts`
   - Add `backfill_under_50` request param.
   - When true, swap the channel query to the under-50 filter.
   - Add the `scrape-channel-links` fire-and-forget trigger at the end.

2. `src/pages/Channels.tsx`
   - Add **"Backfill to 50 Videos"** button.
   - Implement the looping handler with progress toast (mirrors the existing scrape-links button pattern).

No DB migration needed — `custom_links` columns and `youtube_total_videos` already exist.

---

## Acceptance check

- After clicking **Backfill to 50 Videos**, every channel ends up with `total_videos_fetched >= 50` OR `total_videos_fetched == youtube_total_videos` (whichever is lower).
- New channels discovered by future keyword fetches automatically get their links scraped without any button press.

