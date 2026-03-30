-- Grant super_admin to the primary user
INSERT INTO public.user_roles (user_id, role)
VALUES ('ef31227c-4071-483e-ab01-5f1c9706de2a', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Add UPDATE policy on user_roles for admins
CREATE POLICY "Admins can update user roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  )
);

-- Add UNIQUE constraint on ip_whitelist.ip_address
ALTER TABLE public.ip_whitelist ADD CONSTRAINT ip_whitelist_ip_address_key UNIQUE (ip_address);