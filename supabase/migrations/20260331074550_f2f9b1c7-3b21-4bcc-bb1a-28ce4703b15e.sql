ALTER TABLE public.youtube_api_keys ALTER COLUMN daily_quota_limit SET DEFAULT 0;
UPDATE public.youtube_api_keys SET daily_quota_limit = 0 WHERE daily_quota_limit = 10000;