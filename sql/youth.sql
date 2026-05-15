-- ════════════════════════════════════════════════════════════
-- Wanderkind · youth · EPIC 06
--
-- Under-18 bearers get a supervisor relationship. The supervisor is an
-- adult Wanderkind who accompanies them. The ID shows the supervisor's
-- name. Magic Open codes are not generated for unsupervised minors.
--
-- The "Troop" credential (scout leader → many minors) is slice 2; this
-- ships the 1-to-1 supervisor relationship first.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists dob date;
alter table profiles add column if not exists supervisor_id uuid references profiles(id) on delete set null;

create index if not exists profiles_supervisor_idx on profiles(supervisor_id);

-- Convenience view: returns true when the bearer is under 18 today
create or replace function is_minor(p_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (current_date - dob) < 18 * 365 from profiles where id = p_id),
    false
  )
$$;
