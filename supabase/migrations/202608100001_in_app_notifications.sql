-- In-app notifications for students, teachers, and administrators.
-- Server-side code creates notifications with the service-role key. End users
-- can only read and update the read state of their own rows.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null default '',
  related_type text null,
  related_id uuid null,
  action_url text null,
  dedupe_key text null,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

-- Keep this migration compatible with an early notifications table that may
-- already exist in a Supabase project.
alter table public.notifications
  add column if not exists type text not null default 'system',
  add column if not exists message text not null default '',
  add column if not exists related_type text null,
  add column if not exists related_id uuid null,
  add column if not exists action_url text null,
  add column if not exists dedupe_key text null,
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz null,
  add column if not exists created_at timestamptz not null default now();

-- Migrate the legacy link column when it is present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'link'
  ) then
    execute 'update public.notifications set action_url = link where action_url is null';
  end if;
end
$$;

create index if not exists notifications_user_created_at_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where is_read = false;

create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications(dedupe_key);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;
revoke insert, delete on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;

-- Supabase Realtime requires the table in the supabase_realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
