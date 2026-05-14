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
import { pickImage, validateImage, resizeToJpeg, uploadToBucket } from './uploads.js';

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
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=trail_name,bio,avatar_url&limit=1`;
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


// --- Avatar pick / upload ------------------------------------------------

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
      const localUrl = URL.createObjectURL(blob);
      renderAvatar(localUrl);

      setAvatarBusy(true, 'Uploading…');
      const publicUrl = await uploadToBucket({
        bucket: 'avatars',
        userId,
        blob,
        accessToken,
        contentType: 'image/jpeg',
      });
      // Bust CDN cache for an existing object replaced via x-upsert
      const cacheBust = publicUrl + '?v=' + Date.now();
      currentAvatarUrl = cacheBust;
      URL.revokeObjectURL(localUrl);
      renderAvatar(currentAvatarUrl);
      setAvatarBusy(false, 'Photo ready. Save to keep it.');
    } catch (e) {
      console.error('avatar upload failed', e);
      // Restore previous
      if (currentAvatarUrl) renderAvatar(currentAvatarUrl);
      else renderAvatar(null);
      setAvatarBusy(false);
      showError(e instanceof Error ? e.message : 'Could not upload that image.');
    }
  });
}

if (avatarRemoveBtn) {
  avatarRemoveBtn.addEventListener('click', () => {
    currentAvatarUrl = null;
    renderAvatar(null);
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
