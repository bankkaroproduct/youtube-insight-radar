

# Limit Video Fetch to 30 Per Keyword

Change `process-fetch-queue/index.ts`:
- Set `MAX_PAGES = 1` (single page)
- Set `maxResults = 30` in the YouTube API call

This ensures exactly 30 videos are fetched per keyword instead of the current 150.

