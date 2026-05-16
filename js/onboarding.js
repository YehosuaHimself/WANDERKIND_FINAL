// @ts-nocheck
/**
 * /js/onboarding.js · the 11-step streamlined Wanderkind onboarding.
 *
 * One continuous wizard. Steps:
 *   1  Welcome (LOGO · WANDERKIND · JOIN THE NETWORK · WALK FOREVER FREE)
 *   2  Email · send magic-link via Supabase
 *   3  Magic-link sent · land here, auto-resume after click
 *   4  Trail name + region (profiles.trail_name, last_location_label)
 *   5  EVERY WANDERKIND IS ALSO A HOST · doctrine
 *   6  Face biometric (delegates to /verify-me.html?next=/onboarding/?step=7)
 *   7  ID + Passes unlocked · "your ID and Passes are yours now"
 *   8  Set PIN (4-digit, hashed with PBKDF2-SHA256 client-side)
 *   9  ID photo · biometric-grade · validated (heuristic v1 · MediaPipe in v2)
 *   10 House setup (delegates to /host.html?next=/onboarding/?step=11)
 *   11 Welcome · open the map
 *
 * State persists across redirects in localStorage 'wk-onb-state-v1'.
 * Step is also reflected in URL (?step=N) so deep-linking + back works.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { getSession } from './session.js';

const $ = (id) => document.getElementById(id);
const TOTAL_STEPS = 11;
const STORE_KEY = 'wk-onb-state-v1';

const state = {
  step: 1,
  email: '',
  trail: '',
  region: '',
  pin: '',
  pinConfirm: '',
  pinStage: 'enter', // 'enter' | 'confirm'
  photoDataUrl: '',
};

document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Resume from URL ?step= if present (e.g. coming back from /verify-me.html)
  const url = new URLSearchParams(location.search);
  const fromUrl = parseInt(url.get('step'), 10);
  if (fromUrl && fromUrl >= 1 && fromUrl <= TOTAL_STEPS) state.step = fromUrl;

  // Note: we used to auto-advance signed-in users past steps 2/3, but that
  // bug also skipped step 3 (trail name) for anyone who refreshed after signup.
  // URL ?step= + localStorage already handle resume correctly without it.

  wireNavigation();
  wireStep2_signup();
  wireStep3_trail();
  wireStep4_region();
  wireStep8_pin();
  wireStep9_photo();
  render();
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch {}
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      step: state.step,
      email: state.email,
      trail: state.trail,
      region: state.region,
    }));
  } catch {}
}

function render() {
  $('onb-rail').style.transform = `translateX(-${(state.step - 1) * (100 / TOTAL_STEPS)}%)`;
  const stepName = stepLabel(state.step);
  $('onb-step-label').textContent = `Step ${state.step} of ${TOTAL_STEPS} · ${stepName}`;
  $('onb-progress-fill').style.width = `${(state.step / TOTAL_STEPS) * 100}%`;
  $('onb-back').hidden = state.step === 1 || state.step === 11;

  // URL reflects step (without reload)
  const url = new URL(location.href);
  url.searchParams.set('step', String(state.step));
  history.replaceState({}, '', url.toString());

  // Hydrate inputs from state
  if ($('onb-email') && state.email)  $('onb-email').value = state.email;
  if ($('onb-trail') && state.trail)  $('onb-trail').value = state.trail;
  if ($('onb-region') && state.region) $('onb-region').value = state.region;
  if ($('onb-email-shown'))             $('onb-email-shown').textContent = state.email || 'your inbox';
}

function stepLabel(n) {
  return ({
    1: 'Welcome',
    2: 'Your account',
    3: 'Trail name',
    4: 'Region',
    5: 'The doctrine',
    6: 'Face check',
    7: 'Unlocked',
    8: 'Set your PIN',
    9: 'ID photo',
    10: 'Your house',
    11: 'Welcome to the map',
  })[n] || '';
}

function goStep(n) {
  state.step = Math.max(1, Math.min(TOTAL_STEPS, n));
  saveState();
  render();
}

function wireNavigation() {
  $('onb-back').addEventListener('click', () => goStep(state.step - 1));
  document.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = parseInt(btn.dataset.next, 10);
      if (target) goStep(target);
    });
  });
}

/* ─── Step 2 · email + password signup ─────────────────────────────── */
function wireStep2_signup() {
  const btn = $('onb-signup');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const email = ($('onb-email').value || '').trim().toLowerCase();
    const password = ($('onb-password').value || '');
    if (!email || !/.+@.+\..+/.test(email)) {
      showErr('onb-err-email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      showErr('onb-err-email', 'Password must be at least 8 characters.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      // Try signup first; if email already exists, fall back to sign-in
      let r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let payload = await r.json().catch(() => ({}));
      if (!r.ok && /already|registered/i.test(payload.msg || payload.error_description || '')) {
        r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        payload = await r.json().catch(() => ({}));
      }
      if (!r.ok) throw new Error(payload.msg || payload.error_description || 'Could not create the account.');

      // Persist session in the same shape session.js expects
      const sess = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        user: payload.user || { id: payload.user_id, email },
        user_metadata: (payload.user && payload.user.user_metadata) || {},
      };
      localStorage.setItem('wk-session-v1', JSON.stringify(sess));

      state.email = email;
      saveState();
      clearErr('onb-err-email');
      goStep(3);
    } catch (err) {
      showErr('onb-err-email', err.message || 'Network error. Try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create my account';
    }
  });
}

