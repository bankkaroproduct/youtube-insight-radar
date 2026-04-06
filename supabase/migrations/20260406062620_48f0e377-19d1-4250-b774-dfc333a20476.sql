
-- Rate limits table for global API quota tracking
CREATE TABLE public.rate_limits (
  key text PRIMARY KEY,
  requests_today integer NOT NULL DEFAULT 0,
  quota_limit integer NOT NULL,
  last_reset timestamptz NOT NULL DEFAULT now()
);

-- Seed initial rate limit entries
INSERT INTO public.rate_limits (key, requests_today, quota_limit) VALUES
  ('youtube_api', 0, 9000),
  ('unshorten_api', 0, 500);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only admins can read/manage rate limits
CREATE POLICY "Admins can manage rate_limits" ON public.rate_limits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Keyword cache table for deduplication
CREATE TABLE public.keyword_cache (
  keyword text PRIMARY KEY,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  video_ids jsonb DEFAULT '[]'::jsonb,
  videos_found integer DEFAULT 0
);

ALTER TABLE public.keyword_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read keyword_cache" ON public.keyword_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage keyword_cache" ON public.keyword_cache
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
