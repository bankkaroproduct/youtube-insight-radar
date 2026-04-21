create or replace function public.reset_daily_quotas()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.youtube_api_keys
  set quota_used_today = 0,
      is_active = case when last_test_status = 'invalid' then false else true end,
      last_test_status = case when last_test_status in ('quota_exceeded','restricted') then null else last_test_status end,
      quota_reset_at = now()
  where true;
$$;

grant execute on function public.reset_daily_quotas() to authenticated, service_role;