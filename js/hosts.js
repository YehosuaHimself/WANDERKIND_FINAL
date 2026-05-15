// @ts-nocheck
/**
 * /js/hosts.js — drives /hosts.html
 *
 * Two sections, one file:
 *   §A · Incoming knocks (EPIC 04 slice 1)
 *        - Reads pending knocks where host_id = me
 *        - Renders one card per knock with the walker's name, WKID, Accept / Decline
 *
 *   §B · Magic Open (existing)
 *        - Loads paired-lock state for the current host
 *        - Renders the active guest code (HMAC-derived, rotating per stay)
 *        - "Share" copies the code to clipboard (and offers Web Share)
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/hosts.html'); return; }

  await renderKnocks(session);
  await renderMagicOpen(session);
});

/* ─── §A · Incoming knocks ─────────────────────────────────── */
async function renderKnocks(session) {
  const container = document.getElementById('knocks-list');
  if (!container) return;

  let knocks = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/knocks?host_id=eq.${session.user.id}&status=eq.pending&order=created_at.desc&select=id,message,created_at,walker:profiles!walker_id(id,trail_name,wanderkind_id,avatar_url)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) knocks = await resp.json();
  } catch (_) {}

  const wrap = container.parentElement;
  if (!knocks.length) {
    if (wrap) wrap.hidden = true;
    return;
  }
  if (wrap) wrap.hidden = false;

  container.innerHTML = '';
  for (const k of knocks) {
    const w = k.walker || {};
    const name = (w.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const msg = (k.message || '').replace(/[<>"']/g, '');
    const card = document.createElement('article');
    card.className = 'knock-card';
    card.innerHTML = `
      <div class="knock-head">
        <div class="knock-av" aria-hidden="true">${initial}</div>
        <div class="knock-meta">
          <div class="knock-name">${name}</div>
          <div class="knock-wkid">${w.wanderkind_id || ''}</div>
        </div>
        <div class="knock-time">${fmtAgo(k.created_at)}</div>
      </div>
      ${msg ? `<p class="knock-msg">"${msg}"</p>` : ''}
      <div class="knock-actions">
        <button class="knock-accept" type="button" data-id="${k.id}">Accept</button>
        <button class="knock-decline" type="button" data-id="${k.id}">Decline</button>
      </div>
    `;
    container.appendChild(card);
  }

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const action = btn.classList.contains('knock-accept') ? 'accepted' : 'declined';
    btn.disabled = true;
    btn.textContent = action === 'accepted' ? 'Accepting…' : 'Declining…';
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/knocks?id=eq.${btn.dataset.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: action, resolved_at: new Date().toISOString() }),
      });
      const card = btn.closest('.knock-card');
      if (card) card.remove();
      // If no more knocks, hide the section
      if (container.children.length === 0) {
        container.parentElement.hidden = true;
      }
    } catch (err) {
      console.warn('[knocks] patch failed', err);
      btn.disabled = false;
      btn.textContent = action === 'accepted' ? 'Accept' : 'Decline';
    }
  });
}

function fmtAgo(iso) {
  const d = new Date(iso);
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec/60)}m`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/* ─── §B · Magic Open (existing) ───────────────────────────── */
async function renderMagicOpen(session) {
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
  if (!refs.digits) return;

  let state = { code: '4827', stay: null, lock: null };
  try { state = await loadLiveState(session); }
  catch (err) { console.warn('[hosts] demo state', err); }

  applyState(refs, state);
  startTicker(refs);

  refs.shareBtn?.addEventListener('click', async () => {
    const text = `Wanderkind · door code · ${state.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Door code', text }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      refs.shareBtn.textContent = 'Copied ✓';
      setTimeout(() => { refs.shareBtn.textContent = 'Share code with guest'; }, 1400);
    } catch {}
  });
  refs.manageBtn?.addEventListener('click', () => {
    state.code = String(Math.floor(1000 + Math.random() * 9000));
    applyState(refs, state);
  });
}

async function loadLiveState(session) {
  const lockResp = await fetch(
    `${SUPABASE_URL}/rest/v1/host_locks?host_id=eq.${session.user.id}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const lock = lockResp.ok ? (await lockResp.json())[0] : null;
  const stayResp = await fetch(
    `${SUPABASE_URL}/rest/v1/stays?host_id=eq.${session.user.id}&status=eq.active&order=arrives_at.asc&limit=1&select=*,guest:profiles(trail_name,given_name,surname,wkid)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const stay = stayResp.ok ? (await stayResp.json())[0] : null;
  let code = '4827';
  if (lock && stay) code = await deriveCode(lock.secret, stay.id);
  return { code, lock, stay };
}

async function deriveCode(secret, stayId) {
  const windowIdx = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const keyBuf = new TextEncoder().encode(secret);
  const msgBuf = new TextEncoder().encode(`${stayId}|${windowIdx}`);
  const key = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBuf);
  const u8 = new Uint8Array(sig);
  const n = ((u8[0] << 24) | (u8[1] << 16) | (u8[2] << 8) | u8[3]) >>> 0;
  return String(n % 10000).padStart(4, '0');
}

function applyState(refs, state) {
  if (!refs.digits) return;
  refs.digits.innerHTML = '';
  for (const d of state.code) {
    const cell = document.createElement('div');
    cell.className = 'code-digit';
    cell.textContent = d;
    refs.digits.appendChild(cell);
  }
  if (state.lock) {
    refs.lockMeta && (refs.lockMeta.textContent = `${state.lock.brand || 'Smart lock'} · ${state.lock.label || 'paired'}`);
    refs.lockStatus && (refs.lockStatus.textContent = 'Paired', refs.lockStatus.style.color = 'var(--wk-amber-text)');
  } else {
    refs.lockMeta && (refs.lockMeta.textContent = 'Tap to pair a smart lock');
    refs.lockStatus && (refs.lockStatus.textContent = 'Not paired');
  }
  if (state.stay?.guest) {
    const g = state.stay.guest;
    refs.guestName && (refs.guestName.textContent = g.trail_name || `${g.given_name || ''} ${g.surname || ''}`.trim() || 'Guest');
    refs.guestMeta && (refs.guestMeta.textContent = `${g.wkid || 'WND'} · accepted`);
  }
}

function startTicker(refs) {
  if (!refs.live) return;
  let secs = 600;
  const tick = () => {
    if (secs <= 0) return;
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    refs.live.innerHTML = `Live<br>${m}:${s}`;
    secs -= 1;
  };
  tick();
  setInterval(tick, 1000);
}