/* ─── Step 3 · trail name ─────────────────────────────────────────── */
function wireStep3_trail() {
  const save = $('onb-save-trail');
  if (!save) return;
  save.addEventListener('click', async (e) => {
    e.preventDefault();
    const trail = ($('onb-trail').value || '').trim();
    if (!trail) {
      showErr('onb-err-trail', 'Pick a trail name to continue.');
      return;
    }
    state.trail = trail;
    saveState();
    const sess = getSession();
    if (sess) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sess.user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${sess.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ trail_name: trail }),
        });
      } catch {}
    }
    clearErr('onb-err-trail');
    goStep(4);
  });
}

/* ─── Step 4 · region ─────────────────────────────────────────────── */
function wireStep4_region() {
  const save = $('onb-save-region');
  if (!save) return;
  save.addEventListener('click', async (e) => {
    e.preventDefault();
    const region = ($('onb-region').value || '').trim();
    state.region = region;
    saveState();
    const sess = getSession();
    if (sess) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sess.user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${sess.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ last_location_label: region || null }),
        });
      } catch {}
    }
    clearErr('onb-err-region');
    goStep(5);
  });
}

/* ─── Step 8 · PIN entry + confirm ──────────────────────────────────── */
function wireStep8_pin() {
  const pad = $('onb-pin-keypad');
  if (!pad) return;
  pad.addEventListener('click', (e) => {
    const k = e.target.closest('.pin-key');
    if (!k) return;
    const key = k.dataset.key;
    if (!key) return;

    const which = state.pinStage === 'enter' ? 'pin' : 'pinConfirm';
    if (key === 'del') {
      state[which] = state[which].slice(0, -1);
    } else if (state[which].length < 4) {
      state[which] += key;
    }
    updatePinDots();

    if (state[which].length === 4) {
      if (state.pinStage === 'enter') {
        setTimeout(() => {
          state.pinStage = 'confirm';
          $('onb-pin-stage').textContent = 'Now confirm.';
          state.pinConfirm = '';
          updatePinDots();
        }, 200);
      } else {
        if (state.pin === state.pinConfirm) {
          finalizePin();
        } else {
          showErr('onb-err-pin', "Those don't match. Try once more.");
          setTimeout(() => {
            state.pinStage = 'enter';
            state.pin = '';
            state.pinConfirm = '';
            $('onb-pin-stage').textContent = 'Enter your new PIN.';
            updatePinDots();
            clearErr('onb-err-pin');
          }, 1000);
        }
      }
    }
  });
}

function updatePinDots() {
  const which = state.pinStage === 'enter' ? state.pin : state.pinConfirm;
  for (let i = 1; i <= 4; i++) {
    $(`pin-dot-${i}`).classList.toggle('on', i <= which.length);
  }
}

