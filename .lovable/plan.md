

# Auto-Trigger AI Analysis After Fetch Pipeline

## What's Changing

Currently, keyword priority (P1-P5) and channel relevance (Yes/No) require manual button clicks. The user wants these to run **automatically** after the fetch pipeline completes — no manual intervention needed.

Search rank in Videos is already stored automatically during fetch (no change needed).

## Plan

### 1. Auto-trigger keyword priority after fetch completes

**File: `supabase/functions/process-fetch-queue/index.ts`**

After the existing auto-trigger chain (process-video-links → compute-channel-stats), add a new step:
- Collect all `keyword_id`s from processed jobs
- Fetch those keywords from `keywords_search_runs` where `priority IS NULL`
- Call `analyze-keyword-priority` with those keywords

This means every time videos are fetched for keywords, their P1-P5 priority is automatically assigned.

### 2. Auto-trigger channel relevance after fetch completes

**File: `supabase/functions/process-fetch-queue/index.ts`**

After keyword priority, add another step:
- Call `analyze-channel-relevance` with the newly discovered `channel_ids`
- The function already filters for `is_relevant IS NULL`, so only unchecked channels get analyzed

### 3. Update model to gemini-2.5-flash (already correct)

Both `analyze-keyword-priority` and `analyze-channel-relevance` already use `google/gemini-2.5-flash`. No model change needed — user said "Gemini 2.0 Flash" but the closest available model is `gemini-2.5-flash` which is already configured.

## Technical Details

### Changes to `process-fetch-queue/index.ts`

Add two new auto-trigger blocks after the existing compute-channel-stats trigger (around line 332):

```text
Existing chain:
  fetch videos → process-video-links → compute-channel-stats

New chain:
  fetch videos → process-video-links → compute-channel-stats
                                      → analyze-keyword-priority (for fetched keywords)
                                      → analyze-channel-relevance (for new channels)
```

The keyword priority call passes keyword IDs + keyword text from the processed jobs. The channel relevance call passes channel IDs from `allChannelIds`.

### Files to modify

1. `supabase/functions/process-fetch-queue/index.ts` — add auto-trigger calls to `analyze-keyword-priority` and `analyze-channel-relevance` at the end of the pipeline

No other files need changes — the edge functions and UI columns already exist.

