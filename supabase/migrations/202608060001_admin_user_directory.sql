-- Secure admin-only directory that combines auth data with public profile/activity data.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  phone text,
  university text,
  faculty text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  enrollment_count bigint,
  certificate_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    users.id,
    users.email::text,
    profiles.full_name,
    profiles.role::text,
    profiles.phone,
    profiles.university,
    profiles.faculty,
    users.created_at,
    users.last_sign_in_at,
    (select count(*) from public.enrollments where enrollments.student_id = users.id),
    (select count(*) from public.certificates where certificates.user_id = users.id)
  from auth.users as users
  left join public.profiles as profiles on profiles.id = users.id
  where exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid() and viewer.role::text = 'admin'
  )
  order by users.created_at desc;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

notify pgrst, 'reload schema';
