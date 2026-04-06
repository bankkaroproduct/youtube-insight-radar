

# Update "Till date" display logic

## Change
**File: `src/pages/Channels.tsx` (lines 314-318)**

Update the Videos column condition: instead of checking `fetched >= youtube_total`, show `"{youtube_total_videos}-Till date"` when `youtube_total_videos` exists and is less than 50. This tells the user that the channel only has that many videos total.

- If `youtube_total_videos < 50`: display `"{youtube_total_videos}-Till date"`
- Otherwise: display `total_videos_fetched`

## Technical detail
```tsx
{ch.youtube_total_videos != null && ch.youtube_total_videos < 50
  ? `${ch.youtube_total_videos}-Till date`
  : ch.total_videos_fetched}
```

Single line change in `src/pages/Channels.tsx`.

