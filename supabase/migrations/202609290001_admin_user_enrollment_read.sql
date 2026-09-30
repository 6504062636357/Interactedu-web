-- The admin directory counts all enrollments through a security-definer RPC.
-- Give the user detail page the matching read access to enrollment rows.
create or replace function public.admin_can_read_user_details()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role::text = 'admin'
  );
$$;

revoke all on function public.admin_can_read_user_details() from public;
grant execute on function public.admin_can_read_user_details() to authenticated;

drop policy if exists "Admins read user enrollments" on public.enrollments;
create policy "Admins read user enrollments"
on public.enrollments for select
to authenticated
using (public.admin_can_read_user_details());

notify pgrst, 'reload schema';
