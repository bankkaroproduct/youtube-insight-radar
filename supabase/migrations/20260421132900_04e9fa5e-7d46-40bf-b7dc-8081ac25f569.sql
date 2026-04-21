alter table public.youtube_api_keys
  add column if not exists quota_reset_at timestamptz default now();

create or replace function public.reset_daily_quotas()
returns void language sql security definer set search_path to 'public' as $$
  update public.youtube_api_keys
  set quota_used_today = 0,
      is_active = case when last_test_status = 'invalid' then false else true end,
      last_test_status = case when last_test_status in ('quota_exceeded','restricted') then null else last_test_status end,
      quota_reset_at = now();
$$;

grant execute on function public.reset_daily_quotas() to authenticated, service_role;

create or replace function public.reset_daily_quotas_if_stale()
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  last_reset timestamptz;
begin
  select min(quota_reset_at) into last_reset from public.youtube_api_keys;
  if last_reset is null or last_reset < now() - interval '23 hours' then
    perform public.reset_daily_quotas();
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.reset_daily_quotas_if_stale() to authenticated, service_role;