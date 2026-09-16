-- Reconstructed from live Supabase schema (2026-09-16).
-- Companion to 20260913081148_add_profiles_update_policy_with_role_guard.sql:
-- the update policy above allows a user to update their own row, but nothing
-- stops them from also rewriting `id` or `role` on that same row. This
-- trigger blocks both, and its function's EXECUTE privilege is restricted
-- so only postgres/service_role can invoke it directly (not authenticated).
create or replace function public.prevent_role_id_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Changing profile id is not allowed';
  end if;

  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Only admins can change role';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_role_id_self_escalation() from public, anon, authenticated;

drop trigger if exists trg_prevent_role_id_self_escalation on public.profiles;
create trigger trg_prevent_role_id_self_escalation
before update on public.profiles
for each row execute function public.prevent_role_id_self_escalation();
