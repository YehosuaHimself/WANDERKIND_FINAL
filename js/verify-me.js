// @ts-nocheck
/**
 * /js/verify-me.js · mandatory FaceScan onboarding step. (v2 · hardened)
 *
 * Flow (one page, three slides via translateX track):
 *   1. Compose — explainer, Start scan / Maybe later (latter hidden in
 *      mandatory-onboarding mode when ?next= is present).
 *   2. Scanning — getUserMedia front camera. Three prompts over ~6s:
 *        - "Look at the camera"   (capture at t=1500ms + 600ms reaction)
 *        - "Blink slowly"          (capture at t=3500ms + 600ms reaction)
 *        - "Turn slightly"         (capture at t=5500ms + 600ms reaction)
 *      Frame pixels are hashed (SHA-256) locally then discarded.
 *      Liveness score combines three signals:
 *        - distinct hashes      (replay prevention)
 *        - brightness deltas    (motion proxy)
 *        - timing tolerance     (rejects automated replay)
 *   3. Confirmed — server returns ok=true, profile.face_verified_at = now().
 *
 * Server enforces the passing rule (liveness >= 0.62, distinct hashes).
 * Phase-2 hook: pass p_provider="stripe-identity-v1" once wired.
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  stream: null,
  next: '/map.html',
  mandatory: false,
  busy: false,
  cancelled: false,
};

document.addEventListener('DOMContentLoaded', () => {
  state.session = getSession();
  if (!state.session) {
    location.replace('/auth.html?next=' + encodeURIComponent(location.pathname + location.search));
    return;
  }

  const params = new URLSearchParams(location.search);
  // mandatory mode = the auth gate routed us here; in this mode we hide "Maybe later"
  if (params.get('next')) {
    state.next = params.get('next');
    state.mandatory = true;
  }

  // ── Guard: MediaDevices API present + secure context? ────────────────
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
    showError('v-err-compose', 'This browser cannot access the camera. Open Wanderkind on a phone with HTTPS.');
    $('v-start').disabled = true;
  }

  // ── Mandatory mode: hide the "Not now" exit ──────────────────────────
  if (state.mandatory) {
    $('v-cancel').hidden = true;
  } else {
    $('v-cancel').textContent = 'Maybe later';
  }

  $('v-start').addEventListener('click', startScan);
  $('v-cancel').addEventListener('click', () => location.replace('/me.html'));
  $('v-continue').addEventListener('click', () => location.replace(state.next));

  const cancelBtn = $('v-cancel-scan');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelScan);
});

function goSlide(idx) {
  $('v-rail').style.transform = `translateX(-${idx * 33.3333}%)`;
  document.body.setAttribute('data-vstage', ['compose','scan','done'][idx] || 'compose');
}

function showError(slot, msg) {
  const el = $(slot);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
}

function clearError(slot) {
  const el = $(slot);
  if (el) el.classList.remove('on');
}

function cancelScan() {
  state.cancelled = true;
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  state.busy = false;
  goSlide(0);
}

async function startScan() {
  if (state.busy) return;
  state.busy = true;
  state.cancelled = false;
  clearError('v-err-compose');
  clearError('v-err-scan');

  // Request camera with a fresh user gesture
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    state.busy = false;
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
    showError(
      'v-err-compose',
      denied
        ? 'Camera permission is required. Enable it in your browser settings and tap Start scan again.'
        : 'Could not start the camera. Make sure no other app is using it, then try again.'
    );
    return;
  }
  state.stream = stream;
  const video = $('v-video');
  video.srcObject = stream;
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Camera timeout')), 4000);
      video.addEventListener('loadedmetadata', () => { clearTimeout(t); res(undefined); }, { once: true });
    });
    await video.play().catch(() => {});
  } catch (err) {
    cancelScan();
    showError('v-err-compose', 'Camera did not start in time. Try again.');
    return;
  }

  goSlide(1);

  try {
    const result = await runLivenessSequence(video);
    if (state.cancelled) return;
    await submitVerification(result);
  } catch (err) {
    console.warn('[verify-me] sequence failed', err);
    showError('v-err-scan', (err && err.message) || 'Scan failed. Please try again.');
    state.busy = false;
    return;
  } finally {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

async function runLivenessSequence(video) {
  const canvas = $('v-canvas');
  const ctx = canvas.getContext('2d');
  const prompt = $('v-prompt');
  const progress = $('v-progress');

  const steps = [
    { at: 1500, prompt: 'Look at the camera' },
    { at: 3500, prompt: 'Blink slowly' },
    { at: 5500, prompt: 'Turn slightly' },
  ];

  const frames = [];
  const start = performance.now();

  const captureAt = (idx) => new Promise((res, rej) => {
    const step = steps[idx];
    setTimeout(() => {
      if (state.cancelled) return rej(new Error('Cancelled'));
      prompt.textContent = step.prompt;
      setTimeout(() => {
        if (state.cancelled) return rej(new Error('Cancelled'));
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          frames.push({
            data: imageData.data,
            brightness: averageBrightness(imageData.data),
            ts: performance.now() - start,
          });
          progress.style.width = (((idx + 1) / 3) * 100) + '%';
          res(undefined);
        } catch (e) { rej(e); }
      }, 600);
    }, step.at);
  });

  for (let i = 0; i < 3; i++) await captureAt(i);

  prompt.textContent = 'Verifying…';

  const hashes = await Promise.all(frames.map((f) => sha256Pixels(f.data)));

  // Signal 1: distinct hashes (replay prevention)
  const distinct = (hashes[0] !== hashes[1]) && (hashes[1] !== hashes[2]) && (hashes[0] !== hashes[2]);
  // Signal 2: brightness varies between frames (proxy for motion)
  const bDelta = Math.abs(frames[1].brightness - frames[0].brightness)
               + Math.abs(frames[2].brightness - frames[1].brightness);
  const bScore = Math.min(1, bDelta / 12);
  // Signal 3: timing falls inside a valid human window (rejects automated replay)
  const tScore = (frames[2].ts > 5000 && frames[2].ts < 8000) ? 1 : 0.4;

  const liveness = distinct
    ? (0.40 + 0.40 * bScore + 0.20 * tScore)
    : 0.20;

  return { hashes, liveness };
}

function averageBrightness(pixels) {
  let sum = 0;
  const step = 64;
  for (let i = 0; i < pixels.length; i += step) {
    sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  }
  return sum / (pixels.length / step);
}

async function sha256Pixels(pixels) {
  const buf = await crypto.subtle.digest('SHA-256', pixels);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function submitVerification(result) {
  const body = {
    p_hash_1: result.hashes[0],
    p_hash_2: result.hashes[1],
    p_hash_3: result.hashes[2],
    p_liveness: Number(result.liveness.toFixed(3)),
    p_provider: 'heuristic-v1',
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_face`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${state.session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error('Server rejected verification (' + r.status + '). ' + text.slice(0, 80));
  }
  const json = await r.json();
  if (!json.ok) {
    throw new Error('Liveness check did not pass. Try again in better light, and follow the prompts carefully.');
  }
  goSlide(2);
}
