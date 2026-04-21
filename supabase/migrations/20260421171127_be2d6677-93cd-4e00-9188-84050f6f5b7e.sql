alter table public.youtube_api_keys drop column if exists api_key;
drop function if exists public.backfill_encrypt_api_keys(text);