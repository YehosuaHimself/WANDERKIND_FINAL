/**
 * /auth.html — two-step OTP sign-in (no email-link redirect).
 *
 * Flow:
 *   1. Email input → POST /auth/v1/otp  (Supabase emails a 6-digit code)
 *   2. Code input  → POST /auth/v1/verify {email, token, type:'email'}
 *                    → save session via session.js
 *                    → redirect to /me.html
 *
 * The user never has to click a link in their email. This sidesteps the
 * fundamental iOS limitation that email-app links always open in the
 * default browser, never in an installed PWA. They read the code from
 * their inbox and type it into Wanderkind — signed in, never left.
 */

// @ts-check
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { saveSession } from './session.js';

const CODE_LEN = 6;

/** @type {HTMLElement|null} */ const stateEmail   = document.getElementById('state-email');
/** @type {HTMLElement|null} */ const stateCode    = document.getElementById('state-code');
/** @type {HTMLElement|null} */ const stateSuccess = document.getElementById('state-success');

/** @type {HTMLFormElement|null} */ const emailForm   = /** @type {any} */ (document.getElementById('email-form'));
/** @type {HTMLInputElement|null} */ const emailInput = /** @type {any} */ (document.getElementById('email'));
/** @type {HTMLButtonElement|null} */ const sendBtn   = /** @type {any} */ (document.getElementById('send-btn'));
/** @type {HTMLElement|null} */ const emailError     = document.getElementById('email-error');

/** @type {HTMLFormElement|null} */ const codeForm    = /** @type {any} */ (document.getElementById('code-form'));
/** @type {HTMLInputElement|null} */ const codeInput  = /** @type {any} */ (document.getElementById('code'));
/** @type {HTMLButtonElement|null} */ const verifyBtn = /** @type {any} */ (document.getElementById('verify-btn'));
/** @type {HTMLElement|null} */ const codeError      = document.getElementById('code-error');
/** @type {HTMLElement|null} */ const codeEmailEcho  = document.getElementById('code-email-echo');
/** @type {HTMLButtonElement|null} */ const resendBtn = /** @type {any} */ (document.getElementById('resend-btn'));
/** @type {HTMLButtonElement|null} */ const changeBtn = /** @type {any} */ (document.getElementById('change-btn'));

/** @type {string} */
let pendingEmail = (() => {
  try { return sessionStorage.getItem('wk-auth-pending') || ''; } catch { return ''; }
})();

// If we have a pending email from a previous step, jump straight to code entry
if (pendingEmail && stateEmail && stateCode && codeEmailEcho) {
  codeEmailEcho.textContent = pendingEmail;
  stateEmail.hidden = true;
  stateCode.hidden = false;
}

if (emailForm && emailInput && sendBtn && stateEmail && stateCode) {
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(emailError, 'Please enter a valid email.');
      return;
    }

    hideError(emailError);
    setBusy(sendBtn, true, 'Sending code…');

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email,
          create_user: true,
          options: { emailRedirectTo: 'https://wanderkind.love/app.html' },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.msg || body?.error_description || `Couldn't send (HTTP ${res.status})`;
        showError(emailError, msg);
        return;
      }
      pendingEmail = email;
      try { sessionStorage.setItem('wk-auth-pending', email); } catch { /* ignore */ }
      if (codeEmailEcho) codeEmailEcho.textContent = email;
      stateEmail.hidden = true;
      stateCode.hidden = false;
      // Focus the code field
      setTimeout(() => codeInput?.focus(), 60);
    } catch (err) {
      showError(emailError, err instanceof Error ? err.message : 'Network error.');
    } finally {
      setBusy(sendBtn, false, 'Send code');
    }
  });
}

