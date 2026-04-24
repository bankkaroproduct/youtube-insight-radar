UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded by new finalize fix (compress+stream+serialize)',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status = 'running'
  AND stage = 'finalize'
  AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '5 minutes');