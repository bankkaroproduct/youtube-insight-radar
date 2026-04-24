UPDATE public.export_jobs
SET status = 'failed',
    error = 'superseded: AsyncZipDeflate Worker unsupported in edge runtime',
    completed_at = now(),
    lease_expires_at = NULL
WHERE status IN ('running', 'failed')
  AND stage = 'finalize'
  AND error IS DISTINCT FROM 'superseded: AsyncZipDeflate Worker unsupported in edge runtime'
  AND created_at > now() - interval '6 hours';