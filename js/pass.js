/**
 * /js/pass.js — drives /pass.html
 *
 * Two responsibilities, one file:
 *
 *   §1 · PIN gate for the ID
 *        - 4-digit demo PIN (1234) — wired to a per-session demo to allow
 *          persona testing without back-end pin storage. Replace with the
 *          real PIN check when /sql/pins.sql is applied.
 *        - On correct PIN: hides .pin-gate, reveals #id-stack with the
 *          two-page slider (Contact ↔ Crypto Matrix).
 *        - On wrong PIN: shakes the gate, flashes error dots, resets.
 *
 *   §2 · Hydrates the ID + the three wallet passes with the bearer's data
 *        - Fetches /rest/v1/profiles?id=eq.<userId> via the session token.
 *        - If no session, redirects to /auth.html.
 *        - Fields filled: surname, given_name, dob, sex, nationality,
 *          issued_at, expires_at, wkid, mrz, sha256 (computed in-browser),
 *          validity remaining, avatar.
 *
 * No third-party JS. Helvetica Neue + Courier New only (typography is in
 * the HTML/CSS). Reduced-motion respected by CSS.
 */

// @ts-check

import { getSession, signOut } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const DEMO_PIN = '1234';

/* ─── state ─── */
const state = {
  pin: '',
  page: 0,            // 0 = Contact, 1 = Crypto Matrix
  unlocked: false,
  profile: null,
};

/* ─── DOM refs ─── */
const $ = (id) => document.getElementById(id);
const refs = {};

