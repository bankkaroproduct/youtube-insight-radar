-- Cleanup duplicates per user (case-insensitive), keep earliest
with duplicates as (
  select id, user_id, lower(keyword) as k,
    row_number() over (partition by user_id, lower(keyword) order by created_at asc) as rn
  from public.keywords_search_runs
)
delete from public.keywords_search_runs where id in (select id from duplicates where rn > 1);

-- Unique index per user (case-insensitive)
create unique index if not exists uq_keywords_per_user_lower
  on public.keywords_search_runs (user_id, lower(keyword));