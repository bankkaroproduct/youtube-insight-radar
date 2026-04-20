ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS custom_links jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS custom_links_scraped_at timestamptz;