ALTER TABLE public.instagram_profiles
  ADD COLUMN IF NOT EXISTS bio_links text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storefront_name text,
  ADD COLUMN IF NOT EXISTS affiliate_score text,
  ADD COLUMN IF NOT EXISTS affiliate_reasoning text,
  ADD COLUMN IF NOT EXISTS avg_post_likes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_post_comments integer DEFAULT 0;