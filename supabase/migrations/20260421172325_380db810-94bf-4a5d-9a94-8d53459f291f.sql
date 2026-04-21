-- Drop old PK and recreate with composite key so same keyword can have different cache entries per (order_by, published_after).
alter table public.keyword_cache drop constraint if exists keyword_cache_pkey;

alter table public.keyword_cache
  add column if not exists order_by text not null default 'relevance',
  add column if not exists published_after date;

-- Backfill defaults on existing rows
update public.keyword_cache
set order_by = coalesce(order_by, 'relevance')
where order_by is null;

alter table public.keyword_cache
  add constraint keyword_cache_pkey primary key (keyword, order_by, published_after);

-- Prevent future-dated fetch times from poisoning the cache.
alter table public.keyword_cache
  add constraint keyword_cache_fetched_at_sane check (fetched_at <= now() + interval '1 minute');

-- Partial unique index to collapse nulls in published_after.
create unique index if not exists keyword_cache_unique_null_date
  on public.keyword_cache (keyword, order_by)
  where published_after is null;