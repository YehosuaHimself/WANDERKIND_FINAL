/**
 * Wanderkind PPWA — /app.html entry point.
 *
 * Day 4: closes the magic-link loop.
 *
 *   1. Restore any GH-Pages SPA fallback redirect.
 *   2. Look for Supabase auth tokens in the URL hash.
 *   3. If present, exchange them for a session and persist.
 *   4. Render either the signed-in or signed-out shell into #app,
 *      replacing the boot screen.
 *
 * The boot screen stays visible until JS is ready — so on slow connections
 * the user always sees the seal + mantra rather than a blank #app.
 */

// @ts-check

import {
  refreshIfNeeded,
  resolveAuthCallback,
  signOut,
} from './session.js';

/* ── 1. GH-Pages 404 fallback restore ───────────────────────────── */
(function restoreRedirect() {
  const target = sessionStorage.getItem('wk-redirect');
  if (target && target !== '/') {
    sessionStorage.removeItem('wk-redirect');
    history.replaceState(null, '', target);
  }
})();

/* ── 2. boot ────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error('Wanderkind boot failed', e);
    renderError('Something went wrong. Try reloading.');
  });
});

async function boot() {
  // First, try to resolve a magic-link callback if the URL has one.
  const resolved = await resolveAuthCallback();

  if (resolved && 'error' in resolved) {
    renderError(resolved.error);
    return;
  }

  // Either a fresh session from the callback, or the cached one
  // (lazily refreshed if within 5 min of expiry), or null.
  const session = resolved ?? (await refreshIfNeeded());

  if (session) {
    renderSignedIn(/** @type {import('./session.js').WkSession} */ (session));
  } else {
    renderSignedOut();
  }
}

/* ── 3. views ────────────────────────────────────────────────────── */

/** @param {import('./session.js').WkSession} session */
function renderSignedIn(session) {
  const app = document.getElementById('app');
  if (!app) return;

  const meta = session.user.user_metadata || {};
  /** @type {string} */
  const trailName = String(meta['trail_name'] || meta['name'] || '').trim();
  const greeting = trailName || 'Wanderkind';

  app.innerHTML = `
    <section class="app-signed" aria-labelledby="signed-h">
      <img class="app-seal" src="/assets/icons/seal.svg" alt="" width="68" height="68" style="color: var(--wk-amber)" />
      <span class="eyebrow">— Signed in</span>
      <h1 class="app-greeting" id="signed-h">Welcome,<br><em>${escapeHTML(greeting)}.</em></h1>
      <p class="app-email">${escapeHTML(session.user.email)}</p>

      <div class="app-actions">
        <a class="btn-amber" href="/map.html">Open the Map</a>
        <button class="btn-ghost" id="sign-out" type="button">Sign out</button>
      </div>

      <p class="app-hint">More surfaces land in the coming days. Your pass, your stamps, your roof.</p>
    </section>
  `;

  const signOutBtn = document.getElementById('sign-out');
  signOutBtn?.addEventListener('click', async () => {
    /** @type {HTMLButtonElement} */ (signOutBtn).disabled = true;
    /** @type {HTMLButtonElement} */ (signOutBtn).textContent = 'Signing out…';
    await signOut();
    location.reload();
  });
}

function renderSignedOut() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="app-signed" aria-labelledby="open-h">
      <img class="app-seal" src="/assets/icons/seal.svg" alt="" width="68" height="68" style="color: var(--wk-amber)" />
      <span class="eyebrow">— Wanderkind</span>
      <h1 class="app-greeting" id="open-h">Every Way begins at your door.</h1>
      <p class="app-hint">A trusting community of wanderers. Walk anywhere. Be welcomed.</p>

      <div class="app-actions">
        <a class="btn-amber" href="/auth.html">Open your door</a>
        <a class="btn-ghost" href="/">What is Wanderkind?</a>
      </div>
    </section>
  `;
}

/** @param {string} msg */
function renderError(msg) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="app-signed" aria-labelledby="err-h">
      <img class="app-seal" src="/assets/icons/seal.svg" alt="" width="68" height="68" style="color: var(--wk-amber)" />
      <span class="eyebrow" style="color: #B03A3A">— Sign-in failed</span>
      <h1 class="app-greeting" id="err-h">The door didn't open.</h1>
      <p class="app-hint">${escapeHTML(msg)}</p>
      <div class="app-actions">
        <a class="btn-amber" href="/auth.html">Try again</a>
        <a class="btn-ghost" href="/">Back to wanderkind.love</a>
      </div>
    </section>
  `;
}

/**
 * Minimal HTML escape — protects against the slim chance that
 * user_metadata.trail_name contains markup. Anything we inject into
 * innerHTML from a user-controlled value passes through this.
 * @param {string} s
 * @returns {string}
 */
function escapeHTML(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
