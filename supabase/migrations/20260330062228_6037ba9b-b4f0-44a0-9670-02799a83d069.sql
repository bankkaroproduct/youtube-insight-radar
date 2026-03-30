
CREATE TABLE public.youtube_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  daily_quota_limit integer NOT NULL DEFAULT 10000,
  quota_used_today integer NOT NULL DEFAULT 0,
  last_tested_at timestamptz,
  last_test_status text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_youtube_api_keys_active ON public.youtube_api_keys (is_active) WHERE is_active = true;

ALTER TABLE public.youtube_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage youtube api keys"
  ON public.youtube_api_keys
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.reset_daily_quotas()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.youtube_api_keys SET quota_used_today = 0;
$$;
