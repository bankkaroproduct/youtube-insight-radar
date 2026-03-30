

# Set Video Fetch Limit to 30 Per Keyword

## Current State
The `process-fetch-queue` edge function already uses API keys from the `youtube_api_keys` table (auto-rotating to the one with lowest quota usage). The `maxResults` is currently set to `"50"`.

## Change
Update `supabase/functions/process-fetch-queue/index.ts` line 90:
- Change `maxResults: "50"` → `maxResults: "30"`

This ensures exactly 30 videos are fetched per keyword search. The API key rotation and quota tracking already work correctly using the keys you've added.

## Files
1. **`supabase/functions/process-fetch-queue/index.ts`** — change maxResults from 50 to 30

