create or replace function public.replace_user_role(_target_user_id uuid, _new_role public.app_role)
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
end;
$$;

grant execute on function public.replace_user_role(uuid, public.app_role) to authenticated;