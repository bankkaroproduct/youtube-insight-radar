create or replace function public.get_channel_summary_stats()
returns table(total bigint, with_us bigint, competitor bigint, mixed bigint, neutral bigint)
language sql stable security definer set search_path to 'public' as $$
  select
    count(*),
    count(*) filter (where affiliate_status = 'WITH_US'),
    count(*) filter (where affiliate_status = 'COMPETITOR'),
    count(*) filter (where affiliate_status = 'MIXED'),
    count(*) filter (where affiliate_status is null or affiliate_status = 'NEUTRAL')
  from public.channels where total_videos_fetched > 0;
$$;
grant execute on function public.get_channel_summary_stats() to authenticated;