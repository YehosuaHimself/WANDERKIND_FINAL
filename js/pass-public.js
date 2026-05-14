/**
 * /u/<wkid|handle> — public profile page.
 *
 *   ID can arrive three ways:
 *     ?id=WK-XXXXXXXX   (after 404.html SPA rewrite)
 *     ?id=handle        (same)
 *     /u/<X>            (clean URL — once page is rendered, history.replaceState
 *                        rewrites the URL back to this shape)
 *
 *   Resolution order:
 *     1. WK-XXXXXXXX     → match wanderkind_id
 *     2. WK-XXXXXXXX     → fallback match pass_number (covers backfill edge case)
 *     3. anything else   → match handle
 *
 *   The fetch is anonymous (apikey only, no Bearer). RLS allows
 *   public read of profiles with show_profile_public = true.
 */

// @ts-check

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const loadingEl = document.getElementById('pass-loading');
const contentEl = document.getElementById('pass-content');
const emptyEl = document.getElementById('pass-empty');

if (!loadingEl || !contentEl || !emptyEl) {
  throw new Error('pass-public: required DOM nodes missing');
}

/** @type {HTMLElement} */
const loading = loadingEl;
/** @type {HTMLElement} */
const content = contentEl;
/** @type {HTMLElement} */
const empty = emptyEl;
const emptyTitle = /** @type {HTMLElement|null} */ (document.getElementById('pass-empty-title'));
const emptySub = /** @type {HTMLElement|null} */ (document.getElementById('pass-empty-sub'));

/** Resolve the requested id from URL. */
function getRequestedId() {
  const url = new URL(window.location.href);
  // After 404 rewrite, id arrives as ?id=...
  const q = url.searchParams.get('id');
  if (q) return q.trim();
  // Or it might be the path segment after /u/ in clean-URL navigations
  const pathSeg = url.pathname.split('/u/')[1] || '';
  // Strip trailing slash if any
  return pathSeg.replace(/\/$/, '').trim();
}

/** @param {string} id */
async function fetchProfile(id) {
  const fields = 'wanderkind_id,pass_number,handle,trail_name,bio,avatar_url,home_country,is_walking,is_hosting,is_verified,show_profile_public';
  const wkIdShape = /^WK-[A-Z0-9]{8}$/i.test(id);

  /** @type {Array<any>} */
  let rows = [];

  /** @param {string} query */
  const run = async (query) => {
    const url = `${SUPABASE_URL}/rest/v1/profiles?${query}&select=${fields}&limit=1`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return [];
    return await res.json();
  };

  if (wkIdShape) {
    rows = await run(`wanderkind_id=eq.${encodeURIComponent(id.toUpperCase())}`);
    if (!rows.length) rows = await run(`pass_number=eq.${encodeURIComponent(id.toUpperCase())}`);
  } else {
    rows = await run(`handle=eq.${encodeURIComponent(id.toLowerCase())}`);
  }

  return rows[0] || null;
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] || ch));
}

/** @param {any} p */
function render(p) {
  if (!content) return;

  // Avatar
  const avEl = document.getElementById('pass-avatar');
  if (avEl) {
    if (p.avatar_url) {
      avEl.innerHTML = '';
      const img = document.createElement('img');
      img.alt = '';
      img.src = p.avatar_url;
      img.decoding = 'async';
      avEl.appendChild(img);
    } else {
      const init = (p.trail_name || '·')[0].toUpperCase();
      avEl.innerHTML = `<span class="pass-avatar-initial">${esc(init)}</span>`;
    }
    // Verified glyph
    if (p.is_verified) {
      const v = document.createElement('span');
      v.className = 'pass-verified';
      v.setAttribute('aria-label', 'Verified wanderkind');
      v.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
      avEl.appendChild(v);
    }
  }

  // Trail name
  const trailEl = document.getElementById('pass-trail');
  if (trailEl) trailEl.textContent = p.trail_name || 'Wanderkind';

  // WK-ID + handle
  const wkidEl = document.getElementById('pass-wkid');
  if (wkidEl) wkidEl.textContent = p.wanderkind_id || p.pass_number || '';
  const handleEl = document.getElementById('pass-handle');
  const handleSep = document.getElementById('pass-handle-sep');
  if (p.handle && handleEl && handleSep) {
    handleEl.textContent = '@' + p.handle;
    handleSep.hidden = false;
  }

  // Bio
  const bioEl = document.getElementById('pass-bio');
  if (bioEl) bioEl.textContent = p.bio || '';

  // Walking pill
  const walkingPill = document.getElementById('pill-walking');
  const walkingText = document.getElementById('pill-walking-text');
  if (walkingPill && walkingText) {
    if (p.is_walking) {
      walkingPill.setAttribute('data-active', 'true');
      walkingText.textContent = 'Walking now';
    } else {
      walkingPill.setAttribute('data-active', 'false');
      walkingText.textContent = 'At home';
    }
  }

  // Hosting pill
  const hostingPill = document.getElementById('pill-hosting');
  const hostingText = document.getElementById('pill-hosting-text');
  if (hostingPill && hostingText) {
    if (p.is_hosting) {
      hostingPill.setAttribute('data-active', 'true');
      hostingText.textContent = 'Hosting';
    } else {
      hostingPill.setAttribute('data-active', 'false');
      hostingText.textContent = 'Not hosting';
    }
  }

  // Home country
  const homeEl = document.getElementById('pass-home');
  if (homeEl && p.home_country) homeEl.textContent = '— ' + p.home_country + ' —';

  // Title/OG
  document.title = `${p.trail_name || 'Wanderkind'} — Wanderkind Pass`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', `${p.trail_name || 'A wanderkind'} on Wanderkind — every Way begins at your door.`);

  // Clean URL: replace any ?id= with /u/<wkid>
  const cleanId = p.handle || p.wanderkind_id || p.pass_number;
  if (cleanId && window.location.search) {
    try {
      history.replaceState(null, '', '/u/' + encodeURIComponent(cleanId));
    } catch { /* not fatal */ }
  }

  loading.hidden = true;
  content.hidden = false;
}

function showEmpty(/** @type {string} */ title, /** @type {string} */ sub) {
  if (loading) loading.hidden = true;
  if (content) content.hidden = true;
  if (emptyTitle) emptyTitle.textContent = title;
  if (emptySub) emptySub.textContent = sub;
  if (empty) empty.hidden = false;
}

(async function boot() {
  const id = getRequestedId();
  if (!id) {
    showEmpty('No pass requested', 'Tap a pin on the map to view a wanderkind.');
    return;
  }
  try {
    const p = await fetchProfile(id);
    if (!p) {
      showEmpty('Not a pass we recognise', 'This wanderkind may be private, or the link is misspelled.');
      return;
    }
    if (!p.show_profile_public) {
      showEmpty('This pass is private', 'The wanderkind has not yet opted into a public pass.');
      return;
    }
    render(p);
  } catch (e) {
    console.error('pass-public boot failed', e);
    showEmpty('Could not load this pass', 'Check your connection and try again.');
  }
})();
