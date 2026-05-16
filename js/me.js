/**
 * /me.html — the signed-in user's own profile surface.
 *
 *   1. require a session; otherwise bounce to /auth.html
 *   2. fetch the profile row from Supabase (RLS lets the signed-in
 *      user read their own row)
 *   3. render either the populated profile or the empty-state pass-setup
 */

// @ts-check

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { refreshIfNeeded, signOut } from './session.js';

/**
 * @typedef {Object} ProfileRow
 * @property {string} id
 * @property {string|null} trail_name
 * @property {string|null} given_name
 * @property {string|null} surname
 * @property {string|null} pass_number
 * @property {string|null} wanderkind_id
 * @property {string|null} tier
 * @property {string|null} avatar_url
 * @property {string|null} cover_url
 * @property {string|null} bio
 * @property {string|null} home_country
 * @property {number|null} nights_walked
 * @property {number|null} nights_hosted
 * @property {number|null} stamps_count
 * @property {boolean|null} is_verified
 * @property {boolean|null} is_walking
 * @property {boolean|null} is_hosting
 * @property {string|null} handle
 */

const TIER_COLORS = {
  novice:     '#9A8B73',
  rambler:    '#6B5A3E',
  wayfarer:   '#C8762A',
  pathkeeper: '#27864A',
  guide:      '#5A8AB0',
  elder:      '#C9A84C',
};

const root = document.getElementById('me-root');
if (!root) throw new Error('me: #me-root missing');

function start() { boot().catch((e) => {
    console.error('me boot failed', e);
    renderError('Something went wrong loading your profile.');
  }); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

async function boot() {
  const session = await refreshIfNeeded();
  if (!session) {
    location.replace('/auth.html');
    return;
  }

  const profile = await fetchProfile(session.user.id, session.accessToken);
  if (!profile) {
    renderEmptyPass(session.user.email);
  } else {
    renderProfile(profile, session.user.email);
  }
}

/**
 * @param {string} userId
 * @param {string} accessToken
 * @returns {Promise<ProfileRow | null>}
 */
async function fetchProfile(userId, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 401) {
    await signOut();
    location.replace('/auth.html');
    return null;
  }
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * @param {ProfileRow} p
 * @param {string} email
 */
function renderProfile(p, email) {
  if (!root) return;
  // Trail name is the chosen pseudonym — distinct from civilian
  // identity (given_name/surname stay private, never displayed publicly).
  // Falls back to a placeholder when not yet chosen.
  const rawTrail = typeof p.trail_name === 'string' ? p.trail_name.trim() : '';
  const hasTrail = rawTrail.length > 0;
  const displayName = hasTrail ? rawTrail : 'Wanderkind';
  const passId = p.wanderkind_id || p.pass_number || '';
  const tier = (p.tier || 'novice').toLowerCase();
  const tierColor = TIER_COLORS[/** @type {keyof typeof TIER_COLORS} */ (tier)] || TIER_COLORS.novice;
  const initial = (displayName[0] || '·').toUpperCase();
  const verified = p.is_verified === true;

  root.innerHTML = `
    <header class="me-topbar" role="banner">
      <span class="me-eyebrow">— Me</span>
      <span aria-hidden="true" style="width: 36px"></span>
    </header>

    <section class="me-hero" aria-hidden="true">
      <div class="me-cover">
        ${p.cover_url
          ? `<img src="${escapeHTML(p.cover_url)}" alt="" />`
          : ''}
      </div>
      <div class="me-avatar">
        ${p.avatar_url
          ? `<img src="${escapeHTML(p.avatar_url)}" alt="" />`
          : `<span class="me-avatar-initial">${escapeHTML(initial)}</span>`}
        ${verified ? '<span class="me-verified" title="Verified" aria-label="Verified"></span>' : ''}
      </div>
    </section>

    <section class="me-identity">
      <h1 class="me-name">${escapeHTML(displayName)}</h1>
      ${hasTrail ? '' : '<a href="/me-edit.html" class="me-set-trail">— Set your trail name</a>'}

      <div class="me-tier" style="--tier: ${tierColor}">
        <span class="me-tier-dot" aria-hidden="true"></span>
        <span class="me-tier-label">${escapeHTML(tier.toUpperCase())}</span>
      </div>

      ${passId ? `<p class="me-pass-id">${escapeHTML(passId)}</p>` : ''}

      ${p.bio ? `<p class="me-bio">${escapeHTML(p.bio)}</p>` : ''}
    </section>

    <section class="me-stats" aria-label="Lifetime stats">
      <div class="me-stat">
        <span class="me-stat-value">${Number(p.nights_walked || 0)}</span>
        <span class="me-stat-label">Nights<br>walked</span>
      </div>
      <div class="me-stat">
        <span class="me-stat-value">${Number(p.stamps_count || 0)}</span>
        <span class="me-stat-label">Stamps</span>
      </div>
      <div class="me-stat">
        <span class="me-stat-value">${Number(p.nights_hosted || 0)}</span>
        <span class="me-stat-label">Nights<br>hosted</span>
      </div>
    </section>

    <button
      type="button"
      class="me-status"
      id="walking-toggle"
      aria-label="Toggle walking state"
      data-walking="${p.is_walking ? 'true' : 'false'}"
    >
      <span class="me-status-dot" aria-hidden="true"></span>
      <span class="me-status-label">
        ${p.is_walking ? 'Walking now · tap to stop' : (p.home_country ? `At home · ${escapeHTML(p.home_country)} · tap to start walking` : 'At home · tap to start walking')}
      </span>
    </button>

    <div class="me-actions">
      <a href="/me-edit.html" class="btn-amber">Edit profile</a>
      <button type="button" class="btn-ghost" disabled aria-disabled="true">Share your pass</button>
    </div>

    <p class="me-foot">
      <span class="mono">${escapeHTML(email)}</span><br>
      <button type="button" class="me-signout" id="me-signout">Sign out</button>
    </p>
  `;

  wireSignOut();
  wireWalkingToggle(p);
  toggleVerifyBanner(p);
}

/**
 * EPIC 11 · show the 'Get verified' amber CTA when face_verified_at is null.
 * Mandatory for new users via the auth.js redirect — this banner is the
 * fallback for existing users who haven't gone through the FaceScan yet.
 * @param {ProfileRow} p
 */
function toggleVerifyBanner(p) {
  const banner = document.getElementById('me-verify-banner');
  const pill   = document.getElementById('me-verify-pill');
  // @ts-ignore — face_verified_at added by EPIC 11 SQL
  const verified = !!p.face_verified_at;
  if (banner) banner.hidden = verified;
  if (pill)   pill.hidden   = !verified;
}

/**
 * Walking-now toggle: PATCH profiles.is_walking optimistically, revert on
 * error. We persist via Supabase REST so changes show up on the map for
 * everyone else.
 * @param {ProfileRow} p
 */
async function wireWalkingToggle(p) {
  const btn = document.getElementById('walking-toggle');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const current = btn.getAttribute('data-walking') === 'true';
    const next = !current;
    // Optimistic UI update
    setWalkingUI(btn, next, p.home_country);
    btn.setAttribute('aria-busy', 'true');

    try {
      const session = await refreshIfNeeded();
      if (!session) { location.replace('/auth.html'); return; }
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ is_walking: next }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      p.is_walking = next;   // sync local model
    } catch (err) {
      // Revert UI on failure
      setWalkingUI(btn, current, p.home_country);
      console.error('walking toggle failed', err);
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });
}

