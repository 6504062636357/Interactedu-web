-- Reconstructed from live Supabase schema (2026-09-16).
-- Note: an earlier, differently-named attempt at this same behavior lives
-- in this repo at supabase/migrations/202609130001_profile_self_updates.sql
-- (policy "Users update own profile details" / trigger
-- protect_profile_identity_on_self_update). That file was NOT what actually
-- got applied — this migration and the next one were run instead, under
-- the names below. Keeping both files for now; the objects created here
-- are the ones truly live in production.
alter table public.profiles enable row level security;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);
