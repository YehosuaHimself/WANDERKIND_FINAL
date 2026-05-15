/**
 * /js/hosts.js — drives /hosts.html
 *
 * Magic Open · host-side
 *   - Loads paired-lock state for the current host
 *   - Renders the active guest code (4 digits, rotating per stay)
 *   - "Share" copies the code to clipboard (and offers Web Share)
 *   - "Extend · Revoke" lets the host adjust the validity window
 *
 * Code generation: HMAC-SHA256(host_secret + stay_id + window_index) mod 10000,
 * computed in-browser using Web Crypto. Until the host pairs a real lock, the
 * card shows a demo code (4827) so personas can test the surface end-to-end.
 */

// @ts-check

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/hosts.html'); return; }

  const refs = {
    digits: document.getElementById('code-digits'),
    live:   document.getElementById('code-live'),
    window: document.getElementById('code-window'),
    lockMeta: document.getElementById('lock-meta'),
    lockStatus: document.getElementById('lock-status'),
    guestName: document.getElementById('guest-name'),
    guestMeta: document.getElementById('guest-meta'),
    shareBtn: document.getElementById('share-btn'),
    manageBtn: document.getElementById('manage-btn'),
  };

  let state = { code: '4827', stay: null, lock: null };

  try { state = await loadLiveState(session); }
  catch (err) { console.warn('[hosts] live state unavailable, using demo', err); }

  applyState(refs, state);

  // Tick the live countdown
  startTicker(refs);

  refs.shareBtn.addEventListener('click', async () => {
    const text = `Wanderkind · door code · ${state.code} · valid ${state.window?.label || 'today'}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Door code', text }); return; }
      catch (_) {}
    }
    try {
      await navigator.clipboard.writeText(text);
      refs.shareBtn.textContent = 'Copied ✓';
      setTimeout(() => { refs.shareBtn.textContent = 'Share code with guest'; }, 1400);
    } catch (_) {}
  });

  refs.manageBtn.addEventListener('click', () => {
    // For now, regenerate a new code locally (demonstrative)
    state.code = String(Math.floor(1000 + Math.random() * 9000));
    applyState(refs, state);
  });
});

async function loadLiveState(session) {
  // Lock
  const lockResp = await fetch(
    `${SUPABASE_URL}/rest/v1/host_locks?host_id=eq.${session.user.id}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const lock = lockResp.ok ? (await lockResp.json())[0] : null;

  // Most recent active stay
  const stayResp = await fetch(
    `${SUPABASE_URL}/rest/v1/stays?host_id=eq.${session.user.id}&status=eq.active&order=arrives_at.asc&limit=1&select=*,guest:profiles(trail_name,given_name,surname,wkid)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const stay = stayResp.ok ? (await stayResp.json())[0] : null;

  let code = '4827';
  if (lock && stay) {
    code = await deriveCode(lock.secret, stay.id);
  }
  return { code, lock, stay };
}

async function deriveCode(secret, stayId) {
  const windowIdx = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const keyBuf = new TextEncoder().encode(secret);
  const msgBuf = new TextEncoder().encode(`${stayId}|${windowIdx}`);
  const key = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, msgBuf);
  const u8 = new Uint8Array(sig);
  const n = ((u8[0] << 24) | (u8[1] << 16) | (u8[2] << 8) | u8[3]) >>> 0;
  return String(n % 10000).padStart(4, '0');
}

function applyState(refs, state) {
  // Render digits
  refs.digits.innerHTML = '';
  for (const d of state.code) {
    const cell = document.createElement('div');
    cell.className = 'code-digit';
    cell.textContent = d;
    refs.digits.appendChild(cell);
  }

  // Lock + guest pills
  if (state.lock) {
    refs.lockMeta.textContent = `${state.lock.brand || 'Smart lock'} · ${state.lock.label || 'paired'}`;
    refs.lockStatus.textContent = 'Paired';
    refs.lockStatus.style.color = 'var(--wk-amber-text)';
  } else {
    refs.lockMeta.textContent = 'Tap to pair a smart lock';
    refs.lockStatus.textContent = 'Not paired';
  }

  if (state.stay?.guest) {
    const g = state.stay.guest;
    refs.guestName.textContent = g.trail_name || `${g.given_name || ''} ${g.surname || ''}`.trim() || 'Guest';
    refs.guestMeta.textContent = `${g.wkid || 'WND'} · accepted`;
  }
}

function startTicker(refs) {
  let secs = 600;
  const tick = () => {
    if (secs <= 0) return;
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    refs.live.innerHTML = `Live<br/>${m}:${s}`;
    secs -= 1;
  };
  tick();
  setInterval(tick, 1000);
}
