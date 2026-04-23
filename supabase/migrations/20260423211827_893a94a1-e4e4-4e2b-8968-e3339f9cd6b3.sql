UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded by new finalize fix',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status = 'running'
  AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '5 minutes');