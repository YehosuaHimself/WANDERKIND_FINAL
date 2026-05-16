// @ts-nocheck
/**
 * /js/hosts.js · the full host hub (/hosts.html).
 *
 * Five sections, one file:
 *   §A · Door status row    (paused toggle · quiet-hours toggle)
 *   §B · Incoming knocks    (Accept / Decline)
 *   §C · Active stay        (approaching → arrived → in-stay → checkout)
 *   §D · Magic Open code    (HMAC-derived rotating door code · pair-a-lock)
 *   §E · Gästebuch          (last 3 vouches received)
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/hosts.html'); return; }

  if (await isMinorFromSession(session)) {
    const root = document.getElementById('hosts-root');
    if (root) {
      root.innerHTML = '<div style="padding:32px 22px; text-align:center; background:var(--wk-bg-2); border:1px solid var(--wk-line); border-radius:var(--wk-r-md);"><div style="font-family:var(--wk-font-mono); font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:var(--wk-amber-text); font-weight:700; margin-bottom:8px;">— Supervised minor</div><div style="font-family:var(--wk-font-display); font-size:14.5px; color:var(--wk-ink); line-height:1.55;">Hosting requires an adult Wanderkind credential. Ask your supervisor to set up the door.</div></div>';
    }
    return;
  }

  await renderDoorStatus(session);
  await renderKnocks(session);
  await renderActiveStay(session);
  await renderMagicOpen(session);
  await renderGastebuch(session);
});

/* ─── §A · Door status row ──────────────────────────────── */
async function renderDoorStatus(session) {
  const root = document.getElementById('door-status');
  if (!root) return;
  let p = {};
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=trail_name,host_paused,quiet_hours,show_on_map,host_offers`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (r.ok) p = (await r.json())[0] || {};
  } catch (_) {}

  const nm = document.getElementById('door-name');
  if (nm) nm.textContent = p.trail_name || 'Your door';
  const off = document.getElementById('door-offers');
  if (off && Array.isArray(p.host_offers)) {
    off.innerHTML = p.host_offers.map(o => `<span class="offer-pill">${o}</span>`).join('');
  }

  // Paused toggle
  const pause = document.getElementById('toggle-paused');
  if (pause) {
    pause.checked = !!p.host_paused;
    pause.addEventListener('change', async () => {
      const v = pause.checked;
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ host_paused: v, show_on_map: !v }),
        });
        const lbl = document.getElementById('door-state-label');
        if (lbl) lbl.textContent = v ? 'Paused' : 'Open';
      } catch {}
    });
    const lbl = document.getElementById('door-state-label');
    if (lbl) lbl.textContent = p.host_paused ? 'Paused' : 'Open';
  }

  // Quiet hours
  const qh = document.getElementById('quiet-hours-label');
  if (qh && p.quiet_hours) {
    qh.textContent = `${p.quiet_hours.start || '—'} → ${p.quiet_hours.end || '—'}`;
  }
}

/* ─── §B · Incoming knocks (existing) ─────────────────── */
async function renderKnocks(session) {
  const container = document.getElementById('knocks-list');
  if (!container) return;
  let knocks = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/knocks?host_id=eq.${session.user.id}&status=eq.pending&order=created_at.desc&select=id,message,created_at,walker:profiles!walker_id(id,trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) knocks = await resp.json();
  } catch (_) {}

  const wrap = container.parentElement;
  if (!knocks.length) {
    if (wrap) wrap.hidden = true; return;
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
      if (action === 'accepted') {
        /* RPC: atomically marks knock + mints a stay row */
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_knock_to_stay`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_knock: btn.dataset.id }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/decline_knock`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_knock: btn.dataset.id }),
        });
      }
      const card = btn.closest('.knock-card');
      if (card) card.remove();
      if (container.children.length === 0) container.parentElement.hidden = true;
      if (action === 'accepted') renderActiveStay(session);
    } catch (err) {
      console.warn('[knock] action failed', err);
      btn.disabled = false;
      btn.textContent = action === 'accepted' ? 'Accept' : 'Decline';
    }
  });
}

/* ─── §C · Active stay ──────────────────────────────────── */
async function renderActiveStay(session) {
  const wrap = document.getElementById('active-stay-wrap');
  const card = document.getElementById('active-stay-card');
  if (!wrap || !card) return;
  let stay = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/stays?host_id=eq.${session.user.id}&status=in.(active,pending)&order=arrives_at.asc&limit=1&select=*,guest:profiles!guest_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (r.ok) stay = (await r.json())[0] || null;
  } catch (_) {}

  if (!stay) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const g = stay.guest || {};
  const name = (g.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
  const initial = (name.match(/[A-Z]/) || ['W'])[0];
  const arrivesAt = new Date(stay.arrives_at);
  const phase = computePhase(stay.status, arrivesAt);

  card.innerHTML = `
    <div class="stay-phase stay-phase--${phase.key}">
      <span class="stay-phase-dot"></span>${phase.label}
    </div>
    <div class="stay-name"><strong>${name}</strong> · ${g.wanderkind_id || ''}</div>
    <div class="stay-when">${phase.sub}</div>
    ${phase.key === 'checkout' ? '<a class="stay-vouch-cta" href="/vouch.html?stay=' + stay.id + '">Write your vouch →</a>' : ''}
  `;
}

function computePhase(status, arrivesAt) {
  const now = new Date();
  const diffMin = Math.round((arrivesAt - now) / 60000);
  if (status === 'pending' && diffMin > 30) {
    return { key: 'approaching', label: 'Approaching', sub: `arriving in ~${Math.round(diffMin/60)}h` };
  }
  if (status === 'pending' && diffMin > 0) {
    return { key: 'approaching', label: 'Approaching', sub: `arriving in ${diffMin}m` };
  }
  if (status === 'active') {
    // After arrives_at by less than 14h → "in stay"; later → "checkout window"
    const sinceArrival = Math.round((now - arrivesAt) / 60000);
    if (sinceArrival < 14 * 60) return { key: 'arrived', label: 'Under your roof', sub: 'Location no longer shared with the trail' };
    return { key: 'checkout', label: 'Checkout', sub: 'Time to write the morning vouch' };
  }
  return { key: 'approaching', label: 'Pending', sub: '' };
}

/* ─── §D · Magic Open + pair-a-lock ─────────────────────── */
async function renderMagicOpen(session) {
  const refs = {
    digits: document.getElementById('code-digits'),
    live:   document.getElementById('code-live'),
    window: document.getElementById('code-window'),
    lockMeta: document.getElementById('lock-meta'),
    lockStatus: document.getElementById('lock-status'),
    pairBtn: document.getElementById('pair-lock-btn'),
    pairForm: document.getElementById('pair-lock-form'),
    pairBrand: document.getElementById('pair-brand'),
    pairLabel: document.getElementById('pair-label'),
    pairSubmit: document.getElementById('pair-submit'),
    shareBtn: document.getElementById('share-btn'),
    manageBtn: document.getElementById('manage-btn'),
  };
  if (!refs.digits) return;

  let st = { code: '4827', stay: null, lock: null };
  try { st = await loadLiveState(session); } catch {}
  applyState(refs, st);
  startTicker(refs);

  refs.shareBtn?.addEventListener('click', async () => {
    const text = `Wanderkind · door code · ${st.code}`;
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
    st.code = String(Math.floor(1000 + Math.random() * 9000));
    applyState(refs, st);
  });

  refs.pairBtn?.addEventListener('click', () => {
    refs.pairForm.hidden = !refs.pairForm.hidden;
  });
  refs.pairSubmit?.addEventListener('click', async () => {
    const brand = refs.pairBrand.value.trim() || 'Smart lock';
    const label = refs.pairLabel.value.trim() || 'paired';
    // Generate a 32-byte random secret for HMAC code derivation
    const u8 = new Uint8Array(32);
    crypto.getRandomValues(u8);
    const secret = btoa(String.fromCharCode(...u8));
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/host_locks?host_id=eq.${session.user.id}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          host_id: session.user.id, brand, label, secret,
        }),
      });
      refs.pairForm.hidden = true;
      // Re-render
      const fresh = await loadLiveState(session);
      applyState(refs, fresh);
      st.lock = fresh.lock;
    } catch (err) { console.warn('[pair] failed', err); }
  });
}

async function loadLiveState(session) {
  const lockResp = await fetch(
    `${SUPABASE_URL}/rest/v1/host_locks?host_id=eq.${session.user.id}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const lock = lockResp.ok ? (await lockResp.json())[0] : null;
  const stayResp = await fetch(
    `${SUPABASE_URL}/rest/v1/stays?host_id=eq.${session.user.id}&status=eq.active&order=arrives_at.asc&limit=1&select=*,guest:profiles!guest_id(trail_name,wanderkind_id)`,
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

function applyState(refs, st) {
  if (!refs.digits) return;
  refs.digits.innerHTML = '';
  for (const d of st.code) {
    const cell = document.createElement('div');
    cell.className = 'code-digit';
    cell.textContent = d;
    refs.digits.appendChild(cell);
  }
  if (st.lock) {
    refs.lockMeta && (refs.lockMeta.textContent = `${st.lock.brand || 'Smart lock'} · ${st.lock.label || 'paired'}`);
    refs.lockStatus && (refs.lockStatus.textContent = 'Paired', refs.lockStatus.style.color = 'var(--wk-amber-text)');
  } else {
    refs.lockMeta && (refs.lockMeta.textContent = 'Tap to pair a smart lock');
    refs.lockStatus && (refs.lockStatus.textContent = 'Not paired');
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

/* ─── §E · Gästebuch (last 3 vouches received) ─────────── */
async function renderGastebuch(session) {
  const list = document.getElementById('gastebuch-list');
  const wrap = document.getElementById('gastebuch-wrap');
  if (!list || !wrap) return;
  let stamps = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/stamps?host_id=eq.${session.user.id}&order=stayed_on.desc&limit=3&select=id,stayed_on,vouch_text,walker:profiles!walker_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (r.ok) stamps = await r.json();
  } catch {}

  if (!stamps.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  list.innerHTML = '';
  for (const s of stamps) {
    const w = s.walker || {};
    const name = (w.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const dt = new Date(s.stayed_on);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const date = `${dt.getDate()} ${roman[dt.getMonth()]} ${(dt.getFullYear() % 100).toString().padStart(2,'0')}`;
    const text = (s.vouch_text || '').replace(/[<>"']/g, '');
    const card = document.createElement('article');
    card.className = 'gast-entry';
    card.innerHTML = `
      <div class="gast-head">
        <div class="gast-av">${initial}</div>
        <div class="gast-meta">
          <div class="gast-name">${name}</div>
          <div class="gast-date">${date}</div>
        </div>
      </div>
      ${text ? `<p class="gast-text">"${text}"</p>` : ''}
    `;
    list.appendChild(card);
  }
}

async function isMinorFromSession(session) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=dob`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    const dob = rows && rows[0] && rows[0].dob;
    if (!dob) return false;
    const d = new Date(dob);
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
    return age >= 0 && age < 18;
  } catch { return false; }
}

function fmtAgo(iso) {
  const d = new Date(iso);
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec/60)}m`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
