// @ts-nocheck
/**
 * /js/pass.js — drives /pass.html
 *
 * Two responsibilities, one file:
 *
 *   §1 · PIN gate for the ID
 *        - User-settable 4-digit PIN, hashed client-side via PBKDF2-SHA256
 *          (100k iterations, 32-byte output). Salt = user.id.
 *        - Hash cached locally in IndexedDB (wk-pin-v1) for fast offline
 *          unlock and mirrored to profiles.pin_hash for cross-device.
 *        - If no PIN set yet, demo PIN 1234 still works AND the user is
 *          prompted to set one immediately after first unlock.
 *        - "Set / change your PIN" flow: enter current → enter new → confirm.
 *        - On correct PIN: hides .pin-gate, reveals #id-stack with the
 *          two-page slider (Contact ↔ Crypto Matrix).
 *
 *   §2 · Hydrates the ID + the three wallet passes with the bearer's data
 *        - Fetches /rest/v1/profiles?id=eq.<userId> via the session token.
 *        - If no session, redirects to /auth.html.
 *
 * No third-party JS. Helvetica Neue + Courier New only.
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const DEMO_PIN  = '1234';
const PIN_DB    = 'wk-pin-v1';
const PIN_STORE = 'pin';

/* Auto-lock the ID after this much idle. Resets on any input. */
const IDLE_LOCK_MS = 5 * 60 * 1000;

/* ─── state ─── */
const state = {
  pin: '',
  page: 0,
  unlocked: false,
  profile: null,
  session: null,
  pinHash: null,            // current stored hash or null if unset
  setPinStep: null,         // null | 'current' | 'new' | 'confirm'
  setPinBuffer: '',         // typed digits in the set-PIN flow
  setPinNew: '',            // confirmed new PIN once entered
};

/* ─── DOM refs ─── */
const $ = (id) => document.getElementById(id);
const refs = {};

document.addEventListener('DOMContentLoaded', async () => {
  refs.gate     = $('pin-gate');
  refs.dots     = $('pin-dots');
  refs.pad      = $('pin-pad');
  refs.hint     = $('pin-hint');
  refs.label    = $('pin-label-text');
  refs.setLink  = $('pin-set-link');
  refs.setPanel = $('pin-set-panel');
  refs.setMsg   = $('pin-set-msg');
  refs.setCancel = $('pin-set-cancel');
  refs.stack    = $('id-stack');
  refs.track    = $('id-track');
  refs.lock     = $('id-lock');
  refs.trail    = $('pass-trail');

  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/pass.html'); return; }
  state.session = session;

  /* hydrate profile (or demo fallback) */
  try { await loadProfile(session); }
  catch (err) {
    console.warn('[pass] profile load failed, using demo:', err);
    applyProfile({
      given_name: 'YEHOSUA', surname: 'CHRIST', trail_name: 'Yehosua',
      wkid: 'C4X8R2M7', dob: '1992-01-01', sex: 'M', nationality: 'AT',
      issued_at: '2026-01-01', expires_at: '2031-01-01',
    });
  }

  /* load the PIN hash (local first, then profile) */
  await loadPinHash(session);
  refreshPinHint();

  /* PIN/ID listeners only mount if those elements exist (page-aware). */
  if (refs.pad) {
    refs.pad.addEventListener('click', onPadTap);
    document.addEventListener('keydown', onKeyDown);
  }
  if (refs.lock) refs.lock.addEventListener('click', lockId);

  /* Tap a dot to jump to that page */
  document.querySelectorAll('.id-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const p = parseInt(dot.getAttribute('data-p'), 10);
      if (!isNaN(p) && state.unlocked) goPage(p);
    });
  });


  if (refs.changePin) refs.changePin.addEventListener('click', () => {
    /* Lock first to gate the change behind PIN verification, then open the flow */
    lockId();
    startSetPin();
  });

  refs.setLink?.addEventListener('click', () => startSetPin());
  refs.setCancel?.addEventListener('click', () => cancelSetPin());

  /* swipe */
  let startX = 0, startY = 0, swiping = false;
  refs.track && refs.track.addEventListener('touchstart', (e) => {
    if (!state.unlocked) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = true;
  }, { passive: true });
  refs.track && refs.track.addEventListener('touchend', (e) => {
    if (!swiping) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && state.page === 0) goPage(1);
      else if (dx > 0 && state.page === 1) goPage(0);
    }
    swiping = false;
  }, { passive: true });
});

