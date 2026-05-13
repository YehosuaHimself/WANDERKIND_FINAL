/**
 * /more.html — central hub. Lightweight: read session for greeting +
 * version, wire sign-out, read /version.json for the build SHA.
 *
 * Not require-auth: a signed-out user can still view this page; they
 * just see "Wanderkind" instead of their trail name.
 */

// @ts-check

import { refreshIfNeeded, signOut } from './session.js';

const helloEl = document.getElementById('more-hello');
const versionEl = document.getElementById('more-version');
const signoutBtn = document.getElementById('more-signout');

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(() => {});
});

async function boot() {
  // Greeting — show trail_name if signed in
  const session = await refreshIfNeeded();
  if (helloEl) {
    if (session) {
      const meta = session.user.user_metadata || {};
      const name = String(meta['trail_name'] || meta['name'] || session.user.email.split('@')[0] || '').trim();
      helloEl.textContent = name ? `· ${name}` : '';
    } else {
      helloEl.textContent = '';
    }
  }

  // Sign-out: hide button if no session
  if (signoutBtn) {
    if (!session) {
      /** @type {HTMLButtonElement} */ (signoutBtn).hidden = true;
    } else {
      signoutBtn.addEventListener('click', async () => {
        /** @type {HTMLButtonElement} */ (signoutBtn).disabled = true;
        await signOut();
        location.replace('/');
      });
    }
  }

  // Version stamp from /version.json (always network — SW exempts it)
  if (versionEl) {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (res.ok) {
        const v = await res.json();
        const sha = String(v?.commit || '').slice(0, 7);
        const ts = v?.deployed_at ? new Date(v.deployed_at).toISOString().slice(0, 10) : '';
        if (sha || ts) {
          versionEl.textContent = `Wanderkind · ${sha}${ts ? ' · ' + ts : ''}`;
        }
      }
    } catch { /* keep default */ }
  }
}
