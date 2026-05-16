-- ════════════════════════════════════════════════════════════════════════
-- summit_check.sql · mountain-stamp summit-GPS rule
--
-- A mountain-category stamp can only be claimed when the walker's GPS
-- position is within 200 meters of the mountain's lat/lng. This prevents
-- mountains-on-paper. The summit must actually be reached.
--
-- Implementation: a new RPC claim_mountain_stamp(p_proposal, p_lat, p_lng)
-- that geo-checks before inserting. Other category claims (church/chapel/
-- festival) don't need summit precision but use a wider 500m radius.
-- ════════════════════════════════════════════════════════════════════════

-- Helper: haversine distance in meters (rough, but precise enough at small radii)
create or replace function wk_dist_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(p_lat2 - p_lat1)/2)^2 +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    sin(radians(p_lng2 - p_lng1)/2)^2
  ));
$$;

-- Claim a stamp from a stamp_proposal (or stamp_canon) by checking GPS.
-- Strict 200m radius for mountains; 500m for other categories.
create or replace function claim_category_stamp(
  p_proposal_id uuid,
  p_user_lat    double precision,
  p_user_lng    double precision
) returns jsonb
language plpgsql security definer as $$
declare
  v_uid       uuid := auth.uid();
  v_proposal  stamp_proposals;
  v_radius_m  double precision;
  v_dist_m    double precision;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not signed in');
  end if;

  select * into v_proposal from stamp_proposals where id = p_proposal_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'stamp not found');
  end if;

  -- Radius: 200m for mountains, 500m for everything else.
  v_radius_m := case when v_proposal.category = 'mountain' then 200 else 500 end;

  v_dist_m := wk_dist_m(p_user_lat, p_user_lng, v_proposal.lat, v_proposal.lng);

  if v_dist_m > v_radius_m then
    return jsonb_build_object(
      'ok', false,
      'error', 'too far',
      'distance_m', round(v_dist_m::numeric, 0),
      'required_within_m', v_radius_m,
      'message', case
        when v_proposal.category = 'mountain' then
          'A mountain stamp can only be claimed at the summit. You are ' || round(v_dist_m::numeric, 0) || 'm away — keep walking up.'
        else
          'You need to be within ' || v_radius_m || 'm of the place. You are ' || round(v_dist_m::numeric, 0) || 'm away.'
      end
    );
  end if;

  -- Within radius → insert into stamps (as a "personal" tier-3 stamp for now;
  -- promotion to tier-2/tier-1 happens via the existing community co-sign flow).
  -- We re-use the stamps table — host_id is the proposer here (not strictly
  -- a host but the discoverer).
  insert into stamps (walker_id, host_id, stay_id, stayed_on, region_label, vouch_text, host_reply)
    values (
      v_uid, v_proposal.proposer_id, null, current_date,
      v_proposal.name,
      'Stamp claimed at ' || v_proposal.category || ' · ' || v_proposal.name,
      null
    )
    on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'distance_m', round(v_dist_m::numeric, 0),
    'stamp', v_proposal.name,
    'category', v_proposal.category
  );
end $$;

grant execute on function claim_category_stamp(uuid, double precision, double precision) to authenticated;
grant execute on function wk_dist_m(double precision, double precision, double precision, double precision) to authenticated, anon;

-- Update the stamp_proposals CHECK constraint to allow 'chapel' as a category
alter table stamp_proposals drop constraint if exists stamp_proposals_category_check;
alter table stamp_proposals add constraint stamp_proposals_category_check
  check (category in ('church','chapel','mountain','festival','other'));

alter table stamp_canon drop constraint if exists stamp_canon_category_check;
