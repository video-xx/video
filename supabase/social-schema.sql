-- aveysocial: run once in Supabase Dashboard > SQL Editor (safe to re-run)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  image_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- upgrade older version of the table
alter table public.messages add column if not exists image_url text;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_content_check;

create index if not exists messages_pair_idx on public.messages (sender_id, recipient_id, created_at);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at);

-- profile is created automatically at signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data->>'username'));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- mark everything a person sent you as read
create or replace function public.mark_read(peer_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = peer_id and read_at is null;
$$;
grant execute on function public.mark_read(uuid) to authenticated;

-- row level security
alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "read own messages" on public.messages;
create policy "read own messages"
  on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "send as yourself" on public.messages;
create policy "send as yourself"
  on public.messages for insert to authenticated
  with check (auth.uid() = sender_id);

-- image uploads (public bucket, files live in a folder named after the sender)
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists "upload to own folder" on storage.objects;
create policy "upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);


-- ===== stories, notes and likes =====
create table if not exists public.stories (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null default '' check (char_length(text) <= 200),
  bg text,
  image_url text,
  created_at timestamptz not null default now(),
  check (char_length(text) > 0 or image_url is not null)
);
create table if not exists public.story_likes (
  story_id bigint not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (story_id, user_id)
);
create table if not exists public.notes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 60),
  updated_at timestamptz not null default now()
);
create table if not exists public.message_likes (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (message_id, user_id)
);

alter table public.stories enable row level security;
alter table public.story_likes enable row level security;
alter table public.notes enable row level security;
alter table public.message_likes enable row level security;

drop policy if exists "stories visible for 24h" on public.stories;
create policy "stories visible for 24h" on public.stories for select to authenticated
  using (created_at > now() - interval '24 hours');
drop policy if exists "post own stories" on public.stories;
create policy "post own stories" on public.stories for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own stories" on public.stories;
create policy "delete own stories" on public.stories for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "story likes visible" on public.story_likes;
create policy "story likes visible" on public.story_likes for select to authenticated using (true);
drop policy if exists "like as yourself" on public.story_likes;
create policy "like as yourself" on public.story_likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "unlike as yourself" on public.story_likes;
create policy "unlike as yourself" on public.story_likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "notes visible" on public.notes;
create policy "notes visible" on public.notes for select to authenticated using (true);
drop policy if exists "write own note" on public.notes;
create policy "write own note" on public.notes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "edit own note" on public.notes;
create policy "edit own note" on public.notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own note" on public.notes;
create policy "delete own note" on public.notes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "see likes on your chats" on public.message_likes;
create policy "see likes on your chats" on public.message_likes for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists "like messages in your chats" on public.message_likes;
create policy "like messages in your chats" on public.message_likes for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists "unlike messages" on public.message_likes;
create policy "unlike messages" on public.message_likes for delete to authenticated using (auth.uid() = user_id);


-- ===== profile pictures, bios and follows =====
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 100);

drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;
drop policy if exists "follows visible" on public.follows;
create policy "follows visible" on public.follows for select to authenticated using (true);
drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows for insert to authenticated with check (auth.uid() = follower_id);
drop policy if exists "unfollow as yourself" on public.follows;
create policy "unfollow as yourself" on public.follows for delete to authenticated using (auth.uid() = follower_id);

-- ===== live updates (safe to re-run) =====
do $$
declare t text;
begin
  foreach t in array array['messages','stories','story_likes','notes','message_likes','profiles','follows'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===== voice messages =====
alter table public.messages add column if not exists audio_url text;
alter table public.messages add column if not exists audio_secs int;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (char_length(body) <= 2000 and (char_length(body) > 0 or image_url is not null or audio_url is not null)) not valid;

-- ===== push notifications =====
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "see own devices" on public.push_subscriptions;
create policy "see own devices" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "remove own devices" on public.push_subscriptions;
create policy "remove own devices" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
$$;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;


-- ===== message actions: reply, edit, delete =====
alter table public.messages add column if not exists reply_to bigint references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
drop policy if exists "edit own messages" on public.messages;
create policy "edit own messages" on public.messages for update to authenticated using (auth.uid() = sender_id) with check (auth.uid() = sender_id);
drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages" on public.messages for delete to authenticated using (auth.uid() = sender_id);
alter table public.messages replica identity full;

-- ===== contacts, groups and channels =====
create table if not exists public.contacts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id), check (owner_id <> contact_id)
);
create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('group','channel')),
  name text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 120),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.room_members (
  room_id bigint not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists public.room_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  reply_to bigint references public.room_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists room_messages_idx on public.room_messages (room_id, created_at);

create or replace function public.is_member(p_room bigint) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = p_room and user_id = auth.uid()) $$;
create or replace function public.is_room_admin(p_room bigint) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = p_room and user_id = auth.uid() and role in ('owner','admin')) $$;
create or replace function public.can_post(p_room bigint) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members m join rooms r on r.id = m.room_id
    where m.room_id = p_room and m.user_id = auth.uid() and (r.kind = 'group' or m.role in ('owner','admin'))) $$;

