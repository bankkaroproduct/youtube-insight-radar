CREATE OR REPLACE FUNCTION public.get_keyword_stats()
  RETURNS TABLE(keyword_id uuid, video_count bigint, link_count bigint)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT 
    k.id as keyword_id,
    COALESCE(v.cnt, 0) as video_count,
    COALESCE(l.cnt, 0) as link_count
  FROM public.keywords_search_runs k
  LEFT JOIN (
    SELECT vk.keyword_id as kid, count(DISTINCT vk.video_id) as cnt 
    FROM public.video_keywords vk 
    GROUP BY vk.keyword_id
  ) v ON v.kid = k.id
  LEFT JOIN (
    SELECT vk.keyword_id as kid, count(*) as cnt 
    FROM public.video_links vl 
    JOIN public.video_keywords vk ON vk.video_id = vl.video_id 
    GROUP BY vk.keyword_id
  ) l ON l.kid = k.id;
$$;