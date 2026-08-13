-- Phase 5 (Realtime) — RLS policies + publication.
--
-- Supabase Realtime delivers `postgres_changes` only for rows the subscribing
-- role (authenticated) may SELECT under RLS. So we (1) enable RLS on the four
-- tables the UI subscribes to, (2) add SELECT policies scoped to who should
-- receive each stream, and (3) add the tables to the supabase_realtime
-- publication.
--
-- SAFE FOR PRISMA: the app's Prisma connection uses the `postgres` pooler role
-- (table owner) which BYPASSES RLS, so server-side queries are unaffected. The
-- app never reads these tables through the anon/authenticated client — only
-- Realtime does. Idempotent: safe to re-run.
--
-- Apply via: Supabase Dashboard → SQL Editor, or
--   psql "$DIRECT_URL" -f supabase/phase5_realtime.sql

-- 0) Base privileges. `db push --force-reset` drops & recreates the public
--    schema, which wipes Supabase's default grants to anon/authenticated. RLS
--    only filters AFTER a base GRANT SELECT succeeds, so without these the
--    Realtime authenticated role gets "permission denied for schema public" and
--    receives zero postgres_changes events. Row visibility is still governed by
--    the RLS policies below.
grant usage on schema public to anon, authenticated;
grant select on public."Notification", public."Vendor", public."DeptReview", public."Document"
  to authenticated;

-- Helper: the app User.id for the current auth user. SECURITY DEFINER so the
-- policies below can read "User" without granting authenticated SELECT on it
-- (which would expose emails / legacy hashes via the API).
create or replace function public.current_app_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from public."User" where "authUserId" = auth.uid()::text limit 1;
$$;

-- Helper: is the current auth user a staff member (Admin or Dept reviewer)?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public."User" u
    where u."authUserId" = auth.uid()::text  -- authUserId is text; auth.uid() is uuid
      and u.role in ('ADMIN', 'DEPT')
      and u.active
  );
$$;

-- 1) Notifications — a user sees only their own rows.
alter table public."Notification" enable row level security;
alter table public."Notification" replica identity full; -- so filtered UPDATE/DELETE events match
drop policy if exists "rt_own_notifications" on public."Notification";
create policy "rt_own_notifications" on public."Notification"
  for select to authenticated
  using ("userId" = public.current_app_user_id());

-- 2) Vendor / DeptReview / Document — staff (Admin + Dept) receive changes.
--    Vendors do NOT subscribe to these (out of scope), and the policy denies
--    them anyway, so no vendor can eavesdrop on the whole pipeline.
alter table public."Vendor" enable row level security;
drop policy if exists "rt_staff_vendor" on public."Vendor";
create policy "rt_staff_vendor" on public."Vendor"
  for select to authenticated using (public.is_staff());

alter table public."DeptReview" enable row level security;
alter table public."DeptReview" replica identity full; -- filter is on departmentId
drop policy if exists "rt_staff_deptreview" on public."DeptReview";
create policy "rt_staff_deptreview" on public."DeptReview"
  for select to authenticated using (public.is_staff());

alter table public."Document" enable row level security;
drop policy if exists "rt_staff_document" on public."Document";
create policy "rt_staff_document" on public."Document"
  for select to authenticated using (public.is_staff());

-- 3) Add the tables to the Realtime publication (guarded — ADD TABLE errors if
--    already a member).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Notification'
  ) then execute 'alter publication supabase_realtime add table public."Notification"'; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Vendor'
  ) then execute 'alter publication supabase_realtime add table public."Vendor"'; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'DeptReview'
  ) then execute 'alter publication supabase_realtime add table public."DeptReview"'; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Document'
  ) then execute 'alter publication supabase_realtime add table public."Document"'; end if;
end $$;
