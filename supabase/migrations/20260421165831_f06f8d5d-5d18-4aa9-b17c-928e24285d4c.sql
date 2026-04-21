create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);
create index if not exists idx_audit_log_action on public.audit_log (action);

alter table public.audit_log enable row level security;

create policy "Admins can read audit log"
  on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

create or replace function public.log_audit(_action text, _target_type text, _target_id text, _details jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  u record;
begin
  select id, email into u from auth.users where id = auth.uid();
  insert into public.audit_log (actor_user_id, actor_email, action, target_type, target_id, details)
  values (u.id, u.email, _action, _target_type, _target_id, _details);
end;
$$;

grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;

create or replace function public.replace_user_role(_target_user_id uuid, _new_role app_role)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_id uuid := auth.uid();
  caller_is_admin boolean;
  is_last_admin boolean;
  target_is_admin boolean;
begin
  select public.has_role(caller_id, 'admin') or public.has_role(caller_id, 'super_admin') into caller_is_admin;
  if not caller_is_admin then
    raise exception 'Only admins can change roles';
  end if;

  if caller_id = _target_user_id and _new_role not in ('admin', 'super_admin') then
    raise exception 'You cannot demote yourself';
  end if;

  select public.has_role(_target_user_id, 'admin') or public.has_role(_target_user_id, 'super_admin') into target_is_admin;
  if target_is_admin and _new_role not in ('admin', 'super_admin') then
    select count(distinct user_id) <= 1 into is_last_admin
      from public.user_roles where role in ('admin', 'super_admin');
    if is_last_admin then
      raise exception 'Cannot demote the last admin';
    end if;
  end if;

  delete from public.user_roles where user_id = _target_user_id;
  insert into public.user_roles (user_id, role) values (_target_user_id, _new_role);

  perform public.log_audit('role_changed', 'user', _target_user_id::text, jsonb_build_object('new_role', _new_role));
end;
$$;