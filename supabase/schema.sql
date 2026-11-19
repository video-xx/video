-- Aevy: complete Supabase schema (website project) in ONE file: tables, Row Level Security, functions, storage, video catalog.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run (idempotent).
-- Also needed in the dashboard: Authentication -> Sign In / Providers -> "Allow anonymous sign-ins" ON (guest accounts).
-- NOTE: /social (Aevy Social chat) uses its OWN Supabase project and its own schema; it must not be merged here
--       (same table names, different columns).

-- ---------- profiles: public info only (email stays in auth.users) ----------
create table if not exists public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  name     text not null check (char_length(name) between 1 and 40),
  bio      text not null default '' check (char_length(bio) <= 280),
  color    text not null default '#c8f53c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created  timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (username);

-- Profile page details (photo, cover, location, website). Photos live in Storage bucket "avatars" (see end of file).
alter table public.profiles add column if not exists avatar   text not null default '' check (char_length(avatar) <= 400);
alter table public.profiles add column if not exists cover    text not null default '' check (char_length(cover) <= 400);
alter table public.profiles add column if not exists location text not null default '' check (char_length(location) <= 40);
alter table public.profiles add column if not exists website  text not null default '' check (char_length(website) <= 100 and (website = '' or website ~* '^https?://[^\s]+$'));

alter table public.profiles add column if not exists role     text    not null default 'user';
alter table public.profiles add column if not exists verified boolean not null default false;
alter table public.profiles add column if not exists guest    boolean not null default false;

-- ---------- scripts: metadata ----------
create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  lang        text not null check (lang in ('javascript','typescript','python','bash','lua','go','rust','html','css','json','text')),
  author      text not null default '' check (char_length(author) <= 40),
  description text not null default '' check (char_length(description) <= 220),
  tags        text[] not null default '{}' check (cardinality(tags) <= 8),
  cat         text not null default 'Other' check (cat in ('Vehicles & Tuning','Visual & Graphics','Gameplay & Physics','Tools & Utilities','Maps & Environment','Other')),
  vis         text not null default 'public' check (vis in ('public','private')),
  video       text not null default '' check (char_length(video) <= 300),
  size        integer not null default 0 check (size between 0 and 2097152),
  lines       integer not null default 0 check (lines >= 0),
  preview     text not null default '' check (char_length(preview) <= 1500),
  created     timestamptz not null default now(),
  updated     timestamptz not null default now()
);
create index if not exists scripts_owner_idx on public.scripts (owner);
create index if not exists scripts_vis_created_idx on public.scripts (vis, created desc);

-- ---------- script_files: the file content itself (max 2 MB) ----------
create table if not exists public.script_files (
  script_id uuid primary key references public.scripts(id) on delete cascade,
  code      text not null check (octet_length(code) <= 2097152)
);

-- Any file type is accepted: binary / encrypted files are stored as base64 (about 4/3 of the original size),
-- and the original file extension is kept so downloads come back as the same file type.
alter table public.scripts add column if not exists ext text not null default '' check (ext ~ '^[a-z0-9]{0,10}$');
alter table public.script_files drop constraint if exists script_files_code_check;
alter table public.script_files drop constraint if exists script_files_code_size;
alter table public.script_files add constraint script_files_code_size check (octet_length(code) <= 3145728);

-- ---------- live counters (only the functions below can change them) ----------
alter table public.scripts add column if not exists downloads    integer not null default 0;
alter table public.scripts add column if not exists views        integer not null default 0;
alter table public.scripts add column if not exists likes        integer not null default 0;
alter table public.scripts add column if not exists rating_sum   integer not null default 0;
alter table public.scripts add column if not exists rating_count integer not null default 0;

-- ---------- community: likes, comments and reviews ----------
create table if not exists public.script_likes (
  script_id uuid not null references public.scripts(id) on delete cascade,
  owner     uuid not null references public.profiles(id) on delete cascade,
  created   timestamptz not null default now(),
  primary key (script_id, owner)
);
create index if not exists script_likes_owner_idx on public.script_likes (owner);

create table if not exists public.script_comments (
  id        uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  owner     uuid not null references public.profiles(id) on delete cascade,
  body      text not null check (char_length(btrim(body)) between 1 and 600),
  rating    smallint check (rating between 1 and 5),   -- set = this comment is a star review
  created   timestamptz not null default now()
);
create index if not exists script_comments_script_idx on public.script_comments (script_id, created desc);
create index if not exists script_comments_created_idx on public.script_comments (created desc);
create unique index if not exists script_comments_one_review on public.script_comments (script_id, owner) where rating is not null;

-- ---------- traffic: one row per day, plus de-duplication tables (no client access) ----------
create table if not exists public.daily_stats (
  day       date primary key,
  visitors  integer not null default 0,
  views     integer not null default 0,
  downloads integer not null default 0
);
create table if not exists public.visitors_daily (day date not null, vid uuid not null, primary key (day, vid));
create table if not exists public.script_views    (day date not null, script_id uuid not null references public.scripts(id) on delete cascade, vid uuid not null, primary key (day, script_id, vid));

-- ---------- videos: strictly private saved videos ----------
create table if not exists public.videos (
  id      uuid primary key default gen_random_uuid(),
  owner   uuid not null references public.profiles(id) on delete cascade,
  url     text not null check (char_length(url) <= 500),
  title   text not null default '' check (char_length(title) <= 90),
  created timestamptz not null default now()
);
create index if not exists videos_owner_idx on public.videos (owner);

