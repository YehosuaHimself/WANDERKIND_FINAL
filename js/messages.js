// @ts-nocheck
/**
 * /js/messages.js — drives /messages.html
 *
 * E2E goal: each Wanderkind has an ECDH P-256 keypair stored locally;
 * the public half is published to profiles.public_key. Per pair, an
 * AES-GCM-256 key is derived via crypto.subtle.deriveKey. Messages are
 * encrypted client-side and the server stores only ciphertext.
 *
 * This first cut: identity bootstrap + thread list rendering. Full
 * encryption pipeline is scaffolded — works against the SQL in
 * /sql/messages.sql once that migration is applied. Without the
 * tables, falls back to a friendly empty state.
 */


import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const KEY_STORE = 'wk-keys-v1';
const STORE_NAME = 'keys';
const ME_RECORD = 'me';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/messages.html'); return; }

  // Ensure identity keypair exists
  try { await ensureIdentityKeys(session); }
  catch (err) { console.warn('[messages] keypair bootstrap failed', err); }

  // Determine view: list or single thread
  const url = new URL(location.href);
  const threadId = url.searchParams.get('t');
  if (threadId) await renderThread(session, threadId);
  else await renderList(session);

  // Wire back + send + form
  document.getElementById('tv-back')?.addEventListener('click', () => {
    history.back();
  });

  const form = document.getElementById('compose');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('compose-text').value.trim();
    if (!text || !threadId) return;
    try {
      await sendMessage(session, threadId, text);
      document.getElementById('compose-text').value = '';
      await renderThread(session, threadId);
    } catch (err) {
      console.warn('[messages] send failed', err);
    }
  });
});

/* ─── identity keypair ──────────────────────────────────────── */
async function ensureIdentityKeys(session) {
  const db = await openKeyDB();
  let rec = await idbGet(db, ME_RECORD);
  if (rec?.publicKey) return rec;

  // Generate ECDH P-256 keypair, private non-extractable
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  await idbPut(db, ME_RECORD, { privateKey: kp.privateKey, publicKey: pubJwk });

  // Try to publish public_key on profile (silently no-op if column missing)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ public_key: pubJwk }),
    });
  } catch (_) {}

  return { privateKey: kp.privateKey, publicKey: pubJwk };
}

/* ─── list view ─────────────────────────────────────────────── */
async function renderList(session) {
  const root = document.getElementById('list-view');
  const list = document.getElementById('thread-list');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('msg-count');

  let threads = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/message_threads?select=id,created_at,members:message_thread_members(user_id,profile:profiles(id,trail_name,given_name,surname))`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.accessToken}`,
        },
      }
    );
    if (resp.ok) threads = await resp.json();
  } catch (_) {}

  list.innerHTML = '';
  if (!threads.length) {
    empty.hidden = false;
    count.textContent = '· 0 threads';
    return;
  }

  count.textContent = `· ${threads.length} thread${threads.length === 1 ? '' : 's'}`;
  for (const t of threads) {
    const others = (t.members || []).filter(m => m.user_id !== session.user.id);
    const other = others[0]?.profile || { trail_name: 'Wanderkind' };
    const name = other.trail_name || `${other.given_name || ''} ${other.surname || ''}`.trim() || 'Wanderkind';
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const card = document.createElement('a');
    card.className = 'thread';
    card.href = `/messages.html?t=${t.id}`;
    card.innerHTML = `
      <div class="thread-head">
        <div class="thread-av" aria-hidden="true">${initial}</div>
        <div class="thread-meta">
          <div class="thread-name">${escapeHtml(name)}</div>
          <div class="thread-lock">end-to-end</div>
        </div>
        <div class="thread-time">${fmtRel(t.created_at)}</div>
      </div>
      <div class="thread-snippet">— Open thread</div>
    `;
    list.appendChild(card);
  }
}

