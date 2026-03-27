
-- Drop old tables that have incompatible schemas
DROP TABLE IF EXISTS public.keywords CASCADE;
DROP TABLE IF EXISTS public.tracked_videos CASCADE;

-- Create channel_categories lookup table
CREATE TABLE public.channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  business_aim text NOT NULL DEFAULT 'General'
);
ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read categories" ON public.channel_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON public.channel_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create keywords_search_runs table
CREATE TABLE public.keywords_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  business_aim text NOT NULL DEFAULT 'General',
  source text NOT NULL DEFAULT 'manual',
  source_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text,
  estimated_volume text,
  last_priority_fetch_at timestamptz,
  run_date text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.keywords_search_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read keywords" ON public.keywords_search_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert keywords" ON public.keywords_search_runs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR auth.uid() = user_id);
CREATE POLICY "Admins can update keywords" ON public.keywords_search_runs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can delete keywords" ON public.keywords_search_runs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create fetch_jobs table
CREATE TABLE public.fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid REFERENCES public.keywords_search_runs(id) ON DELETE SET NULL,
  keyword text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  videos_found integer,
  order_by text NOT NULL DEFAULT 'relevance',
  published_after text,
  variations_searched text[],
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
ALTER TABLE public.fetch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read fetch_jobs" ON public.fetch_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert fetch_jobs" ON public.fetch_jobs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can update fetch_jobs" ON public.fetch_jobs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can delete fetch_jobs" ON public.fetch_jobs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Enable realtime on fetch_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.fetch_jobs;

-- Create get_keyword_stats RPC
CREATE OR REPLACE FUNCTION public.get_keyword_stats()
RETURNS TABLE(keyword_id uuid, video_count bigint, link_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT k.id as keyword_id, 0::bigint as video_count, 0::bigint as link_count
  FROM public.keywords_search_runs k;
$$;

-- Seed channel_categories
INSERT INTO public.channel_categories (name, description, business_aim) VALUES
  ('Technology', 'Tech reviews, tutorials, and news', 'Tech Marketing'),
  ('Finance', 'Personal finance, investing, and business', 'Financial Services'),
  ('Health', 'Health, fitness, and wellness content', 'Health & Wellness'),
  ('Education', 'Educational content and online learning', 'EdTech'),
  ('Entertainment', 'Entertainment and lifestyle content', 'Brand Awareness'),
  ('Gaming', 'Gaming reviews, streams, and esports', 'Gaming Marketing'),
  ('Food', 'Cooking, recipes, and food reviews', 'Food & Beverage'),
  ('Travel', 'Travel guides and vlogs', 'Travel & Tourism');
