
-- Add type column to affiliate_patterns
ALTER TABLE public.affiliate_patterns ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'affiliate_platform';

-- Add columns to video_links
ALTER TABLE public.video_links ADD COLUMN IF NOT EXISTS original_domain text;
ALTER TABLE public.video_links ADD COLUMN IF NOT EXISTS affiliate_platform_id uuid;
ALTER TABLE public.video_links ADD COLUMN IF NOT EXISTS retailer_pattern_id uuid;

-- Add columns to channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS affiliate_platform_names text[] DEFAULT '{}';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS retailer_names text[] DEFAULT '{}';
