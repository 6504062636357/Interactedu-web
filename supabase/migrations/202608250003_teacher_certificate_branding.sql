-- Per-course certificate branding. The platform template remains the default;
-- teachers can add their own logo and issuer/signatory details for new PDFs.

alter table public.courses
  add column if not exists certificate_logo_path text null,
  add column if not exists certificate_issuer_name text null,
  add column if not exists certificate_signatory_name text null,
  add column if not exists certificate_signatory_title text null;

alter table public.courses
  drop constraint if exists courses_certificate_issuer_name_length,
  drop constraint if exists courses_certificate_signatory_name_length,
  drop constraint if exists courses_certificate_signatory_title_length;

alter table public.courses
  add constraint courses_certificate_issuer_name_length
    check (char_length(certificate_issuer_name) <= 100),
  add constraint courses_certificate_signatory_name_length
    check (char_length(certificate_signatory_name) <= 100),
  add constraint courses_certificate_signatory_title_length
    check (char_length(certificate_signatory_title) <= 100);

insert into storage.buckets (id, name, public)
values ('certificate-assets', 'certificate-assets', false)
on conflict (id) do update set public = false;

create or replace function public.can_manage_certificate_asset(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.courses
    where courses.id::text = p_course_id
      and courses.created_by = auth.uid()
  ) or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
$$;

create or replace function public.can_read_certificate_asset(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_certificate_asset(p_course_id) or exists (
    select 1
    from public.enrollments
    where enrollments.student_id = auth.uid()
      and enrollments.course_id::text = p_course_id
      and enrollments.status::text in ('approved', 'active', 'completed', 'certified')
  );
$$;

revoke all on function public.can_manage_certificate_asset(text) from public;
revoke all on function public.can_read_certificate_asset(text) from public;
grant execute on function public.can_manage_certificate_asset(text) to authenticated;
grant execute on function public.can_read_certificate_asset(text) to authenticated;

drop policy if exists "Course owners upload certificate assets" on storage.objects;
create policy "Course owners upload certificate assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'certificate-assets'
  and name ~ '^[0-9a-fA-F-]{36}/logo\.(png|jpg)$'
  and public.can_manage_certificate_asset((storage.foldername(name))[1])
);

drop policy if exists "Course owners update certificate assets" on storage.objects;
create policy "Course owners update certificate assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'certificate-assets'
  and public.can_manage_certificate_asset((storage.foldername(name))[1])
)
with check (
  bucket_id = 'certificate-assets'
  and name ~ '^[0-9a-fA-F-]{36}/logo\.(png|jpg)$'
  and public.can_manage_certificate_asset((storage.foldername(name))[1])
);

drop policy if exists "Course owners delete certificate assets" on storage.objects;
create policy "Course owners delete certificate assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'certificate-assets'
  and public.can_manage_certificate_asset((storage.foldername(name))[1])
);

drop policy if exists "Eligible users read certificate assets" on storage.objects;
create policy "Eligible users read certificate assets"
on storage.objects for select
to authenticated
using (
  bucket_id = 'certificate-assets'
  and public.can_read_certificate_asset((storage.foldername(name))[1])
);

comment on column public.courses.certificate_logo_path is
  'Private certificate-assets object path for the optional teacher logo.';
comment on column public.courses.certificate_issuer_name is
  'Optional organization or instructor name displayed on newly issued certificates.';
comment on column public.courses.certificate_signatory_name is
  'Optional authorized signatory displayed on newly issued certificates.';
comment on column public.courses.certificate_signatory_title is
  'Optional signatory role displayed below the signatory name.';
