
-- Fix permissive RLS policy on ip_access_logs
DROP POLICY "System can insert IP logs" ON public.ip_access_logs;
CREATE POLICY "Authenticated can insert own IP logs"
  ON public.ip_access_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
