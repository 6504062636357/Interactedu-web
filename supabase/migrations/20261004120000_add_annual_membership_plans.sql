begin;

alter table public.membership_settings
  add column if not exists annual_price numeric(12, 2) not null default 7500 check (annual_price >= 0),
  add column if not exists annual_regular_price numeric(12, 2) not null default 12000 check (annual_regular_price >= 0);

alter table public.student_membership_orders
  add column if not exists duration_months integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'membership_settings_annual_regular_price_check'
      and conrelid = 'public.membership_settings'::regclass
  ) then
    alter table public.membership_settings
      add constraint membership_settings_annual_regular_price_check
      check (annual_regular_price >= annual_price);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_membership_orders_duration_months_check'
      and conrelid = 'public.student_membership_orders'::regclass
  ) then
    alter table public.student_membership_orders
      add constraint student_membership_orders_duration_months_check
      check (duration_months in (1, 12));
  end if;
end;
$$;

insert into public.membership_settings (id, monthly_price, annual_price, annual_regular_price)
values (true, 1200, 7500, 12000)
on conflict (id) do update
set monthly_price = 1200,
    annual_price = 7500,
    annual_regular_price = 12000,
    updated_at = now();

create or replace function public.activate_student_membership_for_charge(p_charge_id text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.student_membership_orders%rowtype;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
begin
  select * into v_order
  from public.student_membership_orders
  where charge_id = p_charge_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership payment not found';
  end if;

  if v_order.status = 'active' then
    return v_order.expires_at;
  end if;

  if v_order.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Membership payment is not pending';
  end if;

  perform 1
  from public.profiles
  where id = v_order.student_id
  for update;

  select greatest(clock_timestamp(), coalesce(max(expires_at), clock_timestamp()))
    into v_starts_at
  from public.student_membership_orders
  where student_id = v_order.student_id
    and status = 'active';

  v_expires_at := v_starts_at + (v_order.duration_months * interval '1 month');

  update public.student_membership_orders
  set status = 'active', starts_at = v_starts_at, expires_at = v_expires_at
  where id = v_order.id;

  update public.enrollments e
  set status = 'approved',
      approved_at = coalesce(e.approved_at, v_starts_at),
      membership_order_id = v_order.id,
      access_expires_at = v_expires_at
  from public.courses c
  where e.student_id = v_order.student_id
    and e.course_id = c.id
    and c.status::text = 'published'
    and (e.membership_order_id is not null or e.status::text <> 'approved');

  insert into public.enrollments (
    student_id, course_id, status, approved_at, paid_amount, membership_order_id, access_expires_at
  )
  select v_order.student_id, c.id, 'approved', v_starts_at, 0, v_order.id, v_expires_at
  from public.courses c
  where c.status::text = 'published'
    and not exists (
      select 1
      from public.enrollments e
      where e.student_id = v_order.student_id and e.course_id = c.id
    );

  return v_expires_at;
end;
$$;

revoke all on function public.activate_student_membership_for_charge(text) from public, anon, authenticated;
grant execute on function public.activate_student_membership_for_charge(text) to service_role;

notify pgrst, 'reload schema';

commit;
