
-- Add new classification columns to video_links
ALTER TABLE public.video_links ADD COLUMN link_type text;
ALTER TABLE public.video_links ADD COLUMN affiliate_platform text;
ALTER TABLE public.video_links ADD COLUMN affiliate_domain text;
ALTER TABLE public.video_links ADD COLUMN resolved_retailer text;
ALTER TABLE public.video_links ADD COLUMN resolved_retailer_domain text;
ALTER TABLE public.video_links ADD COLUMN is_shortened boolean DEFAULT false;

-- Add via/direct split columns to channels
ALTER TABLE public.channels ADD COLUMN retailer_via_affiliate_counts jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.channels ADD COLUMN retailer_direct_counts jsonb DEFAULT '{}'::jsonb;
