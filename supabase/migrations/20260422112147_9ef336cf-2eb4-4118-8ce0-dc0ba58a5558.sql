-- Drop the unused orphan-video cleanup function so it can never be invoked
DROP FUNCTION IF EXISTS public.cleanup_truly_orphaned_videos();

-- Lightweight growth stats for the Channels page header
CREATE OR REPLACE FUNCTION public.get_channel_growth_stats()
RETURNS TABLE(
  total_channels bigint,
  added_last_24h bigint,
  added_last_hour bigint,
  last_channel_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE created_at > now() - interval '24 hours')::bigint,
    count(*) FILTER (WHERE created_at > now() - interval '1 hour')::bigint,
    max(created_at)
  FROM public.channels;
$$;