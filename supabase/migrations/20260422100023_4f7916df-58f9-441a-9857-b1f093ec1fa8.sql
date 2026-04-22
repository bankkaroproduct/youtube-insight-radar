-- Step 3: remove the destructive function so it cannot be invoked anywhere.
drop function if exists public.cleanup_orphaned_videos();

-- Step 5: install a safe, stricter replacement.
create or replace function public.cleanup_truly_orphaned_videos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  delete from public.videos v
  where v.channel_id is null
    and not exists (select 1 from public.video_keywords vk where vk.video_id = v.id)
    and not exists (select 1 from public.video_links vl where vl.video_id = v.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cleanup_truly_orphaned_videos() from public;
grant execute on function public.cleanup_truly_orphaned_videos() to authenticated;
-- Intentionally NOT scheduled. Manual invocation only.