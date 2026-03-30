
-- Create video_keywords junction table
CREATE TABLE public.video_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  keyword_id uuid NOT NULL REFERENCES public.keywords_search_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(video_id, keyword_id)
);

ALTER TABLE public.video_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read video_keywords" ON public.video_keywords
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage video_keywords" ON public.video_keywords
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Add unique constraint on video_links to prevent duplicate links per video
ALTER TABLE public.video_links ADD CONSTRAINT video_links_video_id_original_url_key UNIQUE (video_id, original_url);
