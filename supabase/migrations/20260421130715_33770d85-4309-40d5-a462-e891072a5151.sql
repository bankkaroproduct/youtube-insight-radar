alter table public.fetch_jobs
  add column if not exists attempt_count int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists last_failure_reason text;

create index if not exists idx_fetch_jobs_status_created on public.fetch_jobs (status, created_at desc);