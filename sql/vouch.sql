-- ════════════════════════════════════════════════════════════
-- Wanderkind · vouch ceremony · the morning after
--
-- Both walker and host write one line, blind, in parallel.
-- When BOTH drafts are locked, publish_vouches() atomically mints two
-- stamps (one for the walker's Wanderbuch, one for the host's
-- Gästebuch) and marks the stay as past.
-- ════════════════════════════════════════════════════════════

create table if not exists vouch_drafts (
  id uuid primary key default gen_random_uuid(),
  stay_id   uuid references stays(id) on delete cascade not null,
  writer_id uuid references profiles(id) on delete cascade not null,
  text      text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  unique (stay_id, writer_id)
);

alter table vouch_drafts enable row level security;

-- Helper: was this writer a participant in this stay?
create or replace function vouch_can_write(s uuid, u uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from stays
    where id = s
      and (host_id = u or guest_id = u)
  );
$$;

drop policy if exists "participants read drafts" on vouch_drafts;
create policy "participants read drafts"
  on vouch_drafts for select
  using (writer_id = auth.uid() OR vouch_can_write(stay_id, auth.uid()));

drop policy if exists "writer writes own draft" on vouch_drafts;
create policy "writer writes own draft"
  on vouch_drafts for insert
  with check (writer_id = auth.uid() and vouch_can_write(stay_id, auth.uid()));

drop policy if exists "writer updates own draft" on vouch_drafts;
create policy "writer updates own draft"
  on vouch_drafts for update
  using (writer_id = auth.uid())
  with check (writer_id = auth.uid());

-- RPC: publish vouches → mints stamps + marks stay past
create or replace function publish_vouches(p_stay uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  s record;
  v_walker text;
  v_host   text;
  region   text;
begin
  select * into s from stays where id = p_stay;
  if not found then return false; end if;

  select text into v_walker from vouch_drafts where stay_id = p_stay and writer_id = s.guest_id;
  select text into v_host   from vouch_drafts where stay_id = p_stay and writer_id = s.host_id;

  if v_walker is null or v_host is null then return false; end if;
  if (select locked_at from vouch_drafts where stay_id = p_stay and writer_id = s.guest_id) is null then return false; end if;
  if (select locked_at from vouch_drafts where stay_id = p_stay and writer_id = s.host_id) is null then return false; end if;

  select last_location_label into region from profiles where id = s.host_id;

  -- Mint one stamp on the walker's Wanderbuch (vouch by walker, reply by host)
  insert into stamps (walker_id, host_id, stay_id, stayed_on, region_label, vouch_text, host_reply)
  values (s.guest_id, s.host_id, s.id, coalesce(s.arrives_at::date, current_date),
          region, v_walker, v_host)
  on conflict do nothing;

  -- (Optional symmetry: a stamp on the host's view is the same row; the host
  --  reads via host_id = me. We don't double-insert.)

  -- Mark stay as past
  update stays set status = 'past' where id = p_stay and status <> 'past';

  return true;
end $$;
