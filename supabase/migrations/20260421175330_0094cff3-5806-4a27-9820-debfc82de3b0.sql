alter table public.video_links
  add column if not exists resolution_status text default 'pending',
  add column if not exists resolution_attempts integer default 0,
  add column if not exists last_resolution_error text;

create index if not exists idx_video_links_resolution_status on public.video_links (resolution_status);

-- Backfill: links that already have unshortened_url are 'resolved'
update public.video_links set resolution_status = 'resolved'
  where unshortened_url is not null and resolution_status = 'pending';