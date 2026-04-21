create table if not exists public.url_resolution_cache (
  normalized_url text primary key,
  unshortened_url text not null,
  final_domain text,
  resolution_method text,
  resolved_at timestamptz not null default now(),
  resolve_count integer not null default 1
);

create index if not exists idx_url_cache_resolved_at
  on public.url_resolution_cache (resolved_at desc);

alter table public.url_resolution_cache enable row level security;

create policy "Admins can read url_resolution_cache"
  on public.url_resolution_cache for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

create or replace function public.cleanup_url_cache()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  delete from public.url_resolution_cache where resolved_at < now() - interval '60 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.cleanup_url_cache() to authenticated;