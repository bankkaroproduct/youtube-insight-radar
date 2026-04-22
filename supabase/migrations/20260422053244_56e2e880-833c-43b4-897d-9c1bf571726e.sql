CREATE OR REPLACE FUNCTION public.get_channels_needing_backfill()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
  FROM public.channels
  WHERE total_videos_fetched < 50
    AND total_videos_fetched > 0
    AND (
      youtube_total_videos IS NULL
      OR youtube_total_videos > total_videos_fetched
    )
    AND (
      uploads_fully_scanned_at IS NULL
      OR scanned_at_youtube_total IS NULL
      OR youtube_total_videos IS NULL
      OR youtube_total_videos > scanned_at_youtube_total
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_channels_needing_backfill() TO authenticated;