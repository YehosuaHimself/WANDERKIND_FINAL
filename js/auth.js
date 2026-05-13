/**
 * /auth.html — magic-link sign-in
 *
 * Vanilla fetch to Supabase's /auth/v1/otp endpoint. No SDK bundle.
 * Two states:
 *   1. form     — email input + submit
 *   2. success  — "Check your inbox" with the email echoed
 *
 * On the server side, the OTP email is configured to redirect users to
 * /app.html after they click the magic link.
 */

// @ts-check
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

/** @type {HTMLFormElement | null} */
const form = document.querySelector('#auth-form');
/** @type {HTMLInputElement | null} */
const emailInput = document.querySelector('#email');
/** @type {HTMLButtonElement | null} */
const submitBtn = document.querySelector('#submit');
/** @type {HTMLElement | null} */
const errorEl = document.querySelector('#auth-error');
/** @type {HTMLElement | null} */
const formState = document.querySelector('#state-form');
/** @type {HTMLElement | null} */
const successState = document.querySelector('#state-success');
/** @type {HTMLElement | null} */
const successEmail = document.querySelector('#success-email');

if (!form || !emailInput || !submitBtn || !errorEl || !formState || !successState || !successEmail) {
  throw new Error('auth: required DOM nodes missing');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  /** Cast — we've guaranteed non-null above. */
  const email = /** @type {HTMLInputElement} */ (emailInput).value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Please enter a valid email.');
    return;
  }

  setLoading(true);
  hideError();

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
      const msg = body?.msg || body?.error_description || `Sign-in failed (HTTP ${res.status})`;
      showError(msg);
      return;
    }

    showSuccess(email);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Network error. Try again.');
  } finally {
    setLoading(false);
  }
});

/** @param {boolean} loading */
function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.setAttribute('aria-busy', String(loading));
  submitBtn.textContent = loading ? 'Sending…' : 'Send magic link';
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

/** @param {string} email */
function showSuccess(email) {
  if (!formState || !successState || !successEmail) return;
  formState.hidden = true;
  successState.hidden = false;
  successEmail.textContent = email;
  // Announce for screen readers
  successState.setAttribute('tabindex', '-1');
  /** @type {HTMLElement} */ (successState).focus();
}