-- ---------- triggers ----------
-- Owner, created and updated can never be forged or changed by the client.
create or replace function public.scripts_guard() returns trigger
language plpgsql as $$
declare sys boolean := coalesce(current_setting('aevy.sys', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    new.created := now();
    new.updated := now();
    if not sys then   -- nobody can start a script with fake counters
      new.downloads := 0; new.views := 0; new.likes := 0; new.rating_sum := 0; new.rating_count := 0;
    end if;
  else
    new.owner   := old.owner;
    new.created := old.created;
    if sys then
      new.updated := old.updated;   -- counter bumps are not edits
    else
      new.updated := now();
      new.downloads := old.downloads; new.views := old.views; new.likes := old.likes;
      new.rating_sum := old.rating_sum; new.rating_count := old.rating_count;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists scripts_guard on public.scripts;
create trigger scripts_guard before insert or update on public.scripts
  for each row execute function public.scripts_guard();

create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
declare sys boolean := coalesce(current_setting('aevy.sys', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if not sys and auth.uid() is not null then new.role := 'user'; new.verified := false; new.guest := false; end if;   -- nobody can sign up as admin / verified / guest
    return new;
  end if;
  new.id       := old.id;
  new.username := old.username;   -- usernames are permanent
  new.created  := old.created;
  if not sys and auth.uid() is not null then new.role := old.role; new.verified := old.verified; new.guest := old.guest; end if;   -- role + badge are server-controlled (the SQL editor has no auth.uid(), so you can still grant Admin)
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Lets a signed-in user delete their own account (cascades to profile, scripts, files, videos).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles     enable row level security;
alter table public.scripts      enable row level security;
alter table public.script_files enable row level security;
alter table public.videos       enable row level security;

-- profiles: public read; only the owner writes their own row
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated using (id = (select auth.uid()));

-- scripts: public ones readable by everyone, private only by the owner; only the owner writes
drop policy if exists scripts_read   on public.scripts;
drop policy if exists scripts_insert on public.scripts;
drop policy if exists scripts_update on public.scripts;
drop policy if exists scripts_delete on public.scripts;
create policy scripts_read   on public.scripts for select using (vis = 'public' or owner = (select auth.uid()));
create policy scripts_insert on public.scripts for insert to authenticated with check (owner = (select auth.uid()));
create policy scripts_update on public.scripts for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy scripts_delete on public.scripts for delete to authenticated using (owner = (select auth.uid()));

-- script_files: follows the visibility of its script
drop policy if exists files_read   on public.script_files;
drop policy if exists files_insert on public.script_files;
drop policy if exists files_update on public.script_files;
drop policy if exists files_delete on public.script_files;
create policy files_read on public.script_files for select using (
  exists (select 1 from public.scripts s where s.id = script_id and (s.vis = 'public' or s.owner = (select auth.uid()))));
create policy files_insert on public.script_files for insert to authenticated with check (
  exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())));
create policy files_update on public.script_files for update to authenticated
  using      (exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())))
  with check (exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())));
create policy files_delete on public.script_files for delete to authenticated using (
  exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())));

-- videos: strictly private
drop policy if exists videos_read   on public.videos;
drop policy if exists videos_insert on public.videos;
drop policy if exists videos_delete on public.videos;
create policy videos_read   on public.videos for select to authenticated using (owner = (select auth.uid()));
create policy videos_insert on public.videos for insert to authenticated with check (owner = (select auth.uid()));
create policy videos_delete on public.videos for delete to authenticated using (owner = (select auth.uid()));

-- ---------- grants ----------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.scripts, public.script_files to anon;
grant select, insert, update, delete on public.profiles, public.scripts, public.script_files, public.videos to authenticated;


-- =====================================================================================
-- Counters, likes, reviews and live traffic
-- =====================================================================================

-- "Today" is counted in this time zone. Change it to yours (e.g. 'UTC', 'America/New_York').
create or replace function public.aevy_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Dhaka')::date $$;

-- Marks the current transaction as a trusted counter update (see scripts_guard).
create or replace function public.aevy_sys() returns void
language sql as $$ select set_config('aevy.sys', '1', true) $$;
revoke all on function public.aevy_sys() from public, anon, authenticated;

create or replace function public.bump_daily(v int, w int, d int) returns void
language sql security definer set search_path = public as $$
  insert into public.daily_stats (day, visitors, views, downloads) values (public.aevy_today(), v, w, d)
  on conflict (day) do update set visitors = daily_stats.visitors + v, views = daily_stats.views + w, downloads = daily_stats.downloads + d
$$;
revoke all on function public.bump_daily(int, int, int) from public, anon, authenticated;

