UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded: sheets 2/3/4 reshape',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'queued')
  AND created_at > now() - interval '6 hours';