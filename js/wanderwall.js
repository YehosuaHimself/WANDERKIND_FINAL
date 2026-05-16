// @ts-nocheck
/**
 * /js/wanderwall.js · The WanderWall · ruled May 2026.
 *
 * The WanderWall is what the Map says today, in this place. It is a drawer
 * pulled up from the bottom of /map.html. See FEED_BRIEF.md for the doctrine
 * and /wanderkind-feed-workshop.html for the workshop that produced it.
 *
 * The six refusals (permanent):
 *   1. Not a separate page — there is no /feed.html after this.
 *   2. Not a notification source — no push, no timer, no "new" badge.
 *   3. Not a scroll surface — when the 24h list ends, it ends.
 *   4. Not a reaction surface — no hearts, no likes.
 *   5. Not a recommender — no "for you" ranking.
 *   6. Not a stream of every event — knocks, stays, face_verifications,
 *      walking-now are NOT shown.
 *
 * Card types (v1):
 *   - door       a host opened their door in the last 24h
 *   - vouch      a vouch was published in the last 24h (excerpt)
 *   - stamp      a stamp was sealed in the last 24h
 *   - proposal   a stamp was proposed in the last 24h
 *
 * Data: composed client-side from 4 lightweight fetches. No SQL view yet —
 * if cards become slow on real data, promote to a Postgres view in Phase 2.
 *
 * Geographic scope: current Map viewport (window.__wkMapBounds, kept fresh
 * by /js/map-boot.js).
 *
 * Youth-path: profiles.youth_account=true → filter out door + vouch cards.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { getSession } from './session.js';

const $ = (id) => document.getElementById(id);
const ISO_24H_AGO = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const state = {
  open: false,
  fetching: false,
  rows: [],         // raw, all kinds, 24h
  myAccount: null,  // session profile (for youth filter)
  lastFetch: 0,
};

document.addEventListener('DOMContentLoaded', () => {
  const handle = $('wanderwall-handle');
  const drawer = $('wanderwall');
  if (!handle || !drawer) return;

  handle.addEventListener('click', toggle);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  document.addEventListener('keydown', (e) => {
    if (state.open && e.key === 'Escape') close();
  });

  const closeBtn = $('wanderwall-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  const pullToRefresh = $('wanderwall-refresh');
  if (pullToRefresh) pullToRefresh.addEventListener('click', () => fetchRows(true));

  // Re-filter on viewport change without re-fetching (network silent).
  // /js/map-boot.js sets window.__wkMapBounds on moveend.
  window.addEventListener('wk-map-moved', () => {
    if (state.open) render();
  });
});

function toggle() {
  if (state.open) close(); else open();
}

async function open() {
  state.open = true;
  $('wanderwall').classList.add('open');
  $('wanderwall').setAttribute('aria-hidden', 'false');
  $('wanderwall-handle').setAttribute('aria-expanded', 'true');
  await fetchRows(false);
  render();
  // Trap-light focus management: move focus to close button
  const cb = $('wanderwall-close');
  if (cb) cb.focus();
}

function close() {
  state.open = false;
  $('wanderwall').classList.remove('open');
  $('wanderwall').setAttribute('aria-hidden', 'true');
  $('wanderwall-handle').setAttribute('aria-expanded', 'false');
  $('wanderwall-handle').focus();
}

async function fetchRows(force) {
  // Cache for 60s unless force
  if (!force && state.rows.length && (Date.now() - state.lastFetch) < 60_000) return;
  if (state.fetching) return;
  state.fetching = true;

  const sess = getSession();
  const auth = sess ? { Authorization: `Bearer ${sess.accessToken}` } : {};
  const headers = { apikey: SUPABASE_ANON_KEY, ...auth };

  // Load my profile (for youth filter) — best-effort
  if (sess && !state.myAccount) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sess.user.id}&select=youth_account`, { headers });
      if (r.ok) { const rows = await r.json(); state.myAccount = rows[0] || {}; }
    } catch {}
  }

  const since = ISO_24H_AGO();
  const queries = [
    // doors recently opened (we approximate with profiles updated_at since real schema lacks show_on_map_at)
    `${SUPABASE_URL}/rest/v1/profiles?show_on_map=eq.true&lat=not.is.null&lng=not.is.null&updated_at=gte.${since}&select=id,trail_name,wanderkind_id,lat,lng,host_offers,last_location_label,updated_at&limit=80`,
    // vouches in last 24h
    `${SUPABASE_URL}/rest/v1/vouch_drafts?locked_at=gte.${since}&select=writer_id,stay_id,text,locked_at&order=locked_at.desc&limit=80`,
    // stamps sealed in last 24h
    `${SUPABASE_URL}/rest/v1/stamps?created_at=gte.${since}&select=id,walker_id,stay_id,name,tier,region,lat,lng,created_at&order=created_at.desc&limit=80`,
    // stamp proposals in last 24h
    `${SUPABASE_URL}/rest/v1/stamp_proposals?created_at=gte.${since}&select=id,proposer_id,name,lat,lng,region,created_at&order=created_at.desc&limit=80`,
  ];

  try {
    const results = await Promise.all(queries.map((q) => fetch(q, { headers }).then((r) => r.ok ? r.json() : []).catch(() => [])));
    const [doors, vouches, stamps, proposals] = results;
    const cards = [
      ...doors.map((p) => ({
        kind: 'door',
        ts: p.updated_at,
        lat: p.lat, lng: p.lng,
        actor_name: p.trail_name,
        actor_wkid: p.wanderkind_id,
        region: p.last_location_label,
        offers: p.host_offers,
      })),
      ...vouches.map((v) => ({
        kind: 'vouch',
        ts: v.locked_at,
        actor_id: v.writer_id,
        stay_id: v.stay_id,
        excerpt: (v.text || '').slice(0, 80),
      })),
      ...stamps.map((s) => ({
        kind: 'stamp',
        ts: s.created_at,
        lat: s.lat, lng: s.lng,
        stamp_id: s.id,
        actor_id: s.walker_id,
        stamp_name: s.name,
        tier: s.tier,
        region: s.region,
      })),
      ...proposals.map((p) => ({
        kind: 'proposal',
        ts: p.created_at,
        lat: p.lat, lng: p.lng,
        proposal_id: p.id,
        actor_id: p.proposer_id,
        stamp_name: p.name,
        region: p.region,
      })),
    ];
    cards.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    state.rows = cards;
    state.lastFetch = Date.now();
  } catch (err) {
    console.warn('[wanderwall] fetch failed', err);
  } finally {
    state.fetching = false;
  }
}

function inBounds(lat, lng) {
  const b = window.__wkMapBounds;
  if (!b || lat == null || lng == null) return true; // no bounds yet = show all
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

function render() {
  const list = $('wanderwall-list');
  const empty = $('wanderwall-empty');
  const summary = $('wanderwall-summary');
  if (!list) return;

  // Youth filter
  const isYouth = !!(state.myAccount && state.myAccount.youth_account);
  let cards = state.rows.filter((c) => {
    if (isYouth && (c.kind === 'door' || c.kind === 'vouch')) return false;
    if (c.kind === 'door' || c.kind === 'stamp' || c.kind === 'proposal') return inBounds(c.lat, c.lng);
    return true; // vouches have no geo for now
  });

  list.innerHTML = '';

  if (!cards.length) {
    summary.textContent = '— The road is quiet here today';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  summary.textContent = `— ${cards.length} ${cards.length === 1 ? 'event' : 'events'} · last 24 hours`;

  const frag = document.createDocumentFragment();
  cards.forEach((c) => frag.appendChild(cardEl(c)));
  list.appendChild(frag);
}

function cardEl(c) {
  const a = document.createElement('a');
  a.className = `ww-card ww-card--${c.kind}`;
  a.setAttribute('href', cardHref(c));
  if (c.lat && c.lng) {
    a.dataset.lat = String(c.lat);
    a.dataset.lng = String(c.lng);
  }
  a.addEventListener('click', (e) => {
    if (c.lat && c.lng && window.__wkMapFlyTo) {
      // Fly the map there before navigating (intent: return user to the body)
      window.__wkMapFlyTo(c.lat, c.lng);
      close();
    }
  });

  const ago = timeAgo(c.ts);
  const safe = (s) => String(s == null ? '' : s).replace(/[<>"']/g, (ch) => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  let body = '';
  let glyph = '';
  if (c.kind === 'door') {
    glyph = '⌂';
    body = `<div class="ww-h"><span class="ww-actor">${safe(c.actor_name)}</span> opened a door</div>
            <div class="ww-sub">${safe(c.region) || ''}</div>`;
  } else if (c.kind === 'vouch') {
    glyph = '◐';
    body = `<div class="ww-h">A vouch was published</div>
            <div class="ww-sub ww-quote">"${safe(c.excerpt)}${(c.excerpt && c.excerpt.length >= 80) ? '…' : ''}"</div>`;
  } else if (c.kind === 'stamp') {
    glyph = '◉';
    body = `<div class="ww-h"><span class="ww-actor">${safe(c.actor_name) || 'A walker'}</span> sealed a stamp</div>
            <div class="ww-sub">${safe(c.stamp_name)}${c.region ? ' · ' + safe(c.region) : ''}</div>`;
  } else if (c.kind === 'proposal') {
    glyph = '✚';
    body = `<div class="ww-h"><span class="ww-actor">A stamp</span> was proposed</div>
            <div class="ww-sub">${safe(c.stamp_name)}${c.region ? ' · ' + safe(c.region) : ''}</div>`;
  }

  a.innerHTML = `
    <span class="ww-glyph" aria-hidden="true">${glyph}</span>
    <div class="ww-body">${body}</div>
    <span class="ww-ago">${ago}</span>
  `;
  return a;
}

function cardHref(c) {
  if (c.kind === 'door' && c.actor_wkid) return `/u/?wkid=${c.actor_wkid}`;
  if (c.kind === 'stamp' && c.stamp_id)  return `/stamp.html?id=${c.stamp_id}`;
  if (c.kind === 'proposal' && c.proposal_id) return `/stamp.html?proposal=${c.proposal_id}`;
  if (c.kind === 'vouch' && c.stay_id)   return `/vouch.html?stay=${c.stay_id}`;
  return '#';
}

function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t || isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1)   return 'now';
  if (m < 60)  return m + ' min';
  if (m < 1440) return Math.floor(m / 60) + ' h';
  return Math.floor(m / 1440) + ' d';
}
