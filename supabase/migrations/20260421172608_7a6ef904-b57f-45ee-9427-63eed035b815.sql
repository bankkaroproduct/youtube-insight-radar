-- 1) Filtered search RPC for the Videos page
create or replace function public.search_videos_filtered(
  _title_q text default null,
  _channel_q text default null,
  _keyword_q text default null,
  _classification text default null,
  _limit int default 50,
  _offset int default 0
)
returns table(id uuid, total_count bigint)
language sql stable security definer set search_path to 'public' as $$
  with filtered as (
    select distinct v.id, v.created_at
    from public.videos v
    left join public.video_keywords vk on vk.video_id = v.id
    left join public.keywords_search_runs k on k.id = vk.keyword_id
    left join public.video_links vl on vl.video_id = v.id
    where (_title_q is null or v.title ilike '%' || _title_q || '%')
      and (_channel_q is null or v.channel_name ilike '%' || _channel_q || '%')
      and (_keyword_q is null or k.keyword ilike '%' || _keyword_q || '%')
      and (_classification is null or vl.classification = _classification)
  ),
  counted as (select count(*) as total from filtered)
  select f.id, c.total
  from filtered f cross join counted c
  order by f.created_at desc
  limit _limit offset _offset;
$$;

grant execute on function public.search_videos_filtered(text, text, text, text, int, int) to authenticated;

-- 2) updated_at on video_links + trigger
alter table public.video_links add column if not exists updated_at timestamptz default now();

create or replace function public.touch_video_links_updated_at()
returns trigger language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_video_links_updated_at on public.video_links;
create trigger tr_video_links_updated_at
  before update on public.video_links
  for each row execute function public.touch_video_links_updated_at();