alter table public.contacts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_messages enable row level security;

drop policy if exists "own contacts" on public.contacts;
create policy "own contacts" on public.contacts for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "add contact" on public.contacts;
create policy "add contact" on public.contacts for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "remove contact" on public.contacts;
create policy "remove contact" on public.contacts for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "see rooms" on public.rooms;
create policy "see rooms" on public.rooms for select to authenticated using (kind = 'channel' or public.is_member(id));
drop policy if exists "see members" on public.room_members;
create policy "see members" on public.room_members for select to authenticated using (public.is_member(room_id) or user_id = auth.uid());
drop policy if exists "read room messages" on public.room_messages;
create policy "read room messages" on public.room_messages for select to authenticated using (public.is_member(room_id));
drop policy if exists "post room messages" on public.room_messages;
create policy "post room messages" on public.room_messages for insert to authenticated with check (sender_id = auth.uid() and public.can_post(room_id));
drop policy if exists "delete room messages" on public.room_messages;
create policy "delete room messages" on public.room_messages for delete to authenticated using (sender_id = auth.uid() or public.is_room_admin(room_id));

create or replace function public.create_room(p_kind text, p_name text, p_desc text, p_members uuid[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  insert into rooms (kind, name, description, owner_id) values (p_kind, trim(p_name), coalesce(p_desc, ''), auth.uid()) returning id into rid;
  insert into room_members (room_id, user_id, role) values (rid, auth.uid(), 'owner');
  if p_kind = 'group' and p_members is not null then
    insert into room_members (room_id, user_id) select rid, id from profiles where id = any(p_members) and id <> auth.uid() on conflict do nothing;
  end if;
  return rid;
end $$;
create or replace function public.join_room(p_room bigint) returns void language sql security definer set search_path = public as $$
  insert into room_members (room_id, user_id) select id, auth.uid() from rooms where id = p_room and kind = 'channel' on conflict do nothing $$;
create or replace function public.add_members(p_room bigint, p_members uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_admin(p_room) then raise exception 'Only admins can add members'; end if;
  insert into room_members (room_id, user_id) select p_room, id from profiles where id = any(p_members) on conflict do nothing;
end $$;
create or replace function public.set_role(p_room bigint, p_user uuid, p_role text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('admin','member') then raise exception 'Bad role'; end if;
  if not exists (select 1 from rooms where id = p_room and owner_id = auth.uid()) then raise exception 'Only the owner can change roles'; end if;
  update room_members set role = p_role where room_id = p_room and user_id = p_user and role <> 'owner';
end $$;
create or replace function public.leave_room(p_room bigint) returns void language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  delete from room_members where room_id = p_room and user_id = auth.uid();
  select user_id into nxt from room_members where room_id = p_room order by (role = 'admin') desc, joined_at limit 1;
  if nxt is null then delete from rooms where id = p_room;
  elsif exists (select 1 from rooms where id = p_room and owner_id = auth.uid()) then
    update rooms set owner_id = nxt where id = p_room;
    update room_members set role = 'owner' where room_id = p_room and user_id = nxt;
  end if;
end $$;
create or replace function public.mark_room_read(p_room bigint) returns void language sql security definer set search_path = public as $$
  update room_members set last_read_at = now() where room_id = p_room and user_id = auth.uid() $$;
grant execute on function public.create_room(text, text, text, uuid[]), public.join_room(bigint), public.add_members(bigint, uuid[]),
  public.set_role(bigint, uuid, text), public.leave_room(bigint), public.mark_room_read(bigint) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['rooms','room_members','room_messages','contacts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===== verified (blue) badge =====
alter table public.profiles add column if not exists verified boolean not null default false;
-- users may edit only their bio and photo, so nobody can give themselves a badge
revoke update on public.profiles from authenticated;
grant update (bio, avatar_url) on public.profiles to authenticated;
