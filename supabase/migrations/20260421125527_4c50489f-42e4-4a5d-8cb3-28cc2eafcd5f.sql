create extension if not exists pg_cron;

create or replace function public.reset_daily_quotas()
returns void language sql security definer set search_path to 'public' as $$
  update public.youtube_api_keys
  set quota_used_today = 0,
      is_active = case when last_test_status = 'invalid' then false else true end,
      last_test_status = case when last_test_status in ('quota_exceeded','restricted') then null else last_test_status end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reset-youtube-api-quotas') then
    perform cron.unschedule('reset-youtube-api-quotas');
  end if;
end $$;

select cron.schedule('reset-youtube-api-quotas', '0 8 * * *', $$ select public.reset_daily_quotas(); $$);