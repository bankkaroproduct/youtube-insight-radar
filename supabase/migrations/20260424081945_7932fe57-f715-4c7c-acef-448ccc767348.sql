UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded: chunked finalize',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'queued', 'pending')
  AND stage IN ('finalize', 's3', 's4')
  AND created_at > now() - interval '6 hours'
  AND error IS DISTINCT FROM 'superseded: chunked finalize';