/* ─── Profile load ──────────────────────────────────────────── */
async function loadProfile(session) {
  const userId = session.user?.id;
  if (!userId) throw new Error('no user id in session');
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  if (!resp.ok) throw new Error(`profile fetch ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no profile row');
  applyProfile(rows[0]);
}

function applyProfile(p) {
  state.profile = p;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v ?? '—'; };
  set('id-surname',  (p.surname || p.given_name?.split(' ').pop() || '—').toUpperCase());
  set('id-given',    (p.given_name || '—').toUpperCase());
  set('id-dob',      fmtDate(p.dob) || '—');
  set('id-sex',      (p.sex || '—').toUpperCase());
  set('id-code',     'WND');
  set('id-nat',      (p.nationality || '—').toUpperCase());
  set('id-issued',   fmtDate(p.issued_at || p.created_at) || '—');
  set('id-expires',  fmtDate(p.expires_at) || addYears(p.issued_at || p.created_at, 5) || '—');

  const wkid = (p.wkid || 'C4X8R2M7').toUpperCase();
  const sur  = (p.surname || 'CHRIST').toUpperCase().replace(/\W+/g, '');
  const giv  = (p.given_name || 'YEHOSUA').toUpperCase().replace(/\W+/g, '');
  const filler = '<'.repeat(Math.max(0, 30 - sur.length - giv.length - 2));
  $('id-mrz-line-1').textContent = `PWWND${sur}<<${giv}${filler}`.slice(0, 44);
  const dob  = ymd(p.dob);
  const exp  = ymd(p.expires_at) || ymd(addYears(p.issued_at || p.created_at, 5));
  $('id-mrz-line-2').textContent =
    `${wkid}<9${(p.nationality || 'AUT').toUpperCase().padEnd(3, 'A')}${dob}${(p.sex || 'M').toUpperCase()}${exp}<<<<<<<<<<<3`;

  if (refs.trail) refs.trail.textContent = '· ' + (p.trail_name || p.given_name || '');

  if (p.avatar_url) {
    const img = $('id-portrait-img');
    if (img) { img.src = p.avatar_url; img.hidden = false; }
  }

  document.querySelectorAll('[data-name]').forEach((el) => {
    el.innerHTML = `${(p.given_name || 'YEHOSUA').toUpperCase()} <em>·</em> ${(p.surname || 'CHRIST').toUpperCase()}`;
  });
  document.querySelectorAll('[data-pass-no]').forEach((el) => { el.textContent = wkid; });
  document.querySelectorAll('[data-issued]').forEach((el) => {
    el.textContent = fmtShortDate(p.issued_at || p.created_at) || '—';
  });
  document.querySelectorAll('[data-expires]').forEach((el) => {
    el.textContent = fmtShortDate(p.expires_at) || fmtShortDate(addYears(p.issued_at || p.created_at, 5)) || '—';
  });

  hydrateMatrix(p, wkid);
}

async function hydrateMatrix(p, wkid) {
  try {
    const enc = new TextEncoder().encode(
      `WND|${wkid}|${(p.surname||'').toUpperCase()}|${(p.given_name||'').toUpperCase()}|${ymd(p.dob)}|${ymd(p.issued_at||p.created_at)}`
    );
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
    const cell = $('id-sha');
    if (cell) cell.innerHTML = hex.match(/.{1,16}/g).slice(0, 3).join('<br/>');
  } catch (_) {}

  const now = new Date();
  $('id-now-time').textContent = now.toTimeString().slice(0, 5) + ' ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('id-now-loc').textContent  = p.last_location_label || '—';

  const issued = new Date(p.issued_at || p.created_at || Date.now());
  const expires = new Date(p.expires_at || addYears(p.issued_at || p.created_at, 5));
  const totalMs = expires - issued;
  const remaining = Math.max(0, expires - Date.now());
  const ratio = totalMs > 0 ? remaining / totalMs : 0;
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const years = Math.floor(days / 365);
  const months = Math.floor((days - years * 365) / 30);
  const remDays = days - years * 365 - months * 30;
  $('id-validity').textContent = `${years}Y ${months}M ${remDays}D`;
  $('id-validity-pct').textContent = `${(ratio * 100).toFixed(1)}% remaining`;
  $('id-doc-meta').textContent = `PW · ${wkid}`;
}

/* ─── PIN hashing ──────────────────────────────────────────── */
async function hashPin(pin, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  // base64
  let s = ''; for (const b of new Uint8Array(bits)) s += String.fromCharCode(b);
  return btoa(s);
}

async function loadPinHash(session) {
  // Local IndexedDB first
  try {
    const db = await openPinDB();
    const cached = await idbGet(db, session.user.id);
    if (cached) { state.pinHash = cached; return; }
  } catch (_) {}

  // Then profile.pin_hash
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=pin_hash`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) {
      const rows = await resp.json();
      const h = rows?.[0]?.pin_hash;
      if (h) {
        state.pinHash = h;
        try { const db = await openPinDB(); await idbPut(db, session.user.id, h); } catch (_) {}
      }
    }
  } catch (_) {}
}

