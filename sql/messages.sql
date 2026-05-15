-- ════════════════════════════════════════════════════════════
-- Wanderkind · Messages (end-to-end encrypted)
-- Each Wanderkind has a public_key on their profile.
-- Threads are pairwise; the server only stores ciphertext.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists public_key jsonb;

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists message_thread_members (
  thread_id uuid references message_threads(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (thread_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references message_threads(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  created_at timestamptz default now()
);

create index if not exists messages_thread_idx on messages(thread_id, created_at);

alter table message_threads enable row level security;
alter table message_thread_members enable row level security;
alter table messages enable row level security;

-- Avoid recursive RLS via SECURITY DEFINER helper
create or replace function is_thread_member(t uuid, u uuid)
returns boolean
language sql
security definer
stable
as $$ select exists (
  select 1 from message_thread_members
  where thread_id = t and user_id = u
) $$;

drop policy if exists "members read threads" on message_threads;
create policy "members read threads"
  on message_threads for select
  using (is_thread_member(id, auth.uid()));

drop policy if exists "members read membership" on message_thread_members;
create policy "members read membership"
  on message_thread_members for select
  using (is_thread_member(thread_id, auth.uid()));

drop policy if exists "members read messages" on messages;
create policy "members read messages"
  on messages for select
  using (is_thread_member(thread_id, auth.uid()));

drop policy if exists "members write messages" on messages;
create policy "members write messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and is_thread_member(thread_id, auth.uid())
  );

-- Atomic two-party thread creation
create or replace function start_thread_with(other uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  t uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = other then raise exception 'cannot start thread with yourself'; end if;
  -- find existing 1-1 thread
  select t1.thread_id into t
  from message_thread_members t1
  join message_thread_members t2 on t1.thread_id = t2.thread_id
  where t1.user_id = me and t2.user_id = other
  limit 1;
  if t is not null then return t; end if;
  insert into message_threads default values returning id into t;
  insert into message_thread_members (thread_id, user_id) values (t, me), (t, other);
  return t;
end $$;
