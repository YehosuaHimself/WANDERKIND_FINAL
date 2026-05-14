/**
 * /me-edit.html — minimal profile editor.
 *
 *   1. require session
 *   2. prefill trail_name + bio if a profile row exists
 *   3. on submit: UPSERT to profiles via Supabase REST
 *      (Prefer: resolution=merge-duplicates → INSERT or UPDATE)
 *   4. on success: replace location with /me.html so the back button
 *      doesn't loop back into the editor
 */

// @ts-check

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { refreshIfNeeded, signOut } from './session.js';
import { pickImage, validateImage, resizeToJpeg, uploadToBucket, deleteFromBucket } from './uploads.js';

const form = /** @type {HTMLFormElement|null} */ (document.querySelector('#edit-form'));
const trailInput = /** @type {HTMLInputElement|null} */ (document.querySelector('#trail-name'));
const bioInput = /** @type {HTMLTextAreaElement|null} */ (document.querySelector('#bio'));
const submitBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#submit'));
const errorEl = /** @type {HTMLElement|null} */ (document.querySelector('#edit-error'));
const bioCount = /** @type {HTMLElement|null} */ (document.querySelector('#bio-count'));
const bioCountWrap = /** @type {HTMLElement|null} */ (document.querySelector('#bio-count-wrap'));

const avatarPreview = /** @type {HTMLElement|null} */ (document.querySelector('#avatar-preview'));
const avatarInitial = /** @type {HTMLElement|null} */ (document.querySelector('#avatar-initial'));
const avatarPickBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#avatar-pick'));
const avatarRemoveBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#avatar-remove'));
const avatarProgress = /** @type {HTMLElement|null} */ (document.querySelector('#avatar-progress'));
const locStatus = /** @type {HTMLElement|null} */ (document.querySelector('#loc-status'));
const locStatusText = /** @type {HTMLElement|null} */ (document.querySelector('#loc-status-text'));
const locPickBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#loc-pick'));
const locClearBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#loc-clear'));
const locProgress = /** @type {HTMLElement|null} */ (document.querySelector('#loc-progress'));
const locShowEl = /** @type {HTMLInputElement|null} */ (document.querySelector('#loc-show'));
const countryInput = /** @type {HTMLInputElement|null} */ (document.querySelector('#home-country'));
const coverPreview = /** @type {HTMLElement|null} */ (document.querySelector('#cover-preview'));
const coverEmpty = /** @type {HTMLElement|null} */ (document.querySelector('#cover-empty'));
const coverPickBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#cover-pick'));
const coverRemoveBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#cover-remove'));
const coverProgress = /** @type {HTMLElement|null} */ (document.querySelector('#cover-progress'));

/** @type {string|null} */
let currentCoverUrl = null;
/** @type {string|null} */
let coverLocalPreviewUrl = null;

/** @type {number|null} */
let currentLat = null;
/** @type {number|null} */
let currentLng = null;
/** @type {boolean} */
let currentShowOnMap = false;

/** @type {string|null} */
let currentAvatarUrl = null;

if (!form || !trailInput || !bioInput || !submitBtn || !errorEl) {
  throw new Error('me-edit: required DOM nodes missing');
}

const BIO_MAX = 500;

/** @type {string} */
let userId = '';
/** @type {string} */
let accessToken = '';