async function savePinHash(session, hash) {
  state.pinHash = hash;
  try { const db = await openPinDB(); await idbPut(db, session.user.id, hash); } catch (_) {}
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ pin_hash: hash, pin_updated_at: new Date().toISOString() }),
    });
  } catch (_) {}
}

/* ─── PIN entry / verification ─────────────────────────────── */
function onPadTap(e) {
  const k = e.target.closest('.pin-key'); if (!k) return;
  if (navigator.vibrate) navigator.vibrate(10);
  const d = k.dataset.d;
  if (state.setPinStep) return handleSetPinDigit(d);

  if (d === 'del') { setPin(state.pin.slice(0, -1)); return; }
  if (!/^\d$/.test(d)) return;
  if (state.pin.length >= 4) return;
  setPin(state.pin + d);
  if (state.pin.length === 4) verifyPin();
}

function onKeyDown(e) {
  if (state.unlocked) return;
  if (e.key >= '0' && e.key <= '9') {
    if (state.setPinStep) return handleSetPinDigit(e.key);
    if (state.pin.length < 4) {
      setPin(state.pin + e.key);
      if (state.pin.length === 4) verifyPin();
    }
  } else if (e.key === 'Backspace') {
    if (state.setPinStep) {
      state.setPinBuffer = state.setPinBuffer.slice(0, -1);
      renderSetPinDots();
    } else {
      setPin(state.pin.slice(0, -1));
    }
  }
}

function setPin(v) {
  state.pin = v;
  refs.dots.querySelectorAll('.pin-dot').forEach((d, i) => {
    d.classList.toggle('on', i < v.length);
    d.classList.remove('err');
  });
}

async function verifyPin() {
  let ok = false;
  if (state.pinHash) {
    const h = await hashPin(state.pin, state.session.user.id);
    ok = (h === state.pinHash);
  } else {
    /* No PIN set — accept demo PIN 1234 */
    ok = (state.pin === DEMO_PIN);
  }
  if (ok) unlockId();
  else failPin();
}

function failPin() {
  refs.dots.querySelectorAll('.pin-dot').forEach(d => d.classList.add('err'));
  refs.gate.classList.add('shake');
  setTimeout(() => { refs.gate.classList.remove('shake'); setPin(''); }, 480);
}

function unlockId() {
  state.unlocked = true;
  bumpIdle();
  refs.gate.style.display = 'none';
  refs.stack.classList.add('unlocked');
  refs.stack.setAttribute('aria-hidden', 'false');
  goPage(0);
}

function lockId() {
  state.unlocked = false; state.pin = '';
  refs.stack.classList.remove('unlocked');
  refs.stack.setAttribute('aria-hidden', 'true');
  refs.gate.style.display = '';
  setPin('');
}

function goPage(p) {
  state.page = p;
  refs.track.style.transform = `translateX(${p === 0 ? 0 : '-100%'})`;
  if (refs.prev) refs.prev.disabled = p === 0;
  if (refs.next) refs.next.disabled = p === 1;
  document.querySelectorAll('.id-dot').forEach((d, i) => {
    d.classList.toggle('on', i === p);
    d.setAttribute('aria-selected', i === p ? 'true' : 'false');
  });
}

/* ─── Set / change PIN ─────────────────────────────────────── */
function startSetPin() {
  state.setPinStep = state.pinHash ? 'current' : 'new';
  state.setPinBuffer = '';
  state.setPinNew = '';
  refs.setPanel.hidden = false;
  refs.setLink.hidden = true;
  setPin('');
  updateSetPinUI();
}

function cancelSetPin() {
  state.setPinStep = null;
  state.setPinBuffer = '';
  state.setPinNew = '';
  refs.setPanel.hidden = true;
  refs.setLink.hidden = false;
  refs.label.textContent = 'Enter your four digits';
  refs.setMsg.textContent = '';
  setPin('');
}

