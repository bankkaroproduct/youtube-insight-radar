create or replace function public.get_video_links_stats(video_ids uuid[] default null)
returns table(total bigint, unique_platforms bigint, unique_retailers bigint)
language sql stable security definer set search_path to 'public' as $$
  select
    count(*),
    count(distinct affiliate_platform) filter (where affiliate_platform is not null),
    count(distinct resolved_retailer) filter (where resolved_retailer is not null)
  from public.video_links
  where video_ids is null or video_id = any(video_ids);
$$;
grant execute on function public.get_video_links_stats(uuid[]) to authenticated;