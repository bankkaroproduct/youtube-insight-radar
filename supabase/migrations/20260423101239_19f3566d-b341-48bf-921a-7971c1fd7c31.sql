-- 1. Job-tracking table
create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  progress_message text,
  storage_path text,
  file_size_bytes bigint,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_export_jobs_user
  on public.export_jobs (user_id, created_at desc);

alter table public.export_jobs enable row level security;

create policy "Users see their own export jobs"
  on public.export_jobs for select to authenticated
  using (user_id = auth.uid());

-- 2. Storage bucket (private, 500MB file size limit)
insert into storage.buckets (id, name, public, file_size_limit)
values ('exports', 'exports', false, 524288000)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- 3. Storage RLS — users read their own files under `${user_id}/`
create policy "Users read their own exports"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );