// @ts-nocheck
/**
 * /js/host-setup.js · drives the My House setup wizard at /host.html.
 *
 * Seven slides, one question each. Local state held in module scope.
 * Final step PATCHes /rest/v1/profiles for the signed-in user with:
 *   - trail_name (host's door name)
 *   - last_location_label (region)
 *   - host_offers (jsonb array)
 *   - host_capacity
 *   - house_rules (jsonb array)
 *   - host_languages (jsonb array)
 *   - host_specialty
 *   - host_bio
 *   - show_on_map = true   ← this lights up the map pin
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const TOTAL_STEPS = 7;   // 0..6 are content steps; 7 is the "done" slide

const state = {
  step: 0,
  data: {
    name: '',
    region: '',
    offers: new Set(),
    capacity: 2,
    rules: [],
    languages: new Set(),
    specialty: '',
    bio: '',
  },
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/host.html'); return; }
  state.session = session;

  // Pre-load any existing host setup from the user's profile
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=trail_name,last_location_label,host_offers,house_rules,host_languages,host_specialty,host_bio,host_capacity,show_on_map`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) {
      const rows = await resp.json();
      const p = rows && rows[0];
      if (p) hydrateFromProfile(p);
    }
  } catch (_) {}

  /* — Wire all inputs — */
  $('f-name').addEventListener('input', (e) => { state.data.name = e.target.value.trim(); });
  $('f-region').addEventListener('input', (e) => { state.data.region = e.target.value.trim(); });
  $('f-capacity').addEventListener('change', (e) => { state.data.capacity = parseInt(e.target.value, 10) || 0; });
  $('f-specialty').addEventListener('input', (e) => { state.data.specialty = e.target.value.trim(); });
  $('f-bio').addEventListener('input', (e) => { state.data.bio = e.target.value.trim(); });

  $('f-offers').addEventListener('click', (e) => {
    const b = e.target.closest('.h-offer'); if (!b) return;
    const k = b.dataset.offer;
    if (state.data.offers.has(k)) state.data.offers.delete(k);
    else state.data.offers.add(k);
    b.classList.toggle('on', state.data.offers.has(k));
  });

  $('f-langs').addEventListener('click', (e) => {
    const b = e.target.closest('.h-lang'); if (!b) return;
    const k = b.dataset.lang;
    if (state.data.languages.has(k)) state.data.languages.delete(k);
    else state.data.languages.add(k);
    b.classList.toggle('on', state.data.languages.has(k));
  });

  $('f-rule-add').addEventListener('click', addRule);
  $('f-rule-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addRule(); }
  });

  $('h-back').addEventListener('click', () => goStep(state.step - 1));
  $('h-next').addEventListener('click', () => {
    if (state.step < TOTAL_STEPS - 1) goStep(state.step + 1);
    else if (state.step === TOTAL_STEPS - 1) goStep(TOTAL_STEPS); // → done slide
  });
  $('h-open').addEventListener('click', async () => {
    $('h-open').disabled = true;
    $('h-open').textContent = 'Opening…';
    await commitProfile();
    goStep(TOTAL_STEPS); // → done slide
  });

  renderRules();
  applyStep();
});

function hydrateFromProfile(p) {
  if (p.trail_name) {
    state.data.name = p.trail_name;
    $('f-name').value = p.trail_name;
  }
  if (p.last_location_label) {
    state.data.region = p.last_location_label;
    $('f-region').value = p.last_location_label;
  }
  if (Array.isArray(p.host_offers)) {
    for (const o of p.host_offers) state.data.offers.add(o);
    document.querySelectorAll('.h-offer').forEach((b) => {
      if (state.data.offers.has(b.dataset.offer)) b.classList.add('on');
    });
  }
  if (typeof p.host_capacity === 'number') {
    state.data.capacity = p.host_capacity;
    $('f-capacity').value = String(p.host_capacity);
  }
  if (Array.isArray(p.house_rules)) {
    state.data.rules = p.house_rules.slice(0, 6);
  }
  if (Array.isArray(p.host_languages)) {
    for (const l of p.host_languages) state.data.languages.add(l);
    document.querySelectorAll('.h-lang').forEach((b) => {
      if (state.data.languages.has(b.dataset.lang)) b.classList.add('on');
    });
  }
  if (p.host_specialty) {
    state.data.specialty = p.host_specialty;
    $('f-specialty').value = p.host_specialty;
  }
  if (p.host_bio) {
    state.data.bio = p.host_bio;
    $('f-bio').value = p.host_bio;
  }
}

function addRule() {
  const v = $('f-rule-input').value.trim();
  if (!v) return;
  if (state.data.rules.length >= 6) return;
  state.data.rules.push(v);
  $('f-rule-input').value = '';
  renderRules();
}

function renderRules() {
  const box = $('f-rules');
  box.innerHTML = '';
  state.data.rules.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'h-rule';
    el.innerHTML = `<span>${escape(r)}</span><button type="button" class="h-rule-rm" data-i="${i}">remove</button>`;
    box.appendChild(el);
  });
  box.onclick = (e) => {
    const b = e.target.closest('.h-rule-rm'); if (!b) return;
    state.data.rules.splice(parseInt(b.dataset.i, 10), 1);
    renderRules();
  };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function applyStep() {
  $('h-track').style.transform = `translateX(-${state.step * 100}%)`;
  $('h-back').disabled = state.step === 0;
  // Update step label + dots
  if (state.step < TOTAL_STEPS) {
    $('h-step-label').textContent = `Step ${state.step + 1} / ${TOTAL_STEPS}`;
  } else {
    $('h-step-label').textContent = 'Done';
  }
  document.querySelectorAll('.h-dot').forEach((d, i) => {
    d.classList.remove('on', 'done');
    if (i === state.step) d.classList.add('on');
    else if (i < state.step) d.classList.add('done');
  });
  // Toggle Next vs Open
  const isLast = state.step === TOTAL_STEPS - 1;
  $('h-next').hidden = isLast || state.step === TOTAL_STEPS;
  $('h-open').hidden = !isLast;
  $('h-back').hidden = state.step === TOTAL_STEPS;
  // Refresh the preview if we land on step 7 (bio + preview)
  if (state.step === TOTAL_STEPS - 1) renderPreview();
}

function goStep(n) {
  state.step = Math.max(0, Math.min(TOTAL_STEPS, n));
  applyStep();
}

function renderPreview() {
  $('p-name').textContent = state.data.name || '—';
  $('p-where').textContent = state.data.region || '—';
  $('p-bio').textContent = state.data.bio || '(your paragraph will appear here)';
  const offers = $('p-offers');
  offers.innerHTML = '';
  for (const o of state.data.offers) {
    const span = document.createElement('span');
    span.className = 'h-preview-offer';
    span.textContent = o;
    offers.appendChild(span);
  }
  const rules = $('p-rules');
  rules.innerHTML = '';
  state.data.rules.forEach((r) => {
    const div = document.createElement('div');
    div.textContent = r;
    rules.appendChild(div);
  });
}

async function commitProfile() {
  const session = state.session;
  if (!session) return;
  const body = {
    trail_name: state.data.name || null,
    last_location_label: state.data.region || null,
    host_offers: Array.from(state.data.offers),
    host_capacity: state.data.capacity,
    house_rules: state.data.rules,
    host_languages: Array.from(state.data.languages),
    host_specialty: state.data.specialty || null,
    host_bio: state.data.bio || null,
    show_on_map: true,
    host_paused: false,
  };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
  } catch (err) { console.warn('[host-setup] commit failed', err); }
}