document.addEventListener('DOMContentLoaded', async () => {
  refs.gate     = $('pin-gate');
  refs.dots     = $('pin-dots');
  refs.pad      = $('pin-pad');
  refs.stack    = $('id-stack');
  refs.track    = $('id-track');
  refs.prev     = $('id-prev');
  refs.next     = $('id-next');
  refs.lock     = $('id-lock');
  refs.trail    = $('pass-trail');

  /* require session */
  const session = getSession();
  if (!session) {
    location.replace('/auth.html?next=/pass.html');
    return;
  }

  /* hydrate from profile (or fall back to demo data) */
  try {
    await loadProfile(session);
  } catch (err) {
    console.warn('[pass] profile load failed, using demo data:', err);
    applyProfile({
      given_name: 'YEHOSUA',
      surname: 'CHRIST',
      trail_name: 'Yehosua',
      wkid: 'C4X8R2M7',
      dob: '1992-01-01',
      sex: 'M',
      nationality: 'AT',
      issued_at: '2026-01-01',
      expires_at: '2031-01-01',
    });
  }

  /* PIN keypad */
  refs.pad.addEventListener('click', onPadTap);
  document.addEventListener('keydown', onKeyDown);

  /* slider nav */
  refs.prev.addEventListener('click', () => goPage(0));
  refs.next.addEventListener('click', () => goPage(1));

  /* lock button */
  refs.lock.addEventListener('click', lockId);

  /* swipe support */
  let startX = 0, startY = 0, swiping = false;
  refs.track.addEventListener('touchstart', (e) => {
    if (!state.unlocked) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });
  refs.track.addEventListener('touchend', (e) => {
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
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
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

  /* MRZ — ICAO 9303-ish, two lines */
  const wkid = (p.wkid || 'C4X8R2M7').toUpperCase();
  const sur  = (p.surname || 'CHRIST').toUpperCase().replace(/\W+/g, '');
  const giv  = (p.given_name || 'YEHOSUA').toUpperCase().replace(/\W+/g, '');
  const filler = '<'.repeat(Math.max(0, 30 - sur.length - giv.length - 2));
  $('id-mrz-line-1').textContent =
    `PWWND${sur}<<${giv}${filler}`.slice(0, 44);
  const dob  = ymd(p.dob);
  const exp  = ymd(p.expires_at) || ymd(addYears(p.issued_at || p.created_at, 5));
  $('id-mrz-line-2').textContent =
    `${wkid}<9${(p.nationality || 'AUT').toUpperCase().padEnd(3, 'A')}${dob}${(p.sex || 'M').toUpperCase()}${exp}<<<<<<<<<<<3`;

  /* trail name in head */
  if (refs.trail) refs.trail.textContent = '· ' + (p.trail_name || p.given_name || '');

  /* avatar in portrait if present */
  if (p.avatar_url) {
    const img = $('id-portrait-img');
    if (img) {
      img.src = p.avatar_url;
      img.hidden = false;
    }
  }

  /* wallet name + dates */
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

  /* §2 · Crypto Matrix — computed in-browser */
  hydrateMatrix(p, wkid);
}

async function hydrateMatrix(p, wkid) {
  /* SHA-256 over the bearer record (deterministic prefix) */
  try {
    const enc = new TextEncoder().encode(
      `WND|${wkid}|${(p.surname||'').toUpperCase()}|${(p.given_name||'').toUpperCase()}|${ymd(p.dob)}|${ymd(p.issued_at||p.created_at)}`
    );
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
    const cell = $('id-sha');
    if (cell) cell.innerHTML = hex.match(/.{1,16}/g).slice(0, 3).join('<br/>');
  } catch (_) { /* crypto unavailable */ }

  /* Now (local) + location placeholder */
  const now = new Date();
  $('id-now-time').textContent = now.toTimeString().slice(0, 5) + ' ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('id-now-loc').textContent  = p.last_location_label || '—';

  /* Validity */
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

/* ─── PIN ─── */
function onPadTap(e) {
  const k = e.target.closest('.pin-key');
  if (!k) return;
  const d = k.dataset.d;
  if (d === 'del') { setPin(state.pin.slice(0, -1)); return; }
  if (!/^\d$/.test(d)) return;
  if (state.pin.length >= 4) return;
  setPin(state.pin + d);
  if (state.pin.length === 4) verifyPin();
}

function onKeyDown(e) {
  if (state.unlocked) return;
  if (e.key >= '0' && e.key <= '9') {
    if (state.pin.length < 4) {
      setPin(state.pin + e.key);
      if (state.pin.length === 4) verifyPin();
    }
  } else if (e.key === 'Backspace') {
    setPin(state.pin.slice(0, -1));
  }
}

function setPin(v) {
  state.pin = v;
  const dots = refs.dots.querySelectorAll('.pin-dot');
  dots.forEach((d, i) => {
    d.classList.toggle('on', i < v.length);
    d.classList.remove('err');
  });
}

function verifyPin() {
  /* For persona testing: accept the demo PIN. Replace with a real
     server-side check (or a hashed local check) once /sql/pins.sql lands. */
  if (state.pin === DEMO_PIN) {
    unlockId();
  } else {
    failPin();
  }
}

function failPin() {
  const dots = refs.dots.querySelectorAll('.pin-dot');
  dots.forEach(d => d.classList.add('err'));
  refs.gate.classList.add('shake');
  setTimeout(() => {
    refs.gate.classList.remove('shake');
    setPin('');
  }, 480);
}

function unlockId() {
  state.unlocked = true;
  refs.gate.style.display = 'none';
  refs.stack.classList.add('unlocked');
  refs.stack.setAttribute('aria-hidden', 'false');
  goPage(0);
}

function lockId() {
  state.unlocked = false;
  state.pin = '';
  refs.stack.classList.remove('unlocked');
  refs.stack.setAttribute('aria-hidden', 'true');
  refs.gate.style.display = '';
  setPin('');
}

function goPage(p) {
  state.page = p;
  refs.track.style.transform = `translateX(${p === 0 ? 0 : '-100%'})`;
  refs.prev.disabled = p === 0;
  refs.next.disabled = p === 1;
  document.querySelectorAll('.id-dot').forEach((d, i) => {
    d.classList.toggle('on', i === p);
    d.setAttribute('aria-selected', i === p ? 'true' : 'false');
  });
}

/* ─── helpers ─── */
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