/* ─── thread view ───────────────────────────────────────────── */
async function renderThread(session, threadId) {
  document.getElementById('list-view').style.display = 'none';
  const view = document.getElementById('thread-view');
  view.classList.add('active');

  // Fetch members + their public keys
  const memResp = await fetch(
    `${SUPABASE_URL}/rest/v1/message_thread_members?thread_id=eq.${threadId}&select=user_id,profile:profiles(id,trail_name,given_name,surname,public_key)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  ).catch(() => null);
  const members = memResp && memResp.ok ? await memResp.json() : [];
  const other = members.find(m => m.user_id !== session.user.id)?.profile;
  if (other) {
    const name = other.trail_name || `${other.given_name || ''} ${other.surname || ''}`.trim() || 'Wanderkind';
    document.getElementById('tv-name').textContent = name;
  }

  // Derive shared key with the other party
  let sharedKey = null;
  try {
    const db = await openKeyDB();
    const me = await idbGet(db, ME_RECORD);
    if (me && other?.public_key) {
      const otherPub = await crypto.subtle.importKey(
        'jwk', other.public_key,
        { name: 'ECDH', namedCurve: 'P-256' },
        false, []
      );
      sharedKey = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: otherPub },
        me.privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }
  } catch (_) {}

  // Fetch messages
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?thread_id=eq.${threadId}&order=created_at.asc&select=id,sender_id,ciphertext,iv,created_at`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  ).catch(() => null);
  const msgs = resp && resp.ok ? await resp.json() : [];

  const bubbles = document.getElementById('bubbles');
  bubbles.innerHTML = '';
  for (const m of msgs) {
    let plain = '— (encrypted)';
    if (sharedKey) {
      try {
        const ct = b64decode(m.ciphertext);
        const iv = b64decode(m.iv);
        const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ct);
        plain = new TextDecoder().decode(ptBuf);
      } catch (_) {}
    }
    const bub = document.createElement('div');
    bub.className = 'bubble ' + (m.sender_id === session.user.id ? 'me' : 'them');
    bub.innerHTML = `${escapeHtml(plain)}<span class="bubble-time">${fmtTime(m.created_at)}</span>`;
    bubbles.appendChild(bub);
  }
  view.dataset.sharedKeyReady = sharedKey ? '1' : '0';
}

/* ─── send ───────────────────────────────────────────────────── */
async function sendMessage(session, threadId, plaintext) {
  // Get shared key (recompute — quick)
  const memResp = await fetch(
    `${SUPABASE_URL}/rest/v1/message_thread_members?thread_id=eq.${threadId}&select=user_id,profile:profiles(public_key)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
  );
  const members = memResp.ok ? await memResp.json() : [];
  const other = members.find(m => m.user_id !== session.user.id)?.profile;
  if (!other?.public_key) throw new Error('no public key for peer');

  const db = await openKeyDB();
  const me = await idbGet(db, ME_RECORD);
  const otherPub = await crypto.subtle.importKey('jwk', other.public_key,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: otherPub }, me.privateKey,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, sharedKey,
    new TextEncoder().encode(plaintext)
  );

  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      thread_id: threadId,
      sender_id: session.user.id,
      ciphertext: b64encode(new Uint8Array(ct)),
      iv: b64encode(iv),
    }),
  });
}

/* ─── helpers ───────────────────────────────────────────────── */
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(iso) {
  const d = new Date(iso); return d.toTimeString().slice(0, 5);
}
function fmtRel(iso) {
  const d = new Date(iso); const days = (Date.now() - d) / 86400000;
  if (days < 1) return d.toTimeString().slice(0, 5);
  if (days < 2) return 'YEST';
  /* DD·ROMAN format for older */
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  return d.getDate() + '·' + roman[d.getMonth()];
}
function b64encode(u8) { let s=''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function b64decode(b64) { const s = atob(b64); const u8 = new Uint8Array(s.length); for (let i=0;i<s.length;i++) u8[i] = s.charCodeAt(i); return u8; }

/* IndexedDB wrappers */
function openKeyDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(KEY_STORE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbGet(db, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const r = tx.objectStore(STORE_NAME).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbPut(db, key, value) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const r = tx.objectStore(STORE_NAME).put(value, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
