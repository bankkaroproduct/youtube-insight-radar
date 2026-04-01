CREATE OR REPLACE FUNCTION public.reset_daily_quotas()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.youtube_api_keys 
  SET quota_used_today = 0, is_active = true, last_test_status = null;
$$;