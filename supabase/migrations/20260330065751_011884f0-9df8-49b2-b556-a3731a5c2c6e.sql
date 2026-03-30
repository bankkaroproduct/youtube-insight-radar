
-- 1. Videos table
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text UNIQUE NOT NULL,
  keyword_id uuid REFERENCES public.keywords_search_runs(id) ON DELETE SET NULL,
  channel_id text NOT NULL,
  channel_name text NOT NULL,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  published_at timestamptz,
  view_count bigint DEFAULT 0,
  like_count bigint DEFAULT 0,
  comment_count bigint DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read videos" ON public.videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can manage videos" ON public.videos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_videos_channel_id ON public.videos(channel_id);
CREATE INDEX idx_videos_keyword_id ON public.videos(keyword_id);

-- 2. Affiliate patterns table
CREATE TABLE public.affiliate_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  name text NOT NULL,
  classification text NOT NULL DEFAULT 'NEUTRAL',
  is_auto_discovered boolean NOT NULL DEFAULT false,
  is_confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read affiliate_patterns" ON public.affiliate_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage affiliate_patterns" ON public.affiliate_patterns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Video links table
CREATE TABLE public.video_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  original_url text NOT NULL,
  unshortened_url text,
  domain text,
  classification text DEFAULT 'NEUTRAL',
  matched_pattern_id uuid REFERENCES public.affiliate_patterns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read video_links" ON public.video_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage video_links" ON public.video_links FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_video_links_video_id ON public.video_links(video_id);

-- 4. Channels table
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text UNIQUE NOT NULL,
  channel_name text NOT NULL,
  channel_url text,
  subscriber_count bigint DEFAULT 0,
  total_videos_fetched integer DEFAULT 0,
  median_views bigint DEFAULT 0,
  median_likes bigint DEFAULT 0,
  median_comments bigint DEFAULT 0,
  affiliate_status text DEFAULT 'NEUTRAL',
  affiliate_names text[] DEFAULT '{}',
  last_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read channels" ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage channels" ON public.channels FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_channels_channel_id ON public.channels(channel_id);

-- Enable realtime for videos
ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;

-- Update get_keyword_stats to return real counts
CREATE OR REPLACE FUNCTION public.get_keyword_stats()
RETURNS TABLE(keyword_id uuid, video_count bigint, link_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    k.id as keyword_id,
    COALESCE(v.cnt, 0) as video_count,
    COALESCE(l.cnt, 0) as link_count
  FROM public.keywords_search_runs k
  LEFT JOIN (SELECT keyword_id as kid, count(*) as cnt FROM public.videos GROUP BY keyword_id) v ON v.kid = k.id
  LEFT JOIN (SELECT vi.keyword_id as kid, count(*) as cnt FROM public.video_links vl JOIN public.videos vi ON vi.id = vl.video_id GROUP BY vi.keyword_id) l ON l.kid = k.id;
$$;
