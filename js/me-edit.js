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

const form = /** @type {HTMLFormElement|null} */ (document.querySelector('#edit-form'));
const trailInput = /** @type {HTMLInputElement|null} */ (document.querySelector('#trail-name'));
const bioInput = /** @type {HTMLTextAreaElement|null} */ (document.querySelector('#bio'));
const submitBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#submit'));
const errorEl = /** @type {HTMLElement|null} */ (document.querySelector('#edit-error'));
const bioCount = /** @type {HTMLElement|null} */ (document.querySelector('#bio-count'));
const bioCountWrap = /** @type {HTMLElement|null} */ (document.querySelector('#bio-count-wrap'));

if (!form || !trailInput || !bioInput || !submitBtn || !errorEl) {
  throw new Error('me-edit: required DOM nodes missing');
}

const BIO_MAX = 500;

/** @type {string} */
let userId = '';
/** @type {string} */
let accessToken = '';

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error('me-edit boot failed', e);
    showError('Could not load the editor.');
  });
});

async function boot() {
  const session = await refreshIfNeeded();
  if (!session) {
    location.replace('/auth.html');
    return;
  }
  userId = session.user.id;
  accessToken = session.accessToken;

  // Prefill from existing row (RLS scopes by id)
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=trail_name,bio&limit=1`;
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
        // Wanderkind's social contract: only the chosen trail name is
        // public. The civilian identity (given_name / surname auto-
        // populated by the auth trigger from email metadata) is wiped
        // so no surface can leak it.
        given_name: null,
        surname: null,
      }),
    });

    if (res.status === 401) {
      await signOut();
      location.replace('/auth.html');
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      showError(`Save failed (HTTP ${res.status}). ${body.slice(0, 120)}`);
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
