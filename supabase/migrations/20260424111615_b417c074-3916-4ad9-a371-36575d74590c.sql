UPDATE public.export_jobs
SET status = 'failed',
    error = COALESCE(error, '') || ' | superseded: dispatch-retry fix',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'queued', 'pending')
  AND created_at > now() - interval '6 hours';