
CREATE TABLE public.competitor_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read competitor_names"
  ON public.competitor_names FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage competitor_names"
  ON public.competitor_names FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
