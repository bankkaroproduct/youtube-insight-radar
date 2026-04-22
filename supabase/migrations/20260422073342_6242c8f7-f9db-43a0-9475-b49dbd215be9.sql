ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS last_uploads_page_token TEXT,
  ADD COLUMN IF NOT EXISTS youtube_longform_total INTEGER;

CREATE OR REPLACE FUNCTION public.get_channels_needing_backfill()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint
  FROM public.channels
  WHERE total_videos_fetched < 50
    AND total_videos_fetched > 0
    AND (
      -- If we know the long-form total, only count channels that can still reach more.
      (youtube_longform_total IS NOT NULL AND total_videos_fetched < youtube_longform_total)
      OR
      -- Otherwise fall back to the old check using youtube_total_videos.
      (youtube_longform_total IS NULL AND (
        youtube_total_videos IS NULL
        OR youtube_total_videos > total_videos_fetched
      ))
    )
    AND (
      -- And we haven't already fully walked the entire uploads playlist with no new uploads since.
      uploads_fully_scanned_at IS NULL
      OR scanned_at_youtube_total IS NULL
      OR youtube_total_videos IS NULL
      OR youtube_total_videos > scanned_at_youtube_total
    );
$function$;