-- One visitor = one random id kept in the browser; counted once per day.
create or replace function public.track_visit(v uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.visitors_daily (day, vid) values (public.aevy_today(), v) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform public.bump_daily(1, 0, 0); end if;
  delete from public.visitors_daily where day < public.aevy_today() - 1;
  delete from public.script_views   where day < public.aevy_today() - 1;
end $$;

-- A script view counts once per visitor, per script, per day.
create or replace function public.track_view(sid uuid, v uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.scripts where id = sid and (vis = 'public' or owner = auth.uid())) then return; end if;
  insert into public.script_views (day, script_id, vid) values (public.aevy_today(), sid, v) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    perform public.aevy_sys();
    update public.scripts set views = views + 1 where id = sid;
    perform public.bump_daily(0, 1, 0);
  end if;
end $$;

-- Every download counts (a zip counts each script inside it).
create or replace function public.track_download(ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.aevy_sys();
  update public.scripts set downloads = downloads + 1
   where id = any (ids[1:100]) and (vis = 'public' or owner = auth.uid());
  get diagnostics n = row_count;
  if n > 0 then perform public.bump_daily(0, 0, n); end if;
end $$;

create or replace function public.get_today() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('day', public.aevy_today(),
    'visitors',  coalesce((select visitors  from public.daily_stats where day = public.aevy_today()), 0),
    'views',     coalesce((select views     from public.daily_stats where day = public.aevy_today()), 0),
    'downloads', coalesce((select downloads from public.daily_stats where day = public.aevy_today()), 0))
$$;

revoke all on function public.track_visit(uuid), public.track_view(uuid, uuid), public.track_download(uuid[]), public.get_today() from public;
grant execute on function public.track_visit(uuid), public.track_view(uuid, uuid), public.track_download(uuid[]), public.get_today() to anon, authenticated;

-- likes keep scripts.likes in step
create or replace function public.likes_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.aevy_sys();
  if tg_op = 'INSERT' then update public.scripts set likes = likes + 1 where id = new.script_id;
  else update public.scripts set likes = greatest(likes - 1, 0) where id = old.script_id; end if;
  return null;
end $$;
drop trigger if exists likes_count on public.script_likes;
create trigger likes_count after insert or delete on public.script_likes for each row execute function public.likes_count();

-- reviews keep scripts.rating_sum / rating_count in step; you cannot rate your own script
create or replace function public.reviews_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rating is not null and exists (select 1 from public.scripts where id = new.script_id and owner = new.owner) then
    raise exception 'You cannot rate your own script';
  end if;
  new.created := now();
  return new;
end $$;
drop trigger if exists reviews_guard on public.script_comments;
create trigger reviews_guard before insert on public.script_comments for each row execute function public.reviews_guard();

create or replace function public.reviews_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.aevy_sys();
  if tg_op = 'INSERT' and new.rating is not null then
    update public.scripts set rating_sum = rating_sum + new.rating, rating_count = rating_count + 1 where id = new.script_id;
  elsif tg_op = 'DELETE' and old.rating is not null then
    update public.scripts set rating_sum = greatest(rating_sum - old.rating, 0), rating_count = greatest(rating_count - 1, 0) where id = old.script_id;
  end if;
  return null;
end $$;
drop trigger if exists reviews_count on public.script_comments;
create trigger reviews_count after insert or delete on public.script_comments for each row execute function public.reviews_count();

-- ---------- RLS for the new tables ----------
alter table public.script_likes    enable row level security;
alter table public.script_comments enable row level security;
alter table public.daily_stats     enable row level security;
alter table public.visitors_daily  enable row level security;   -- no policies: only the functions above touch these
alter table public.script_views    enable row level security;

drop policy if exists likes_read   on public.script_likes;
drop policy if exists likes_insert on public.script_likes;
drop policy if exists likes_delete on public.script_likes;
-- (the subquery on scripts is itself filtered by RLS, so only scripts you may see count)
create policy likes_read   on public.script_likes for select using (exists (select 1 from public.scripts s where s.id = script_id));
create policy likes_insert on public.script_likes for insert to authenticated
  with check (owner = (select auth.uid()) and exists (select 1 from public.scripts s where s.id = script_id));
create policy likes_delete on public.script_likes for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists comments_read   on public.script_comments;
drop policy if exists comments_insert on public.script_comments;
drop policy if exists comments_delete on public.script_comments;
create policy comments_read   on public.script_comments for select using (exists (select 1 from public.scripts s where s.id = script_id));
create policy comments_insert on public.script_comments for insert to authenticated
  with check (owner = (select auth.uid()) and exists (select 1 from public.scripts s where s.id = script_id));
-- the author of a comment, or the owner of the script, can delete it
create policy comments_delete on public.script_comments for delete to authenticated using (
  owner = (select auth.uid()) or exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())));

drop policy if exists daily_read on public.daily_stats;
create policy daily_read on public.daily_stats for select using (true);

grant select on public.script_likes, public.script_comments, public.daily_stats to anon;
grant select, insert, delete on public.script_likes, public.script_comments to authenticated;
grant select on public.daily_stats to authenticated;


-- =====================================================================================
-- Badges and ranks: Verified (blue check), Admin rank, New-user badge
--   Creator (blue check) = the user has published 3 or more PUBLIC scripts (set automatically by triggers), or is an Admin.
--   Admin     = profiles.role = 'admin'. Only you can grant it (SQL editor, see the bottom of this block).
--   New       = account is younger than aevy_new_user_days() days. Older accounts get no badge.
-- =====================================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','admin'));
create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';

-- Settings you can change: how many public scripts earn the blue check, and how long the "New" badge lasts.
create or replace function public.aevy_verify_scripts() returns int language sql immutable as $$ select 3 $$;
create or replace function public.aevy_new_user_days()  returns int language sql immutable as $$ select 7 $$;

