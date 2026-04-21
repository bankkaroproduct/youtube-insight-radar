alter table public.channels
  add column if not exists uploads_fully_scanned_at timestamptz,
  add column if not exists scanned_at_youtube_total int;

create index if not exists idx_channels_backfill_selection
  on public.channels (total_videos_fetched, last_analyzed_at nulls first);