if (codeForm && codeInput && verifyBtn && stateCode && stateSuccess) {
  // Auto-trim + format-as-typed
  codeInput.addEventListener('input', () => {
    let v = codeInput.value.replace(/\D/g, '').slice(0, CODE_LEN);
    codeInput.value = v;
    if (v.length === CODE_LEN) {
      // Auto-submit when 6 digits entered
      codeForm.requestSubmit();
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = codeInput.value.trim();
    if (token.length !== CODE_LEN || !/^\d+$/.test(token)) {
      showError(codeError, `Enter the ${CODE_LEN}-digit code.`);
      return;
    }

    hideError(codeError);
    setBusy(verifyBtn, true, 'Signing in…');

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: pendingEmail,
          token,
          type: 'email',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.msg ||
          body?.error_description ||
          (res.status === 400 ? 'That code isn\'t right. Check your email.' : `HTTP ${res.status}`);
        showError(codeError, msg);
        return;
      }

      const data = await res.json();
      if (!data?.access_token || !data?.refresh_token || !data?.user?.id) {
        showError(codeError, 'Unexpected response from server.');
        return;
      }

      saveSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        user: {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata || {},
        },
      });

      try { sessionStorage.removeItem('wk-auth-pending'); } catch { /* ignore */ }
      stateCode.hidden = true;
      stateSuccess.hidden = false;
      setTimeout(async () => {
        // EPIC 11 · face verification gate · MUST verify unless we can prove the user already did.
        // Default = /verify-me.html. We flip to /map.html only when the profile row exists AND
        // face_verified_at is a non-null timestamp. Missing row, fetch failure, or any
        // ambiguity = stay on the gate. This prevents accidental bypass.
        let nextUrl = '/verify-me.html?next=/map.html';
        try {
          const profResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=face_verified_at`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.access_token}` }
          });
          if (profResp.ok) {
            const rows = await profResp.json();
            if (rows[0] && rows[0].face_verified_at) {
              nextUrl = '/map.html';
            }
          }
        } catch (_) { /* keep nextUrl = verify-me.html */ }
        location.replace(nextUrl);
      }, 900);
    } catch (err) {
      showError(codeError, err instanceof Error ? err.message : 'Network error.');
    } finally {
      setBusy(verifyBtn, false, 'Sign in');
    }
  });
}

// "Resend code" — sends a fresh OTP, shows visible confirmation,
// throttles to one click per 30 s to keep within Supabase's OTP
// rate-limit window.
let lastResendAt = 0;
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    if (!pendingEmail) return;
    const now = Date.now();
    const cooldown = 30000;
    if (now - lastResendAt < cooldown) {
      const wait = Math.ceil((cooldown - (now - lastResendAt)) / 1000);
      showError(codeError, `Wait ${wait}s before resending.`);
      return;
    }
    lastResendAt = now;
    hideError(codeError);
    setBusy(resendBtn, true, 'Sending…');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          email: pendingEmail,
          create_user: true,
          options: { emailRedirectTo: 'https://wanderkind.love/app.html' },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.msg || body?.error_description || `HTTP ${res.status}`;
        showError(codeError, msg);
        lastResendAt = 0;   // allow immediate retry on error
        return;
      }
      // Visible confirmation, separate from the error slot
      showInfo(`New code sent. Check ${pendingEmail}.`);
    } catch (err) {
      showError(codeError, err instanceof Error ? err.message : 'Network error.');
      lastResendAt = 0;
    } finally {
      setBusy(resendBtn, false, 'Resend code');
    }
  });
}

// Inline info toast above the form
/** @param {string} msg */
function showInfo(msg) {
  let el = document.getElementById('auth-info');
  if (!el) {
    el = document.createElement('p');
    el.id = 'auth-info';
    el.className = 'auth-info';
    el.setAttribute('role', 'status');
    const form = document.getElementById('code-form');
    form?.parentElement?.insertBefore(el, form);
  }
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { if (el) el.hidden = true; }, 5000);
}

// "Use a different email"
if (changeBtn && stateEmail && stateCode) {
  changeBtn.addEventListener('click', () => {
    pendingEmail = '';
    try { sessionStorage.removeItem('wk-auth-pending'); } catch { /* ignore */ }
    lastResendAt = 0;
    if (codeInput) codeInput.value = '';
    hideError(codeError);
    stateCode.hidden = true;
    stateEmail.hidden = false;
    setTimeout(() => emailInput?.focus(), 60);
  });
}

/** @param {HTMLButtonElement|null} btn  @param {boolean} busy  @param {string} label */
function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
  btn.textContent = label;
}
/** @param {HTMLElement|null} el  @param {string} msg */
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}
/** @param {HTMLElement|null} el */
function hideError(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}
