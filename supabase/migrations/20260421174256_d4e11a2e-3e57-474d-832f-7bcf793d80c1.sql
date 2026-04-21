create or replace function public.cleanup_orphaned_videos() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  n integer;
begin
  delete from public.videos v
  where not exists (select 1 from public.video_keywords vk where vk.video_id = v.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.cleanup_orphaned_videos() to authenticated;

select cron.schedule('cleanup-orphaned-videos', '0 9 * * *', $$select public.cleanup_orphaned_videos()$$);