/** @param {HTMLElement} btn  @param {boolean} walking  @param {string|null|undefined} country */
function setWalkingUI(btn, walking, country) {
  btn.setAttribute('data-walking', String(walking));
  const label = btn.querySelector('.me-status-label');
  if (label) {
    if (walking) {
      label.textContent = 'Walking now · tap to stop';
    } else {
      label.textContent = country
        ? `At home · ${country} · tap to start walking`
        : 'At home · tap to start walking';
    }
  }
}

/** @param {string} email */
function renderEmptyPass(email) {
  if (!root) return;
  root.innerHTML = `
    <header class="me-topbar" role="banner">
      <span class="me-eyebrow">— Me</span>
    </header>

    <section class="me-empty" aria-labelledby="empty-h">
      <img class="me-empty-seal" src="/assets/icons/seal.svg" alt="" width="72" height="72" style="color: var(--wk-amber)" aria-hidden="true" />
      <span class="me-eyebrow" style="color: var(--wk-amber-text)">— Welcome</span>
      <h1 class="me-empty-title" id="empty-h">Your pass is waiting.</h1>
      <p class="me-empty-sub">Set up your Wanderkind pass to start collecting stamps and opening doors.</p>
      <div class="me-actions">
        <a href="/me-edit.html" class="btn-amber">Complete your pass</a>
      </div>
      <p class="me-foot">
        <span class="mono">${escapeHTML(email)}</span><br>
        <button type="button" class="me-signout" id="me-signout">Sign out</button>
      </p>
    </section>
  `;
  wireSignOut();
}

/** @param {string} msg */
function renderError(msg) {
  if (!root) return;
  root.innerHTML = `
    <section class="me-empty">
      <img class="me-empty-seal" src="/assets/icons/seal.svg" alt="" width="72" height="72" style="color: var(--wk-amber)" aria-hidden="true" />
      <h1 class="me-empty-title">Trouble loading your profile.</h1>
      <p class="me-empty-sub">${escapeHTML(msg)}</p>
      <div class="me-actions">
        <a class="btn-amber" href="/me.html">Try again</a>
        <button type="button" class="btn-ghost" id="me-signout">Sign out</button>
      </div>
    </section>
  `;
  wireSignOut();
}

function wireSignOut() {
  const btn = document.getElementById('me-signout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    /** @type {HTMLButtonElement} */ (btn).disabled = true;
    await signOut();
    location.replace('/auth.html');
  });
}

/** @param {string} s */
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
