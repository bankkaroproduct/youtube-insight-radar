CREATE TABLE public.instagram_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  instagram_username text NOT NULL,
  full_name text,
  bio text,
  profile_pic_url text,
  follower_count integer,
  following_count integer,
  post_count integer,
  is_business boolean DEFAULT false,
  business_category text,
  contact_email text,
  contact_phone text,
  external_url text,
  recent_posts jsonb DEFAULT '[]'::jsonb,
  scraped_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_id)
);

ALTER TABLE public.instagram_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read instagram_profiles"
ON public.instagram_profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage instagram_profiles"
ON public.instagram_profiles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));