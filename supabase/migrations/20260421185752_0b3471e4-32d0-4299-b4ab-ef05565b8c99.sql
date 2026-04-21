CREATE OR REPLACE FUNCTION public.get_video_links_processing_stats()
RETURNS TABLE(
  total bigint,
  processed bigint,
  with_platform bigint,
  with_retailer bigint,
  failed bigint,
  pending bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE unshortened_url IS NOT NULL)::bigint,
    count(*) FILTER (WHERE affiliate_platform IS NOT NULL)::bigint,
    count(*) FILTER (WHERE resolved_retailer IS NOT NULL)::bigint,
    count(*) FILTER (WHERE resolution_status = 'failed')::bigint,
    count(*) FILTER (WHERE resolution_status = 'pending')::bigint
  FROM public.video_links;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_links_processing_stats() TO authenticated;