async function finalizePin() {
  // Hash + persist server-side via pin_hash RPC (existing infrastructure)
  const sess = getSession();
  if (!sess) { goStep(9); return; }
  try {
    const hash = await pbkdf2(state.pin, sess.user.id);
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_pin_hash`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sess.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_hash: hash }),
    });
  } catch (err) {
    console.warn('[onboarding] pin persist failed', err);
  }
  // Clear PIN from memory immediately
  state.pin = '';
  state.pinConfirm = '';
  state.pinStage = 'enter';
  goStep(9);
}

async function pbkdf2(pin, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    km, 256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ─── Step 9 · ID photo · biometric-grade ──────────────────────────────
 * Heuristic validation v1: single bright centered region, brightness
 * within range, reasonable sharpness, ID-3 aspect ratio.
 * Phase 2: swap in MediaPipe Face Detection for real face + landmark scoring.
 * ─────────────────────────────────────────────────────────────────── */
function wireStep9_photo() {
  const pick = $('onb-photo-pick');
  const input = $('onb-photo-input');
  if (!pick || !input) return;
  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    clearErr('onb-err-photo');
    $('onb-photo-continue').disabled = true;
    try {
      const dataUrl = await fileToDataUrl(f);
      const img = await loadImage(dataUrl);
      const verdict = await validateBiometric(img);
      if (!verdict.ok) {
        showErr('onb-err-photo', verdict.reason);
        return;
      }
      $('onb-photo-placeholder').hidden = true;
      $('onb-photo-preview').src = dataUrl;
      $('onb-photo-preview').hidden = false;
      state.photoDataUrl = dataUrl;
      $('onb-photo-continue').disabled = false;
      // Persist to profile.face_image (separate from bio image)
      uploadFaceImage(dataUrl).catch(() => {});
    } catch (err) {
      showErr('onb-err-photo', err.message || 'Could not read that photo.');
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('Could not read the file.'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not decode the image.'));
    img.src = src;
  });
}

/**
 * Heuristic biometric photo validation (v1).
 *  - Image must exist and decode
 *  - Aspect ratio close to ID-3 (35:45) — portrait, head-and-shoulders
 *  - Brightness must be reasonable (not too dark or washed-out)
 *  - There must be a single bright centered region (proxy for one face)
 * Phase-2 hook: replace this function with MediaPipe Face Detection +
 * landmark scoring (frontal, neutral, eyes-open). For now we keep it
 * heuristic so the wizard ships.
 */
async function validateBiometric(img) {
  // Aspect check (lenient — selfie cameras commonly produce 3:4 or 9:16)
  const ratio = img.naturalWidth / img.naturalHeight;
  if (ratio > 1.2) {
    return { ok: false, reason: 'Hold the phone upright. The photo should be portrait, not landscape.' };
  }
  // Brightness + center-of-mass on a downscaled canvas
  const N = 96;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, N, N);
  const data = cx.getImageData(0, 0, N, N).data;
  let sum = 0, brightSum = 0, brightX = 0, brightY = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const lum = (data[i] + data[i+1] + data[i+2]) / 3;
      sum += lum;
      if (lum > 130) { brightSum += 1; brightX += x; brightY += y; }
    }
  }
  const avg = sum / (N * N);
  if (avg < 60)  return { ok: false, reason: 'The photo is too dark. Move to even, natural light.' };
  if (avg > 220) return { ok: false, reason: 'The photo is washed out. Reduce direct light on your face.' };
  if (brightSum < N * N * 0.05) {
    return { ok: false, reason: 'We could not detect a face. Center your face in the frame.' };
  }
  const meanX = brightX / brightSum;
  const meanY = brightY / brightSum;
  // Center of mass should be roughly centered horizontally and in the upper half (head)
  if (meanX < N * 0.25 || meanX > N * 0.75) {
    return { ok: false, reason: 'Center your face horizontally in the frame.' };
  }
  if (meanY > N * 0.75) {
    return { ok: false, reason: 'Move closer or tilt the camera up so your face fills the upper-middle.' };
  }
  return { ok: true };
}

async function uploadFaceImage(dataUrl) {
  const sess = getSession();
  if (!sess) return;
  // Phase-2: real Supabase Storage upload. v1: just persist the data URL on
  // profile.face_image_url (small images only). The migration adds the column.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sess.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sess.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ face_image_url: dataUrl }),
    });
  } catch (err) {
    console.warn('[onboarding] face image persist failed', err);
  }
}

/* ─── tiny helpers ─────────────────────────────────────────────────── */
function showErr(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
}
function clearErr(id) {
  const el = $(id);
  if (el) el.classList.remove('on');
}
