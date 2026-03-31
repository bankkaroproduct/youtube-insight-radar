ALTER TABLE public.channels ADD COLUMN platform_video_counts jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.channels ADD COLUMN retailer_video_counts jsonb DEFAULT '{}'::jsonb;