-- true while the account is still "new" (used by the badge view below; the site uses the same rule)
create or replace function public.is_new_user(created_at timestamptz) returns boolean
language sql stable as $$ select created_at > now() - make_interval(days => public.aevy_new_user_days()) $$;

create or replace function public.is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false)
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

-- Recomputes the verified flag of one user.
create or replace function public.refresh_verified(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; adm boolean;
begin
  select count(*) into n from public.scripts where owner = uid and vis = 'public';
  select (role = 'admin') into adm from public.profiles where id = uid;
  perform public.aevy_sys();
  update public.profiles set verified = (coalesce(adm, false) or n >= public.aevy_verify_scripts())
   where id = uid and verified is distinct from (coalesce(adm, false) or n >= public.aevy_verify_scripts());
end $$;
revoke all on function public.refresh_verified(uuid) from public, anon, authenticated;

create or replace function public.scripts_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_verified(new.owner); end if;
  if tg_op = 'DELETE' then perform public.refresh_verified(old.owner); end if;
  return null;
end $$;
drop trigger if exists scripts_verify on public.scripts;
create trigger scripts_verify after insert or update of vis or delete on public.scripts
  for each row execute function public.scripts_verify();

-- Admins are always verified, whenever their role changes (e.g. when you run the SQL at the bottom).
create or replace function public.profiles_role_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then perform public.refresh_verified(new.id); end if;
  return null;
end $$;
drop trigger if exists profiles_role_verify on public.profiles;
create trigger profiles_role_verify after update of role on public.profiles
  for each row execute function public.profiles_role_verify();

-- Backfill: existing accounts get the right badge now.
do $$
declare r record;
begin
  for r in select id from public.profiles loop perform public.refresh_verified(r.id); end loop;
end $$;

-- Convenience view for dashboards / SQL: every profile with its computed badges.
create or replace view public.profile_badges with (security_invoker = true) as
  select id, username, name, role, verified, created,
         public.is_new_user(created) as is_new,
         (role = 'admin')            as is_admin
  from public.profiles;
grant select on public.profile_badges to anon, authenticated;

-- Admin rank powers: moderate (delete) any public script, its file, or any comment. Admins cannot edit other people's scripts.
drop policy if exists scripts_admin_delete on public.scripts;
drop policy if exists scripts_admin_read   on public.scripts;   -- (removed: private scripts stay private, even from Admins)
drop policy if exists files_admin_delete   on public.script_files;
drop policy if exists comments_admin_delete on public.script_comments;
create policy scripts_admin_delete  on public.scripts         for delete to authenticated using (public.is_admin());
create policy files_admin_delete    on public.script_files    for delete to authenticated using (public.is_admin());
create policy comments_admin_delete on public.script_comments for delete to authenticated using (public.is_admin());

-- Make profiles realtime so a new badge appears without a refresh.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ---------- HOW TO MAKE SOMEONE ADMIN (run in the SQL editor; clients can never do this themselves) ----------
--   update public.profiles set role = 'admin' where username = 'your_username';
-- To remove it:
--   update public.profiles set role = 'user'  where username = 'your_username';


-- =====================================================================================
-- Social: follow / following, direct messages, online status
-- =====================================================================================

-- ---------- follows ----------
create table if not exists public.follows (
  follower  uuid not null references public.profiles(id) on delete cascade,
  following uuid not null references public.profiles(id) on delete cascade,
  created   timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);
create index if not exists follows_following_idx on public.follows (following);
alter table public.follows enable row level security;
drop policy if exists follows_read   on public.follows;
drop policy if exists follows_insert on public.follows;
drop policy if exists follows_delete on public.follows;
create policy follows_read   on public.follows for select using (true);
create policy follows_insert on public.follows for insert to authenticated with check (follower = (select auth.uid()));
create policy follows_delete on public.follows for delete to authenticated using (follower = (select auth.uid()));
grant select on public.follows to anon;
grant select, insert, delete on public.follows to authenticated;

-- ---------- direct messages (only the sender and the recipient can ever read a message) ----------
create table if not exists public.messages (
  id        uuid primary key default gen_random_uuid(),
  sender    uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  body      text not null check (char_length(btrim(body)) between 1 and 2000),
  created   timestamptz not null default now(),
  read_at   timestamptz,
  check (sender <> recipient)
);
create index if not exists messages_recipient_idx on public.messages (recipient, created desc);
create index if not exists messages_sender_idx    on public.messages (sender, created desc);
alter table public.messages enable row level security;
drop policy if exists messages_read   on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_delete on public.messages;
create policy messages_read   on public.messages for select to authenticated
  using (sender = (select auth.uid()) or recipient = (select auth.uid()));
create policy messages_insert on public.messages for insert to authenticated with check (sender = (select auth.uid()));
create policy messages_delete on public.messages for delete to authenticated using (sender = (select auth.uid()));   -- unsend your own
grant select, insert, delete on public.messages to authenticated;   -- no UPDATE grant: read receipts go through mark_read()

-- created / read_at cannot be forged; spam limit: 30 messages per minute per user
create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created := now(); new.read_at := null; new.body := btrim(new.body);
  if (select count(*) from public.messages where sender = new.sender and created > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too fast. Wait a moment';
  end if;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.messages_guard();

-- the recipient marks a whole conversation as read
create or replace function public.mark_read(other uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now() where recipient = auth.uid() and sender = other and read_at is null
$$;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;

-- ---------- online / offline status ----------
-- Kept in its own table (not in profiles) so the heartbeat does not trigger profile realtime updates.
create table if not exists public.presence (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now(),
  hidden    boolean not null default false     -- "Show my online status" switched off
);
alter table public.presence enable row level security;
drop policy if exists presence_read on public.presence;   -- no direct access: only touch_presence() / get_presence() (hidden users stay hidden)
revoke select on public.presence from anon, authenticated;

-- Called every minute by the open site. Online = seen in the last 2 minutes.
create or replace function public.touch_presence(hide boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.presence (user_id, last_seen, hidden) values (auth.uid(), now(), coalesce(hide, false))
  on conflict (user_id) do update set last_seen = now(), hidden = coalesce(hide, presence.hidden);
end $$;
revoke all on function public.touch_presence(boolean) from public, anon;
grant execute on function public.touch_presence(boolean) to authenticated;


-- Realtime: new messages arrive instantly (Realtime respects the policies above), follows update live counts.
do $$
declare t text;
begin
  foreach t in array array['messages','follows'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================================
-- Community posts: text posts (optionally with one of your public scripts attached), likes, comments
-- =====================================================================================
create table if not exists public.posts (
  id        uuid primary key default gen_random_uuid(),
  owner     uuid not null references public.profiles(id) on delete cascade,
  body      text not null default '',
  script_id uuid references public.scripts(id) on delete set null,
  image     text not null default '' check (image = '' or image ~ '^https://'),
  likes     integer not null default 0,
  comments  integer not null default 0,
  created   timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created desc);
create index if not exists posts_owner_idx   on public.posts (owner, created desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  owner   uuid not null references public.profiles(id) on delete cascade,
  created timestamptz not null default now(),
  primary key (post_id, owner)
);
create index if not exists post_likes_owner_idx on public.post_likes (owner);

create table if not exists public.post_comments (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  owner   uuid not null references public.profiles(id) on delete cascade,
  body    text not null check (char_length(btrim(body)) between 1 and 500),
  created timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created);

-- counters and timestamps cannot be forged; 10 posts per minute per user
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.likes := 0; new.comments := 0; new.created := now(); new.body := btrim(new.body);
  if (select count(*) from public.posts where owner = new.owner and created > now() - interval '1 minute') >= 10 then
    raise exception 'You are posting too fast. Wait a moment';
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert on public.posts for each row execute function public.posts_guard();

create or replace function public.post_comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created := now(); new.body := btrim(new.body);
  if (select count(*) from public.post_comments where owner = new.owner and created > now() - interval '1 minute') >= 20 then
    raise exception 'You are commenting too fast. Wait a moment';
  end if;
  return new;
end $$;
drop trigger if exists post_comments_guard on public.post_comments;
create trigger post_comments_guard before insert on public.post_comments for each row execute function public.post_comments_guard();

create or replace function public.post_likes_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.posts set likes = likes + 1 where id = new.post_id;
  else update public.posts set likes = greatest(likes - 1, 0) where id = old.post_id; end if;
  return null;
end $$;
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count after insert or delete on public.post_likes for each row execute function public.post_likes_count();

create or replace function public.post_comments_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.posts set comments = comments + 1 where id = new.post_id;
  else update public.posts set comments = greatest(comments - 1, 0) where id = old.post_id; end if;
  return null;
end $$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or delete on public.post_comments for each row execute function public.post_comments_count();

alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;
drop policy if exists posts_read   on public.posts;
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_delete on public.posts;
create policy posts_read   on public.posts for select using (true);
-- an attached script must be one of your own public scripts
create policy posts_insert on public.posts for insert to authenticated with check (
  owner = (select auth.uid()) and (script_id is null or exists (
    select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid()) and s.vis = 'public')));
create policy posts_delete on public.posts for delete to authenticated using (owner = (select auth.uid()) or public.is_admin());

drop policy if exists plikes_read   on public.post_likes;
drop policy if exists plikes_insert on public.post_likes;
drop policy if exists plikes_delete on public.post_likes;
create policy plikes_read   on public.post_likes for select using (true);
create policy plikes_insert on public.post_likes for insert to authenticated with check (owner = (select auth.uid()));
create policy plikes_delete on public.post_likes for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists pcomments_read   on public.post_comments;
drop policy if exists pcomments_insert on public.post_comments;
drop policy if exists pcomments_delete on public.post_comments;
create policy pcomments_read   on public.post_comments for select using (true);
create policy pcomments_insert on public.post_comments for insert to authenticated with check (owner = (select auth.uid()));
-- the commenter, the post's author, or an Admin can delete a comment
create policy pcomments_delete on public.post_comments for delete to authenticated using (
  owner = (select auth.uid()) or public.is_admin()
  or exists (select 1 from public.posts p where p.id = post_id and p.owner = (select auth.uid())));

grant select on public.posts, public.post_likes, public.post_comments to anon;
grant select, insert, delete on public.posts, public.post_likes, public.post_comments to authenticated;

do $$
declare t text;
begin
  foreach t in array array['posts','post_comments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Realtime (live counters, reviews and feed) ----------
do $$
declare t text;
begin
  foreach t in array array['scripts','script_comments','script_likes','daily_stats'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================================
-- Profile photos: public Storage bucket "avatars"; each user can only write inside their own folder (<user id>/...)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_read   on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ---------- Saved scripts (private bookmarks) and pinned scripts (up to 3 on your profile) ----------
create table if not exists public.script_saves (
  script_id uuid not null references public.scripts(id) on delete cascade,
  owner     uuid not null references public.profiles(id) on delete cascade,
  created   timestamptz not null default now(),
  primary key (script_id, owner)
);
create index if not exists script_saves_owner_idx on public.script_saves (owner, created desc);

create table if not exists public.script_pins (
  script_id uuid not null references public.scripts(id) on delete cascade,
  owner     uuid not null references public.profiles(id) on delete cascade,
  created   timestamptz not null default now(),
  primary key (script_id, owner)
);
create index if not exists script_pins_owner_idx on public.script_pins (owner, created);

create or replace function public.pins_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.script_pins where owner = new.owner) >= 3 then
    raise exception 'You can pin up to 3 scripts. Unpin one first.';
  end if;
  return new;
end $$;
drop trigger if exists pins_limit on public.script_pins;
create trigger pins_limit before insert on public.script_pins for each row execute function public.pins_limit();

alter table public.script_saves enable row level security;
alter table public.script_pins  enable row level security;

drop policy if exists saves_read   on public.script_saves;
drop policy if exists saves_insert on public.script_saves;
drop policy if exists saves_delete on public.script_saves;
create policy saves_read   on public.script_saves for select to authenticated using (owner = (select auth.uid()));
create policy saves_insert on public.script_saves for insert to authenticated
  with check (owner = (select auth.uid()) and exists (select 1 from public.scripts s where s.id = script_id));
create policy saves_delete on public.script_saves for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists pins_read   on public.script_pins;
drop policy if exists pins_insert on public.script_pins;
drop policy if exists pins_delete on public.script_pins;
create policy pins_read   on public.script_pins for select using (exists (select 1 from public.scripts s where s.id = script_id));
create policy pins_insert on public.script_pins for insert to authenticated
  with check (owner = (select auth.uid()) and exists (select 1 from public.scripts s where s.id = script_id and s.owner = (select auth.uid())));
create policy pins_delete on public.script_pins for delete to authenticated using (owner = (select auth.uid()));

grant select, insert, delete on public.script_saves to authenticated;
grant select on public.script_pins to anon;
grant select, insert, delete on public.script_pins to authenticated;

-- ---------- Reports (Report button on scripts and profiles) ----------
-- Signed-in users can report a script or a profile. Only you (Admin) can read them: Supabase > Table Editor > reports.
create table if not exists public.reports (
  id       uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind     text not null check (kind in ('script','profile')),
  target   uuid not null,
  reason   text not null check (reason in ('malware','spam','impersonation','harassment','copyright','other')),
  details  text not null default '' check (char_length(details) <= 500),
  status   text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created  timestamptz not null default now(),
  unique (reporter, kind, target)
);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
drop policy if exists reports_read   on public.reports;
drop policy if exists reports_admin  on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter = (select auth.uid()));
create policy reports_read   on public.reports for select to authenticated using (reporter = (select auth.uid()) or public.is_admin());
create policy reports_admin  on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.reports to authenticated;


-- =====================================================================================
-- Guest accounts: "no account, no entry". A visitor taps "Continue as guest" and gets an anonymous
-- Supabase account with an auto-generated username and name. Guests can ONLY message other guests:
-- the database refuses their likes, comments, follows, posts and scripts (restrictive policies below).
-- Dashboard: Authentication > Sign In / Providers > turn ON "Allow anonymous sign-ins".
-- =====================================================================================
create or replace function public.is_guest(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select guest from public.profiles where id = uid), false)
$$;
grant execute on function public.is_guest(uuid) to anon, authenticated;

-- Creates the profile at sign-up (email sign-ups pass username + name as metadata; anonymous sign-ins become guests).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  un text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  nm text := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), un), 40);
  adj  text[] := array['calm','brave','happy','swift','sunny','lucky','cosmic','misty','cool','bright','gentle','witty','royal','neon','wild','silent'];
  noun text[] := array['fox','owl','panda','tiger','koala','falcon','otter','lynx','wolf','comet','river','cloud','maple','pixel','ember','orca'];
  i int := 0;
  cols text[] := array['#c8f53c','#5ec8ff','#ff9f5a','#c792ff','#ff6b8b','#4de0b0'];
