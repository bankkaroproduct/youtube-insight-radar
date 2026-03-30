ALTER TABLE public.video_keywords ADD COLUMN IF NOT EXISTS search_rank integer;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS youtube_category text;