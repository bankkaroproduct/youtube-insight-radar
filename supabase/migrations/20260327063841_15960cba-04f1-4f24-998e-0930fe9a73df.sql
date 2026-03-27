
-- Keywords table
CREATE TABLE public.keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  search_volume integer DEFAULT 0,
  competition text DEFAULT 'medium',
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_keywords_updated_at
  BEFORE UPDATE ON public.keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Users can view own keywords" ON public.keywords
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own keywords" ON public.keywords
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keywords" ON public.keywords
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own keywords" ON public.keywords
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Tracked Videos table
CREATE TABLE public.tracked_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_url text NOT NULL,
  title text,
  channel_name text,
  views bigint DEFAULT 0,
  likes bigint DEFAULT 0,
  published_at timestamptz,
  status text DEFAULT 'tracking',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracked_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos" ON public.tracked_videos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own videos" ON public.tracked_videos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos" ON public.tracked_videos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own videos" ON public.tracked_videos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Tracked Channels table
CREATE TABLE public.tracked_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_url text NOT NULL,
  channel_name text NOT NULL,
  subscriber_count bigint DEFAULT 0,
  video_count integer DEFAULT 0,
  category text,
  business_fit_score integer DEFAULT 0,
  status text DEFAULT 'tracking',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracked_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channels" ON public.tracked_channels
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own channels" ON public.tracked_channels
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own channels" ON public.tracked_channels
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own channels" ON public.tracked_channels
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