begin
  if coalesce(new.is_anonymous, false) then
    loop
      un := adj[1 + floor(random() * array_length(adj, 1))::int] || '_' || noun[1 + floor(random() * array_length(noun, 1))::int] || '_' || (100 + floor(random() * 900))::int;
      i := i + 1;
      exit when i > 25 or not exists (select 1 from public.profiles where username = un);
    end loop;
    insert into public.profiles (id, username, name, color, guest)
    values (new.id, un, initcap(replace(left(un, length(un) - 4), '_', ' ')), cols[1 + abs(hashtext(un)) % 6], true);
    return new;
  end if;
  if un ~ '^[a-z0-9_]{3,20}$' then
    insert into public.profiles (id, username, name, color)
    values (new.id, un, nm, cols[1 + abs(hashtext(un)) % 6]);
  end if;
  return new;
end $$;

-- Guests cannot create anything public (restrictive policies are ANDed with the normal ones).
do $$
declare t text;
begin
  foreach t in array array['scripts','script_files','script_likes','script_comments','follows','posts','post_likes','post_comments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists guest_block on public.%I', t);
      execute format('create policy guest_block on public.%I as restrictive for insert to authenticated with check (not public.is_guest())', t);
    end if;
  end loop;
end $$;

-- Guests can message only other guests.
drop policy if exists guest_msg on public.messages;
create policy guest_msg on public.messages as restrictive for insert to authenticated
  with check (not public.is_guest() or public.is_guest(recipient));

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Optional cleanup: delete guest accounts not used for N days (run by hand, or schedule with pg_cron).
create or replace function public.purge_old_guests(days int default 30) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  with d as (delete from auth.users u using public.profiles p
             where p.id = u.id and p.guest and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => days) returning 1)
  select count(*) into n from d;
  return n;
