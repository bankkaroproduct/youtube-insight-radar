create extension if not exists pgcrypto with schema extensions;

alter table public.youtube_api_keys
  add column if not exists api_key_encrypted bytea,
  add column if not exists api_key_last_4 text;

create or replace function public.get_decrypted_api_key(_key_id uuid, _secret text)
returns text language sql security definer set search_path to 'public', 'extensions' as $$
  select extensions.pgp_sym_decrypt(api_key_encrypted, _secret)::text
  from public.youtube_api_keys where id = _key_id;
$$;

revoke execute on function public.get_decrypted_api_key(uuid, text) from public;
revoke execute on function public.get_decrypted_api_key(uuid, text) from authenticated;
grant execute on function public.get_decrypted_api_key(uuid, text) to service_role;

create or replace function public.insert_encrypted_api_key(_raw_key text, _label text, _secret text)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  new_id uuid;
begin
  insert into public.youtube_api_keys (api_key_encrypted, api_key_last_4, label)
  values (extensions.pgp_sym_encrypt(_raw_key, _secret), right(_raw_key, 4), _label)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.insert_encrypted_api_key(text, text, text) from public;
revoke execute on function public.insert_encrypted_api_key(text, text, text) from authenticated;
grant execute on function public.insert_encrypted_api_key(text, text, text) to service_role;

create or replace function public.backfill_encrypt_api_keys(_secret text)
returns integer language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  n integer;
begin
  update public.youtube_api_keys
  set api_key_encrypted = extensions.pgp_sym_encrypt(api_key, _secret),
      api_key_last_4 = right(api_key, 4)
  where api_key_encrypted is null and api_key is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.backfill_encrypt_api_keys(text) from public;
revoke execute on function public.backfill_encrypt_api_keys(text) from authenticated;
grant execute on function public.backfill_encrypt_api_keys(text) to service_role;