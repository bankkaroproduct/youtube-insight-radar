create or replace function public.get_affiliate_classification_stats()
returns table(classification text, count bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(classification, 'NEUTRAL') as classification, count(*)
  from public.video_links
  group by coalesce(classification, 'NEUTRAL')
  order by count desc;
$$;
grant execute on function public.get_affiliate_classification_stats() to authenticated;