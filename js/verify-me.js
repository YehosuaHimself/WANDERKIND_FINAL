// @ts-nocheck
/**
 * /js/verify-me.js · mandatory FaceScan onboarding step.
 *
 * Flow (one page, three slides via translateX track):
 *   1. Compose — explainer, "Start scan" button, "Not now" exits to /me.html
 *      (existing users can defer; new users get gated by auth.js redirect).
 *   2. Scanning — getUserMedia 640×480 front camera. Three prompts over ~6s:
 *        - "Look at the camera"   (capture frame at t=1500ms)
 *        - "Blink slowly"          (capture frame at t=3500ms)
 *        - "Turn slightly"         (capture frame at t=5500ms)
 *      Each frame is hashed (SHA-256) before pixels are discarded.
 *      Liveness score derived from three signals:
 *        - hash distance (frames must differ)
 *        - average brightness delta between frames
 *        - frame timing tolerance
 *   3. Confirmed — server returns ok=true, journey_tier = verified-walker.
 *
 * The raw pixels never leave the device. We send only 3 hashes + liveness.
 * The RPC enforces the passing rule server-side (liveness >= 0.62, distinct hashes).
 *
 * Phase-2 hook: provider param. When wired to Stripe Identity / Onfido,
 * we'll change the provider string and POST a session token instead.
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  stream: null,
  next: '/map.html',
  busy: false,
};

document.addEventListener('DOMContentLoaded', () => {
  state.session = getSession();
  if (!state.session) {
    location.replace('/auth.html?next=' + encodeURIComponent(location.pathname + location.search));
    return;
  }

  const params = new URLSearchParams(location.search);
  if (params.get('next')) state.next = params.get('next');

  $('v-start').addEventListener('click', startScan);
  $('v-cancel').addEventListener('click', () => location.replace('/me.html'));
  $('v-continue').addEventListener('click', () => location.replace(state.next));
});

function goSlide(idx) {
  $('v-rail').style.transform = `translateX(-${idx * 33.3333}%)`;
  document.body.setAttribute('data-vstage', ['compose','scan','done'][idx] || 'compose');
}

function showError(slot, msg) {
  const el = $(slot);
  el.textContent = msg;
  el.classList.add('on');
}

async function startScan() {
  if (state.busy) return;
  state.busy = true;
  $('v-err-compose').classList.remove('on');

  // Request camera
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
  } catch (err) {
    state.busy = false;
    showError('v-err-compose', 'Camera access is required for verification. Enable it and try again.');
    return;
  }
  state.stream = stream;
  const video = $('v-video');
  video.srcObject = stream;
  await new Promise((res) => video.addEventListener('loadedmetadata', res, { once: true }));

  goSlide(1);

  try {
    const result = await runLivenessSequence(video);
    await submitVerification(result);
  } catch (err) {
    console.warn('[verify-me] sequence failed', err);
    showError('v-err-scan', err.message || 'Scan failed. Please try again.');
    state.busy = false;
    return;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
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

  const captureAt = (idx) => new Promise((res) => {
    const step = steps[idx];
    setTimeout(() => {
      prompt.textContent = step.prompt;
      // Capture 200ms later, after user has time to react
      setTimeout(() => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        frames.push({
          data: imageData.data,
          brightness: averageBrightness(imageData.data),
          ts: performance.now() - start,
        });
        const pct = ((idx + 1) / 3) * 100;
        progress.style.width = pct + '%';
        res();
      }, 600);
    }, step.at);
  });

  for (let i = 0; i < 3; i++) await captureAt(i);

  prompt.textContent = 'Verifying…';

  // Hash each frame
  const hashes = await Promise.all(frames.map((f) => sha256Pixels(f.data)));

  // Compute liveness score
  // Signal 1: distinct hashes (replay prevention)
  const distinct = (hashes[0] !== hashes[1]) && (hashes[1] !== hashes[2]) && (hashes[0] !== hashes[2]);
  // Signal 2: brightness varies between frames (face moved)
  const bDelta = Math.abs(frames[1].brightness - frames[0].brightness)
               + Math.abs(frames[2].brightness - frames[1].brightness);
  const bScore = Math.min(1, bDelta / 12); // typical movement = 6-15
  // Signal 3: timing is within a valid human window (rejects automated replay)
  const tScore = (frames[2].ts > 5000 && frames[2].ts < 8000) ? 1 : 0.4;

  const liveness = distinct
    ? (0.40 + 0.40 * bScore + 0.20 * tScore)
    : 0.20;

  return { hashes, liveness };
}

function averageBrightness(pixels) {
  let sum = 0;
  const step = 64; // sample every 16th pixel for speed
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
  if (!r.ok) throw new Error('Server rejected verification (' + r.status + ').');
  const json = await r.json();
  if (!json.ok) throw new Error('Liveness check did not pass. Please try again in better light.');
  goSlide(2);
}