async function handleSetPinDigit(d) {
  if (d === 'del') { state.setPinBuffer = state.setPinBuffer.slice(0, -1); renderSetPinDots(); return; }
  if (!/^\d$/.test(d)) return;
  if (state.setPinBuffer.length >= 4) return;
  state.setPinBuffer += d;
  renderSetPinDots();
  if (state.setPinBuffer.length === 4) await advanceSetPin();
}

function renderSetPinDots() {
  refs.dots.querySelectorAll('.pin-dot').forEach((d, i) => {
    d.classList.toggle('on', i < state.setPinBuffer.length);
    d.classList.remove('err');
  });
}

async function advanceSetPin() {
  const entry = state.setPinBuffer;
  state.setPinBuffer = '';
  if (state.setPinStep === 'current') {
    const ok = state.pinHash
      ? (await hashPin(entry, state.session.user.id)) === state.pinHash
      : entry === DEMO_PIN;
    if (!ok) {
      refs.dots.querySelectorAll('.pin-dot').forEach(d => d.classList.add('err'));
      refs.gate.classList.add('shake');
      setTimeout(() => { refs.gate.classList.remove('shake'); renderSetPinDots(); }, 480);
      refs.setMsg.textContent = 'Wrong current PIN — try again.';
      return;
    }
    state.setPinStep = 'new';
  } else if (state.setPinStep === 'new') {
    state.setPinNew = entry;
    state.setPinStep = 'confirm';
  } else if (state.setPinStep === 'confirm') {
    if (entry !== state.setPinNew) {
      refs.setMsg.textContent = 'Did not match — start again.';
      state.setPinStep = 'new';
      state.setPinNew = '';
      renderSetPinDots();
      updateSetPinUI();
      return;
    }
    const hash = await hashPin(entry, state.session.user.id);
    await savePinHash(state.session, hash);
    refs.setMsg.textContent = '✓ PIN saved.';
    setTimeout(() => cancelSetPin(), 1200);
    return;
  }
  renderSetPinDots();
  updateSetPinUI();
}

function updateSetPinUI() {
  if (state.setPinStep === 'current') {
    refs.label.textContent = 'Enter your current PIN';
    refs.setMsg.textContent = '';
  } else if (state.setPinStep === 'new') {
    refs.label.textContent = 'Enter a new PIN';
    refs.setMsg.textContent = '4 digits — anything memorable.';
  } else if (state.setPinStep === 'confirm') {
    refs.label.textContent = 'Confirm the new PIN';
    refs.setMsg.textContent = 'One more time.';
  }
}

function refreshPinHint() {
  if (refs.hint) {
    refs.hint.textContent = state.pinHash ? 'Your PIN · 4 digits' : 'Demo PIN · 1234 · then set your own';
  }
}

/* ─── helpers ─── */


/* ─── Idle lock — keeps the bearer in control of their document ─── */
let idleTimer = null;
function bumpIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!state.unlocked) return;
  idleTimer = setTimeout(() => {
    if (state.unlocked) lockId();
  }, IDLE_LOCK_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.unlocked) lockId();
});

['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(evt => {
  document.addEventListener(evt, bumpIdle, { passive: true, capture: true });
});

function ymd(d) {
  if (!d) return '000000';
  const dt = new Date(d);
  return [dt.getFullYear() % 100, dt.getMonth() + 1, dt.getDate()]
    .map(n => String(n).padStart(2, '0')).join('');
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return [dt.getDate(), dt.getMonth() + 1, dt.getFullYear()]
    .map((n, i) => String(n).padStart(i === 2 ? 4 : 2, '0')).join('.');
}
function fmtShortDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return [dt.getDate(), dt.getMonth() + 1, dt.getFullYear()]
    .map((n, i) => String(n).padStart(i === 2 ? 4 : 2, '0')).join('.');
}
function addYears(d, n) {
  if (!d) return null;
  const dt = new Date(d);
  dt.setFullYear(dt.getFullYear() + n);
  return dt.toISOString();
}

/* IndexedDB for PIN hash */
function openPinDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(PIN_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PIN_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbGet(db, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(PIN_STORE, 'readonly');
    const r = tx.objectStore(PIN_STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbPut(db, key, value) {
  return new Promise((res, rej) => {
    const tx = db.transaction(PIN_STORE, 'readwrite');
    const r = tx.objectStore(PIN_STORE).put(value, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
