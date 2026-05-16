-- ════════════════════════════════════════════════════════════
-- Wanderkind · loop · close knock → stay → vouch → stamp
-- ════════════════════════════════════════════════════════════

-- One stay per knock (idempotency)
alter table stays add column if not exists knock_id uuid references knocks(id) on delete set null;
create unique index if not exists stays_knock_unique on stays(knock_id) where knock_id is not null;

-- One stamp per stay (idempotency on retry)
alter table stamps add column if not exists stay_unique_guard text generated always as (stay_id::text) stored;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stamps_one_per_stay') then
    alter table stamps add constraint stamps_one_per_stay unique (stay_id);
  end if;
exception when others then null; end $$;

-- RPC: host accepts a knock → atomically:
--   1. Mark knock as accepted
--   2. Mint a stay row (if not already minted)
--   3. Return the stay id
create or replace function accept_knock_to_stay(p_knock uuid, p_arrives_at timestamptz default null)
returns uuid
language plpgsql
security definer
as $$
declare
  k record;
  s_id uuid;
begin
  select * into k from knocks where id = p_knock;
  if not found then raise exception 'knock not found'; end if;
  if k.host_id <> auth.uid() then raise exception 'not your knock'; end if;
  if k.status <> 'pending' then raise exception 'knock already resolved'; end if;

  -- Mark knock as accepted
  update knocks
  set status = 'accepted', resolved_at = now()
  where id = p_knock;

  -- Mint a stay if one doesn't already exist for this knock
  select id into s_id from stays where knock_id = p_knock;
  if s_id is null then
    insert into stays (host_id, guest_id, arrives_at, status, knock_id)
    values (k.host_id, k.walker_id, coalesce(p_arrives_at, now()), 'active', p_knock)
    returning id into s_id;
  end if;

  return s_id;
end $$;

-- RPC: host declines a knock
create or replace function decline_knock(p_knock uuid)
returns void
language plpgsql
security definer
as $$
declare
  k record;
begin
  select * into k from knocks where id = p_knock;
  if not found then raise exception 'knock not found'; end if;
  if k.host_id <> auth.uid() then raise exception 'not your knock'; end if;
  update knocks
  set status = 'declined', resolved_at = now()
  where id = p_knock;
end $$;
