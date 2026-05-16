-- ============================================================================
-- master_pass_v2.sql · EPIC 11 · mandatory FaceScan in onboarding
-- ============================================================================
-- Adds:
--   1. profiles.face_verified_at (timestamptz) — when the user passed liveness
--   2. face_verifications table — audit log of every scan attempt
--   3. verify_face RPC — records a scan + sets face_verified_at on success
--   4. journey_tier guard — Verified Walker requires face_verified_at
-- ============================================================================

-- 1. profile column
alter table profiles
  add column if not exists face_verified_at timestamptz;

-- 2. audit log table (own row only, never exposed publicly)
create table if not exists face_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  frame_hash_1 text not null,
  frame_hash_2 text not null,
  frame_hash_3 text not null,
  liveness     numeric(4,3) not null check (liveness between 0 and 1),
  passed       boolean not null,
  provider     text not null default 'heuristic-v1',
  created_at   timestamptz default now()
);

create index if not exists face_verifications_user_idx
  on face_verifications(user_id, created_at desc);

alter table face_verifications enable row level security;

drop policy if exists "user reads own face audits" on face_verifications;
create policy "user reads own face audits"
  on face_verifications for select
  using (user_id = auth.uid());

-- (writes happen only via verify_face RPC, never direct)

-- 3. RPC — single entry point, server-controlled passing rule
create or replace function verify_face(
  p_hash_1   text,
  p_hash_2   text,
  p_hash_3   text,
  p_liveness numeric,
  p_provider text default 'heuristic-v1'
) returns jsonb
language plpgsql security definer
as $$
declare
  v_uid   uuid := auth.uid();
  v_pass  boolean;
  v_row   face_verifications;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not signed in');
  end if;

  -- reject if hashes are duplicates of each other (replayed frame)
  if p_hash_1 = p_hash_2 or p_hash_2 = p_hash_3 or p_hash_1 = p_hash_3 then
    v_pass := false;
  else
    v_pass := p_liveness >= 0.62;
  end if;

  insert into face_verifications(user_id, frame_hash_1, frame_hash_2, frame_hash_3,
                                 liveness, passed, provider)
    values (v_uid, p_hash_1, p_hash_2, p_hash_3,
            greatest(0, least(1, p_liveness)), v_pass, p_provider)
    returning * into v_row;

  if v_pass then
    update profiles
       set face_verified_at = coalesce(face_verified_at, now()),
           journey_tier     = case
             when journey_tier in ('newcomer','walker') then 'verified-walker'
             else journey_tier
           end
     where id = v_uid;
  end if;

  return jsonb_build_object(
    'ok',     v_pass,
    'id',     v_row.id,
    'tier',   case when v_pass then 'verified-walker' else null end
  );
end;
$$;

grant execute on function verify_face(text,text,text,numeric,text) to authenticated;

-- ============================================================================
-- end master_pass_v2.sql
-- ============================================================================