end $$;
revoke all on function public.purge_old_guests(int) from public, anon, authenticated;


-- =====================================================================================
-- Encrypted messages + guest isolation (v7). Safe to run again.
-- Messages are encrypted in the browser (js/e2e.js). The database only ever sees "e2e1:<ciphertext>".
-- =====================================================================================

-- Public keys: everyone signed in can read the key of someone they may talk to; only the owner can write theirs.
create table if not exists public.user_keys (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pubkey  text not null check (char_length(pubkey) between 40 and 400),
  updated timestamptz not null default now()
);
alter table public.user_keys enable row level security;
drop policy if exists user_keys_read   on public.user_keys;
drop policy if exists user_keys_insert on public.user_keys;
drop policy if exists user_keys_update on public.user_keys;
-- guests and members live in separate worlds: you can only read keys of your own kind (and your own)
create policy user_keys_read   on public.user_keys for select to authenticated
  using (user_id = (select auth.uid()) or public.is_guest(user_id) = public.is_guest());
create policy user_keys_insert on public.user_keys for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_keys_update on public.user_keys for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_keys to authenticated;
revoke all on public.user_keys from anon;

-- Recovery backup: the PRIVATE key, already encrypted in the browser with the user's passphrase. Owner only.
create table if not exists public.key_backups (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  blob    text not null check (char_length(blob) <= 4000),
  updated timestamptz not null default now()
);
alter table public.key_backups enable row level security;
drop policy if exists key_backups_own on public.key_backups;
create policy key_backups_own on public.key_backups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.key_backups to authenticated;
revoke all on public.key_backups from anon;

