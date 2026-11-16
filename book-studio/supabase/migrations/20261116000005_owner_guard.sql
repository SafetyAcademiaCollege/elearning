-- An organisation must always keep at least one owner, otherwise nobody can
-- manage its team, settings or billing.
create function public.memberships_keep_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from organizations where id = old.org_id)
     and not exists (select 1 from memberships where org_id = old.org_id and 'owner' = any(roles)) then
    raise exception 'an organisation needs at least one owner; make someone else owner first' using errcode = '42501';
  end if;
  return null;
end $$;

create trigger memberships_keep_owner after update or delete on public.memberships
  for each row execute function public.memberships_keep_owner();
