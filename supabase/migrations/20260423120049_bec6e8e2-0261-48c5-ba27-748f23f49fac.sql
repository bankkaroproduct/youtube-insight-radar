-- Expand export_jobs into a real state machine for chunked, resumable exports.
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_prefix text,
  ADD COLUMN IF NOT EXISTS result_path text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_status ON public.export_jobs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_lease ON public.export_jobs(status, lease_expires_at) WHERE status = 'running';