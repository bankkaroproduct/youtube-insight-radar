UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded: deflate-import fix',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'queued', 'pending')
  AND created_at > now() - interval '2 hours'
  AND error IS DISTINCT FROM 'superseded: deflate-import fix';