-- Ciphertext is longer than the text it hides.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(btrim(body)) between 1 and 16000);
-- From now on the server refuses plain text. (NOT VALID: messages sent before this update stay readable.)
alter table public.messages drop constraint if exists messages_encrypted;
alter table public.messages add constraint messages_encrypted check (body like 'e2e1:%') not valid;

-- Guests are invisible to members: guests can browse public scripts,
-- but a guest profile can only be seen by that guest and by other guests.
drop policy if exists guest_profiles on public.profiles;
create policy guest_profiles on public.profiles as restrictive for select
  using (not guest or id = (select auth.uid()) or public.is_guest());

-- A conversation between a guest and a member can never be read, even by its two participants.
drop policy if exists guest_msg_read on public.messages;
create policy guest_msg_read on public.messages as restrictive for select to authenticated
  using (public.is_guest(sender) = public.is_guest(recipient));

-- Hidden users show neither "online" nor "last seen". Online status: guests only see other guests, members never see guests.
create or replace function public.get_presence(ids uuid[] default null) returns table (user_id uuid, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, case when p.hidden and p.user_id <> auth.uid() then null else p.last_seen end
  from public.presence p
  where ((ids is null and p.last_seen > now() - interval '3 minutes') or p.user_id = any (ids))
    and (p.user_id = auth.uid() or public.is_guest(p.user_id) = public.is_guest())
$$;
revoke all on function public.get_presence(uuid[]) from public;
grant execute on function public.get_presence(uuid[]) to anon, authenticated;


-- =====================================================================================
-- Automatic guests (v8). No sign-in gate: every new visitor silently gets a guest account (the browser calls
-- signInAnonymously). guest_welcome() makes that guest follow the owner and like the owner's posts and public
-- scripts. It is the ONLY way a guest can follow or like: the restrictive guest_block policies stay as they are.
-- The browser calls it on every visit, so new posts of the owner are liked by returning guests too. Safe to run again.
-- Dashboard: Authentication > Sign In / Providers > "Allow anonymous sign-ins" must be ON.
-- The owner is the profile with username 'aevy' (change it below), else the earliest Admin.
-- =====================================================================================
create or replace function public.guest_welcome() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); adm uuid;
begin
  if me is null or not public.is_guest(me) then return; end if;
  select id into adm from public.profiles
   where not guest and (username = 'aevy' or role = 'admin')
   order by (username = 'aevy') desc, created limit 1;
  if adm is null then return; end if;
  insert into public.follows (follower, following) values (me, adm) on conflict do nothing;
  insert into public.script_likes (script_id, owner)
    select s.id, me from public.scripts s where s.owner = adm and s.vis = 'public' on conflict do nothing;
  if to_regclass('public.post_likes') is not null then
    insert into public.post_likes (post_id, owner)
      select p.id, me from public.posts p where p.owner = adm on conflict do nothing;
  end if;