function start() { boot().catch((e) => {
    console.error('me-edit boot failed', e);
    showError('Could not load the editor.');
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
  userId = session.user.id;
  accessToken = session.accessToken;

  // Prefill from existing row (RLS scopes by id)
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=trail_name,bio,avatar_url,cover_url,lat,lng,show_on_map,home_country&limit=1`;
  try {
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
      return;
    }
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) {
        if (rows[0].trail_name && trailInput) trailInput.value = String(rows[0].trail_name);
        if (rows[0].bio && bioInput) bioInput.value = String(rows[0].bio);
        if (rows[0].avatar_url) {
          currentAvatarUrl = String(rows[0].avatar_url);
          renderAvatar(currentAvatarUrl);
        }
        if (rows[0].cover_url) {
          currentCoverUrl = String(rows[0].cover_url);
          renderCover(currentCoverUrl);
        }
        if (typeof rows[0].lat === 'number' && typeof rows[0].lng === 'number') {
          currentLat = Number(rows[0].lat);
          currentLng = Number(rows[0].lng);
        }
        currentShowOnMap = Boolean(rows[0].show_on_map);
        if (rows[0].home_country && countryInput) countryInput.value = String(rows[0].home_country);
        renderLocation();
      }
    }
  } catch { /* prefill is best-effort */ }

  updateBioCount();
}

bioInput.addEventListener('input', updateBioCount);

function updateBioCount() {
  if (!bioInput || !bioCount || !bioCountWrap) return;
  const n = bioInput.value.length;
  bioCount.textContent = String(n);
  bioCountWrap.classList.toggle('over', n > BIO_MAX);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!trailInput || !bioInput || !submitBtn) return;

  const trail = trailInput.value.trim();
  const bio = bioInput.value.trim();

  if (!trail || trail.length < 2 || trail.length > 32) {
    showError('Trail name must be 2–32 characters.');
    return;
  }
  if (bio.length > BIO_MAX) {
    showError(`Bio is too long (${bio.length}/${BIO_MAX}).`);
    return;
  }

  setSubmitting(true);
  hideError();

  try {
    // Compute the canonical pass_number / wanderkind_id from the user
    // UUID — same algorithm the on_auth_user_created trigger uses:
    //   'WK-' || upper(substring(replace(id::text, '-', '') from 1 for 8))
    // Including these in the UPSERT body covers the case where the
    // trigger didn't fire (OTP signups in some Supabase versions) so
    // the INSERT path doesn't hit the NOT NULL constraint on
    // profiles.pass_number. For existing rows the value is identical,
    // so UPDATE is a no-op on those columns.
    const passNum = 'WK-' + userId.replace(/-/g, '').slice(0, 8).toUpperCase();

    // UPSERT — insert if no row exists, update if it does. The id PK
    // is the conflict target. Supabase needs Prefer: resolution=merge-duplicates.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        pass_number: passNum,
        wanderkind_id: passNum,
        trail_name: trail,
        bio: bio || null,
        avatar_url: currentAvatarUrl,
        cover_url: currentCoverUrl,
        lat: currentLat,
        lng: currentLng,
        show_on_map: currentShowOnMap,
        home_country: countryInput && countryInput.value.trim() ? countryInput.value.trim().slice(0, 64) : null,
        // Wanderkind's social contract: only the chosen trail name is
        // public. The civilian identity (given_name / surname auto-
        // populated by the auth trigger from email metadata) is wiped
        // so no surface can leak it. Empty strings, not null — those
        // columns are NOT NULL DEFAULT '' on the server.
        given_name: '',
        surname: '',
      }),
    });

    if (res.status === 401) {
      await signOut();
      location.replace('/auth.html');
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Surface the actual Postgres error message in addition to status.
      let msg = `Save failed (HTTP ${res.status}).`;
      try {
        const j = JSON.parse(body);
        if (j?.message) msg += ' ' + j.message;
        else if (body) msg += ' ' + body.slice(0, 200);
      } catch { msg += ' ' + body.slice(0, 200); }
      showError(msg);
      console.error('me-edit save failed:', res.status, body);
      return;
    }

    // Mirror trail_name into auth.users.user_metadata so the JWT-backed
    // greeting in main.js / more.js updates without re-fetching the
    // profile row. Best-effort — profile is the source of truth.
    fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { trail_name: trail } }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });

    // location.replace so back button skips the editor
    location.replace('/me.html');
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Network error.');
  } finally {
    setSubmitting(false);
  }
});

/** @param {boolean} busy */
function setSubmitting(busy) {
  if (!submitBtn) return;
  submitBtn.disabled = busy;
  submitBtn.setAttribute('aria-busy', String(busy));
  submitBtn.textContent = busy ? 'Saving…' : 'Save pass';
}

/** @param {string} msg */
function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function hideError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}



/**
 * Refresh the session right before a long-lived storage call so the
 * Authorization header doesn't carry a stale token that's been sitting
 * in this page for >1h.
 */
async function freshToken() {
  const s = await refreshIfNeeded();
  if (s && s.accessToken) accessToken = s.accessToken;
  return accessToken;
}

// --- Avatar pick / upload ------------------------------------------------

/** Tracks any object URL we've handed to <img>, so we can revoke it. */
let localPreviewUrl = /** @type {string|null} */ (null);

function revokeLocalPreview() {
  if (localPreviewUrl) {
    try { URL.revokeObjectURL(localPreviewUrl); } catch { /* ignore */ }
    localPreviewUrl = null;
  }
}

if (avatarPickBtn) {
  avatarPickBtn.addEventListener('click', async () => {
    if (!accessToken || !userId) return;
    try {
      hideError();
      const file = await pickImage();
      if (!file) return;
      const err = validateImage(file);
      if (err) { showError(err); return; }

      setAvatarBusy(true, 'Preparing…');
      const blob = await resizeToJpeg(file, 800, 0.86);
      revokeLocalPreview();
      localPreviewUrl = URL.createObjectURL(blob);
      renderAvatar(localPreviewUrl);

      setAvatarBusy(true, 'Uploading…');
      // Refresh the JWT first — page may have been open for hours.
      await freshToken();
      // Stable filename = avatar.jpg (x-upsert overwrites). One object
      // per user per bucket. No orphan accumulation.
      const publicUrl = await uploadToBucket({
        bucket: 'avatars',
        userId,
        blob,
        accessToken,
        contentType: 'image/jpeg',
      });
      // Cache-bust the public URL so the browser fetches the new bytes
      // even though the bucket key didn't change.
      currentAvatarUrl = publicUrl + '?v=' + Date.now();
      // Pre-warm the image so the swap from blob:→https:// is instant
      // before we revoke the local URL.
      const warm = new Image();
      warm.decoding = 'async';
      warm.src = currentAvatarUrl;
      try { await warm.decode(); } catch { /* fallthrough */ }
      renderAvatar(currentAvatarUrl);
      revokeLocalPreview();
      setAvatarBusy(false, 'Photo ready. Save to keep it.');
    } catch (e) {
      console.error('avatar upload failed', e);
      revokeLocalPreview();
      // Restore previous
      if (currentAvatarUrl) renderAvatar(currentAvatarUrl);
      else renderAvatar(null);
      setAvatarBusy(false);
      showError(e instanceof Error ? e.message : 'Could not upload that image.');
    }
  });
}

if (avatarRemoveBtn) {
  avatarRemoveBtn.addEventListener('click', async () => {
    revokeLocalPreview();
    currentAvatarUrl = null;
    renderAvatar(null);
    setAvatarBusy(true, 'Removing photo…');
    try {
      await freshToken();
      await deleteFromBucket({ bucket: 'avatars', userId, accessToken });
    } catch (e) {
      // The storage object may already be gone (404 is treated as
      // success by deleteFromBucket). For any real error, the DB row
      // will still be nulled on Save so the avatar stops surfacing
      // even if the bucket object lingers.
      console.warn('avatar delete from storage failed', e);
    }
    setAvatarBusy(false, 'Photo cleared. Save to confirm.');
  });
}

/** @param {string|null} url */
function renderAvatar(url) {
  if (!avatarPreview || !avatarInitial) return;
  if (url) {
    avatarPreview.innerHTML = '';
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    avatarPreview.appendChild(img);
    if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
  } else {
    const init = (trailInput && trailInput.value.trim()[0]) || '·';
    avatarPreview.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'avatar-preview-initial';
    span.id = 'avatar-initial';
    span.textContent = init.toUpperCase();
    avatarPreview.appendChild(span);
    if (avatarRemoveBtn) avatarRemoveBtn.hidden = true;
  }
}

/** @param {boolean} busy @param {string} [msg] */
function setAvatarBusy(busy, msg) {
  if (avatarPickBtn) {
    avatarPickBtn.disabled = busy;
    avatarPickBtn.setAttribute('aria-busy', String(busy));
  }
  if (avatarProgress) {
    if (msg) {
      avatarProgress.textContent = msg;
      avatarProgress.hidden = false;
    } else if (!busy) {
      avatarProgress.hidden = true;
      avatarProgress.textContent = '';
    }
  }
}



// --- Cover photo pick / upload ------------------------------------------

function revokeCoverLocalPreview() {
  if (coverLocalPreviewUrl) {
    try { URL.revokeObjectURL(coverLocalPreviewUrl); } catch { /* ignore */ }
    coverLocalPreviewUrl = null;
  }
}

if (coverPickBtn) {
  coverPickBtn.addEventListener('click', async () => {
    if (!accessToken || !userId) return;
    try {
      hideError();
      const file = await pickImage();
      if (!file) return;
      const err = validateImage(file);
      if (err) { showError(err); return; }

      setCoverBusy(true, 'Preparing…');
      // Wider crop: 1600 max dim, slightly lower quality (covers are
      // viewed at small sizes; bigger payload doesn't pay back).
      const blob = await resizeToJpeg(file, 1600, 0.82);
      revokeCoverLocalPreview();
      coverLocalPreviewUrl = URL.createObjectURL(blob);
      renderCover(coverLocalPreviewUrl);

      setCoverBusy(true, 'Uploading…');
      await freshToken();
      const publicUrl = await uploadToBucket({
        bucket: 'covers',
        userId,
        blob,
        accessToken,
        contentType: 'image/jpeg',
        filename: 'cover.jpg',
      });
      currentCoverUrl = publicUrl + '?v=' + Date.now();
      const warm = new Image();
      warm.decoding = 'async';
      warm.src = currentCoverUrl;
      try { await warm.decode(); } catch { /* fallthrough */ }
      renderCover(currentCoverUrl);
      revokeCoverLocalPreview();
      setCoverBusy(false, 'Cover ready. Save to keep it.');
    } catch (e) {
      console.error('cover upload failed', e);
      revokeCoverLocalPreview();
      if (currentCoverUrl) renderCover(currentCoverUrl);
      else renderCover(null);
      setCoverBusy(false);
      showError(e instanceof Error ? e.message : 'Could not upload that cover.');
    }
  });
}

if (coverRemoveBtn) {
  coverRemoveBtn.addEventListener('click', async () => {
    revokeCoverLocalPreview();
    currentCoverUrl = null;
    renderCover(null);
    setCoverBusy(true, 'Removing cover…');
    try {
      await freshToken();
      await deleteFromBucket({ bucket: 'covers', userId, accessToken, filename: 'cover.jpg' });
    } catch (e) {
      console.warn('cover delete from storage failed', e);
    }
    setCoverBusy(false, 'Cover cleared. Save to confirm.');
  });
}

/** @param {string|null} url */
function renderCover(url) {
  if (!coverPreview || !coverEmpty) return;
  // Remove any existing <img>
  const existing = coverPreview.querySelector('img');
  if (existing) existing.remove();
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    img.decoding = 'async';
    coverPreview.appendChild(img);
    coverEmpty.hidden = true;
    if (coverRemoveBtn) coverRemoveBtn.hidden = false;
  } else {
    coverEmpty.hidden = false;
    if (coverRemoveBtn) coverRemoveBtn.hidden = true;
  }
}

/** @param {boolean} busy @param {string} [msg] */
function setCoverBusy(busy, msg) {
  if (coverPickBtn) {
    coverPickBtn.disabled = busy;
    coverPickBtn.setAttribute('aria-busy', String(busy));
  }
  if (coverProgress) {
    if (msg) {
      coverProgress.textContent = msg;
      coverProgress.hidden = false;
    } else if (!busy) {
      coverProgress.hidden = true;
      coverProgress.textContent = '';
    }
  }
}

// Release any in-flight object URLs on unload.
window.addEventListener('pagehide', () => { revokeLocalPreview(); revokeCoverLocalPreview(); });


// --- Location pin -------------------------------------------------------

if (locPickBtn) {
  locPickBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      setLocBusy(false, 'Your browser does not support geolocation.');
      return;
    }
    setLocBusy(true, 'Looking up your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Round to 3 decimal places (~110 m precision) for privacy.
        currentLat = Math.round(pos.coords.latitude * 1000) / 1000;
        currentLng = Math.round(pos.coords.longitude * 1000) / 1000;
        renderLocation();
        setLocBusy(false, 'Pin set. Save to confirm.');
      },
      (err) => {
        const msg = err.code === 1
          ? 'Permission denied — enable location in settings, then try again.'
          : err.code === 2
            ? 'Could not determine your location. Try again from a different spot.'
            : err.code === 3
              ? 'Location request timed out.'
              : 'Could not get your location.';
        setLocBusy(false, msg);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  });
}

if (locClearBtn) {
  locClearBtn.addEventListener('click', () => {
    currentLat = null;
    currentLng = null;
    renderLocation();
    setLocBusy(false, 'Pin cleared. Save to confirm.');
  });
}

if (locShowEl) {
  locShowEl.addEventListener('change', () => {
    currentShowOnMap = locShowEl.checked;
    renderLocation();
  });
}

function renderLocation() {
  if (!locStatus || !locStatusText) return;
  if (typeof currentLat === 'number' && typeof currentLng === 'number') {
    locStatus.dataset.state = 'set';
    locStatusText.textContent = formatCoords(currentLat, currentLng);
    if (locClearBtn) locClearBtn.hidden = false;
  } else {
    locStatus.dataset.state = 'empty';
    locStatusText.textContent = 'No pin yet';
    if (locClearBtn) locClearBtn.hidden = true;
  }
  if (locShowEl) {
    locShowEl.checked = currentShowOnMap;
    // Can't show on map without a pin
    locShowEl.disabled = (currentLat === null || currentLng === null);
  }
}

/** @param {number} lat @param {number} lng */
function formatCoords(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}  ·  ${Math.abs(lng).toFixed(3)}° ${ew}`;
}

/** @param {boolean} busy @param {string} [msg] */
function setLocBusy(busy, msg) {
  if (locPickBtn) {
    locPickBtn.disabled = busy;
    locPickBtn.setAttribute('aria-busy', String(busy));
  }
  if (locProgress) {
    if (msg) {
      locProgress.textContent = msg;
      locProgress.hidden = false;
    } else if (!busy) {
      locProgress.hidden = true;
      locProgress.textContent = '';
    }
  }
}
