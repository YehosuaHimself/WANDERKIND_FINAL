// @ts-nocheck
/**
 * /js/vouch.js · the morning vouch ceremony.
 *
 * Flow:
 *   1. Read ?stay=<id> from URL. Fetch the stay + the other party's profile.
 *   2. Show compose view with the other party identified.
 *   3. On "Lock my vouch": upsert vouch_drafts with locked_at = now().
 *   4. Poll every 4s for the other party's draft to lock. While polling,
 *      show "Locked · waiting for X" panel.
 *   5. Once both drafts are locked: call publish_vouches RPC. Show reveal.
 *
 *   Auto-save as draft on text input (debounced 800ms).
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  stayId: null,
  stay: null,
  iAm: null,        // 'walker' or 'host'
  otherId: null,
  otherName: '',
  myDraft: null,    // vouch_drafts row for me
  theirDraft: null, // vouch_drafts row for them
  pollTimer: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  state.session = getSession();
  if (!state.session) { location.replace('/auth.html?next=' + encodeURIComponent(location.pathname + location.search)); return; }

  const params = new URLSearchParams(location.search);
  state.stayId = params.get('stay');
  if (!state.stayId) { showError('No stay specified', 'Open this page from your active stay card.'); return; }

  try {
    await loadStay();
    await loadDrafts();
  } catch (err) {
    console.warn('[vouch] init failed', err);
    showError('Could not load vouch', 'Try again in a moment.');
    return;
  }

  $('v-loading').hidden = true;

  // Already published?
  if (state.stay && state.stay.status === 'past' && state.myDraft && state.theirDraft && state.myDraft.locked_at && state.theirDraft.locked_at) {
    showReveal();
    return;
  }

  // Both locked but not yet published? Publish then reveal.
  if (state.myDraft?.locked_at && state.theirDraft?.locked_at) {
    await publish();
    showReveal();
    return;
  }

  // I locked, waiting for the other
  if (state.myDraft?.locked_at) {
    showWaiting();
    startPoll();
    return;
  }

  showCompose();
});

async function loadStay() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/stays?id=eq.${state.stayId}&select=*,host:profiles!host_id(id,trail_name,wanderkind_id),guest:profiles!guest_id(id,trail_name,wanderkind_id)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${state.session.accessToken}` } }
  );
  if (!r.ok) throw new Error('stay fetch ' + r.status);
  const rows = await r.json();
  if (!rows[0]) throw new Error('stay not found');
  state.stay = rows[0];

  if (state.stay.host_id === state.session.user.id) {
    state.iAm = 'host';
    state.otherId = state.stay.guest_id;
    state.otherName = state.stay.guest?.trail_name || 'Wanderkind';
  } else if (state.stay.guest_id === state.session.user.id) {
    state.iAm = 'walker';
    state.otherId = state.stay.host_id;
    state.otherName = state.stay.host?.trail_name || 'Wanderkind';
  } else {
    throw new Error('not a participant');
  }
}

async function loadDrafts() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/vouch_drafts?stay_id=eq.${state.stayId}&select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${state.session.accessToken}` } }
  );
  if (!r.ok) return;
  const rows = await r.json();
  state.myDraft = rows.find((d) => d.writer_id === state.session.user.id) || null;
  state.theirDraft = rows.find((d) => d.writer_id === state.otherId) || null;
}

function showCompose() {
  const otherName = state.otherName.replace(/[<>"']/g, '');
  $('v-other-initial').textContent = (otherName.match(/[A-Z]/) || ['W'])[0];
  $('v-other-name').textContent = otherName;
  $('v-other-meta').textContent = state.iAm === 'walker' ? 'Your host · ' + (state.stay.host?.wanderkind_id || '') : 'Your guest · ' + (state.stay.guest?.wanderkind_id || '');

  $('v-compose').hidden = false;
  $('v-stage').textContent = 'Compose';

  const txt = $('v-textarea');
  if (state.myDraft?.text) txt.value = state.myDraft.text;
  updateCount();

  let saveTimer = null;
  txt.addEventListener('input', () => {
    updateCount();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(false), 800);
  });
  $('v-save-btn').addEventListener('click', () => saveDraft(false));
  $('v-lock-btn').addEventListener('click', () => saveDraft(true));
}

function updateCount() {
  const v = $('v-textarea').value;
  $('v-count').textContent = String(v.length);
  $('v-lock-btn').disabled = v.trim().length < 4;
}

async function saveDraft(lock) {
  const text = $('v-textarea').value.trim();
  const body = lock ? { writer_id: state.session.user.id, stay_id: state.stayId, text, locked_at: new Date().toISOString() }
                    : { writer_id: state.session.user.id, stay_id: state.stayId, text };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/vouch_drafts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    });
    if (lock) {
      state.myDraft = body;
      $('v-compose').hidden = true;
      showWaiting();
      startPoll();
      // Quick first poll
      setTimeout(checkBoth, 1500);
    }
  } catch (err) { console.warn('[vouch] save failed', err); }
}

function showWaiting() {
  $('v-stage').textContent = 'Locked · waiting';
  $('v-waiting').hidden = false;
  $('v-waiting-other').textContent = state.otherName;
  $('v-waiting-yours').textContent = '"' + (state.myDraft?.text || $('v-textarea').value).replace(/[<>"']/g, '') + '"';
}

function startPoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(checkBoth, 4000);
}

async function checkBoth() {
  await loadDrafts();
  if (state.myDraft?.locked_at && state.theirDraft?.locked_at) {
    clearInterval(state.pollTimer);
    await publish();
    $('v-waiting').hidden = true;
    showReveal();
  }
}

async function publish() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/publish_vouches`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_stay: state.stayId }),
    });
  } catch (err) { console.warn('[vouch] publish failed', err); }
}

function showReveal() {
  $('v-reveal').hidden = false;
  $('v-stage').textContent = 'Revealed';
  $('v-reveal-mine').textContent = '"' + (state.myDraft?.text || '').replace(/[<>"']/g, '') + '"';
  $('v-reveal-theirs').textContent = '"' + (state.theirDraft?.text || '').replace(/[<>"']/g, '') + '"';
  $('v-reveal-mine-eyebrow').textContent = '— You wrote';
  $('v-reveal-theirs-eyebrow').textContent = '— ' + state.otherName.replace(/[<>"']/g, '') + ' wrote';
}

function showError(h, b) {
  $('v-loading').hidden = true;
  $('v-error').hidden = false;
  $('v-error-h').textContent = h;
  $('v-error-b').textContent = b;
}