end $$;
revoke all on function public.guest_welcome() from public, anon;
grant execute on function public.guest_welcome() to authenticated;


-- =====================================================================================
-- Photo posts + Activity (v9). Safe to run again.
-- Photo posts reuse public.posts / post_likes / post_comments (a post with an image address). Photos are resized in the
-- browser (max 1080 px, JPEG) and stored in the public Storage bucket "posts", one folder per user.
-- =====================================================================================
alter table public.posts add column if not exists image text not null default '' check (image = '' or image ~ '^https://');   -- (upgrade for older databases)
alter table public.posts alter column body set default '';
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check
  check (char_length(btrim(body)) <= 1000 and (image <> '' or char_length(btrim(body)) >= 1));
create index if not exists posts_image_idx on public.posts (created desc) where image <> '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists posts_media_read   on storage.objects;
drop policy if exists posts_media_insert on storage.objects;
drop policy if exists posts_media_delete on storage.objects;
create policy posts_media_read   on storage.objects for select using (bucket_id = 'posts');
create policy posts_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_guest());
create policy posts_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Activity tab: who followed you, liked or commented on your photos and scripts. Members see members, guests see guests.
create or replace function public.get_activity(lim int default 60)
returns table (kind text, actor uuid, ref uuid, snippet text, created timestamptz)
language sql stable security definer set search_path = public as $$
  select a.kind, a.actor, a.ref, a.snippet, a.created from (
    select 'follow'::text as kind, f.follower as actor, null::uuid as ref, ''::text as snippet, f.created
      from public.follows f where f.following = auth.uid()
    union all
    select 'plike', l.owner, l.post_id, left(p.body, 60), l.created
      from public.post_likes l join public.posts p on p.id = l.post_id where p.owner = auth.uid()
    union all
    select 'pcomment', c.owner, c.post_id, left(c.body, 80), c.created
      from public.post_comments c join public.posts p on p.id = c.post_id where p.owner = auth.uid()
    union all
    select 'slike', l.owner, l.script_id, left(s.title, 60), l.created
      from public.script_likes l join public.scripts s on s.id = l.script_id where s.owner = auth.uid()
    union all
    select 'scomment', c.owner, c.script_id, left(c.body, 80), c.created
      from public.script_comments c join public.scripts s on s.id = c.script_id where s.owner = auth.uid()
  ) a
  where a.actor <> auth.uid() and public.is_guest(a.actor) = public.is_guest()
  order by a.created desc limit least(greatest(lim, 1), 100)
$$;
revoke all on function public.get_activity(int) from public, anon;
grant execute on function public.get_activity(int) to authenticated;


-- =====================================================================================
-- Video catalog (synced by the Cloudflare Worker with the service-role key; public read)
-- =====================================================================================

create table if not exists public.video_categories (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  name text not null check (char_length(name) between 1 and 120),
  provider text not null default '',
  external_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.video_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  thumbnail_url text not null default '',
  playback_url text not null default '',
  source_url text not null default '',
  channel_title text not null default '',
  category_slugs text[] not null default '{}',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  view_count bigint not null default 0 check (view_count >= 0),
  published_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists video_catalog_published_idx on public.video_catalog (published_at desc nulls last, created_at desc);
create index if not exists video_catalog_views_idx on public.video_catalog (view_count desc, published_at desc nulls last);
create index if not exists video_catalog_categories_gin on public.video_catalog using gin (category_slugs);
alter table public.video_catalog add column if not exists search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(channel_title, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored;
create index if not exists video_catalog_search_gin on public.video_catalog using gin (search_document);

alter table public.video_catalog enable row level security;
alter table public.video_categories enable row level security;
drop policy if exists video_catalog_public_read on public.video_catalog;
create policy video_catalog_public_read on public.video_catalog for select to anon, authenticated using (true);
drop policy if exists video_categories_public_read on public.video_categories;
create policy video_categories_public_read on public.video_categories for select to anon, authenticated using (true);
grant select on public.video_catalog, public.video_categories to anon, authenticated;
grant all on public.video_catalog, public.video_categories to service_role;

create or replace function public.search_video_catalog(
  p_query text default '',
  p_category text default null,
  p_page integer default 1,
  p_page_size integer default 24,
  p_sort text default 'newest'
) returns setof public.video_catalog
language sql stable security invoker
set search_path = public
as $$
  select v.*
  from public.video_catalog v
  where (p_category is null or p_category = '' or p_category = any(v.category_slugs))
    and (
      coalesce(btrim(p_query), '') = ''
      or v.search_document @@ websearch_to_tsquery('simple', btrim(p_query))
      or v.title ilike '%' || btrim(p_query) || '%'
      or v.channel_title ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when p_sort = 'popular' then v.view_count end desc nulls last,
    case when p_sort <> 'popular' then v.published_at end desc nulls last,
    v.created_at desc
  limit greatest(1, least(coalesce(p_page_size, 24), 100))
  offset (greatest(1, coalesce(p_page, 1)) - 1) * greatest(1, least(coalesce(p_page_size, 24), 100));
$$;
grant execute on function public.search_video_catalog(text, text, integer, integer, text) to anon, authenticated, service_role;

comment on table public.video_catalog is 'Public video metadata synced by the Aevy Cloudflare Worker; media stays with its provider.';
comment on table public.video_categories is 'Categories discovered from configured video APIs.';
