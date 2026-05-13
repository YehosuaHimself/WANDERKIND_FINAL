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

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error('me boot failed', e);
    renderError('Something went wrong loading your profile.');
  });
});

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
  const displayName = (p.trail_name || `${p.given_name || ''} ${p.surname || ''}`.trim() || 'Wanderkind');
  const passId = p.wanderkind_id || p.pass_number || '';
  const tier = (p.tier || 'novice').toLowerCase();
  const tierColor = TIER_COLORS[/** @type {keyof typeof TIER_COLORS} */ (tier)] || TIER_COLORS.novice;
  const initial = (displayName[0] || '·').toUpperCase();
  const verified = p.is_verified === true;

  root.innerHTML = `
    <header class="me-topbar" role="banner">
      <span class="me-eyebrow">— Me</span>
      <button type="button" class="me-menu" aria-label="Open profile menu">⋯</button>
    </header>

    <section class="me-identity">
      <div class="me-avatar" aria-hidden="true">
        ${p.avatar_url
          ? `<img src="${escapeHTML(p.avatar_url)}" alt="" />`
          : `<span class="me-avatar-initial">${escapeHTML(initial)}</span>`}
        ${verified ? '<span class="me-verified" title="Verified" aria-label="Verified"></span>' : ''}
      </div>

      <h1 class="me-name">${escapeHTML(displayName)}</h1>

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

    <section class="me-status" aria-label="Current status">
      <span class="me-status-dot" data-walking="${p.is_walking ? 'true' : 'false'}" aria-hidden="true"></span>
      <span class="me-status-label">
        ${p.is_walking ? 'Walking now' : (p.home_country ? `At home · ${escapeHTML(p.home_country)}` : 'At home')}
      </span>
    </section>

    <div class="me-actions">
      <button type="button" class="btn-amber" disabled aria-disabled="true">Edit profile</button>
      <button type="button" class="btn-ghost" disabled aria-disabled="true">Share your pass</button>
    </div>

    <p class="me-foot">
      <span class="mono">${escapeHTML(email)}</span><br>
      <button type="button" class="me-signout" id="me-signout">Sign out</button>
    </p>
  `;

  wireSignOut();
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
        <button type="button" class="btn-amber" disabled aria-disabled="true">Complete your pass</button>
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
