// @ts-nocheck
/**
 * /js/stamps.js · the Wanderbuch.
 *
 * Reads stamps where walker_id = me, ordered by stayed_on desc.
 *
 * Additions in this pass:
 *   - Search box (host name or region · client-side filter)
 *   - Year headers grouping stamps by year
 *   - Open-vouches banner if there are unfinished vouch_drafts for the bearer
 *     (i.e. a vouch is mid-ceremony — tap to finish it)
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const state = { stamps: [], filter: '' };

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/stamps.html'); return; }

  state.session = session;

  const list  = document.getElementById('stamps-list');
  const empty = document.getElementById('stamps-empty');
  const count = document.getElementById('stamps-count');
  const search = document.getElementById('stamps-search');

  // Open-vouches banner — query stays that are active OR have my unlocked draft
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/vouch_drafts?writer_id=eq.${session.user.id}&locked_at=is.null&select=stay_id`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (r.ok) {
      const drafts = await r.json();
      if (drafts.length > 0) {
        const banner = document.getElementById('stamps-open-vouch');
        if (banner) {
          banner.hidden = false;
          banner.querySelector('a').href = `/vouch.html?stay=${drafts[0].stay_id}`;
        }
      }
    }
  } catch {}

  // Fetch stamps
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/stamps?walker_id=eq.${session.user.id}&order=stayed_on.desc&select=id,stayed_on,region_label,vouch_text,host_reply,host:profiles!host_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) state.stamps = await resp.json();
  } catch (_) {}

  if (count) {
    const n = state.stamps.length;
    count.textContent = '· ' + n + ' ' + (n === 1 ? 'stamp' : 'stamps');
  }

  if (!state.stamps.length) {
    if (empty) empty.hidden = false;
    if (list) list.hidden = true;
    if (search) search.parentElement.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  if (list) list.hidden = false;

  if (search) {
    search.addEventListener('input', () => {
      state.filter = search.value.trim().toLowerCase();
      render();
    });
  }
  render();
});

function render() {
  const list = document.getElementById('stamps-list');
  list.innerHTML = '';
  /* Determine active chip · default 'all' */
  const activeChip = document.querySelector('.stamps-chip[aria-pressed="true"]');
  const cat = activeChip ? activeChip.dataset.cat : 'all';

  const filtered = state.stamps.filter((s) => {
    /* Category filter */
    if (cat !== 'all') {
      const sCat = (s.category || 'other').toLowerCase();
      if (sCat !== cat) return false;
    }
    /* Text filter */
    if (!state.filter) return true;
    const haystack = [
      s.host?.trail_name || '',
      s.region_label || '',
      s.vouch_text || '',
    ].join(' ').toLowerCase();
    return haystack.includes(state.filter);
  });

  let currentYear = null;
  for (const s of filtered) {
    const dt = new Date(s.stayed_on);
    const year = dt.getFullYear();
    if (year !== currentYear) {
      currentYear = year;
      const yh = document.createElement('div');
      yh.className = 'stamps-year';
      yh.textContent = String(year);
      list.appendChild(yh);
    }
    const host = s.host || {};
    const name = (host.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const date = `${dt.getDate()} ${roman[dt.getMonth()]} ${(year % 100).toString().padStart(2,'0')}`;
    /* Tier ring · default to tier 2 if not specified */
    const tier = s.tier || 2;
    const card = document.createElement('a');
    card.className = 'stamp tier-ring tier-ring--' + tier;
    card.href = '/stamp.html?id=' + s.id;
    card.style.textDecoration = 'none';
    card.style.color = 'inherit';
    card.innerHTML = `
      <div class="stamp-head">
        <div class="stamp-seal" aria-hidden="true">${initial}</div>
        <div class="stamp-meta">
          <div class="stamp-name">${name}</div>
          <div class="stamp-where">${(s.region_label || '').replace(/[<>"']/g, '')}</div>
        </div>
        <div class="stamp-date">${date}</div>
      </div>
      ${s.vouch_text ? `<p class="stamp-vouch">"${(s.vouch_text || '').replace(/[<>"']/g, '')}"</p>` : ''}
      ${s.host_reply ? `<p class="stamp-reply"><span class="stamp-reply-lbl">— ${name} replied</span>${(s.host_reply || '').replace(/[<>"']/g, '')}</p>` : ''}
    `;
    list.appendChild(card);
  }
}

/* Wire category chips */
document.addEventListener('DOMContentLoaded', () => {
  const chips = document.querySelectorAll('.stamps-chip');
  chips.forEach((c) => {
    c.addEventListener('click', () => {
      chips.forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      if (typeof render === 'function') render();
    });
  });
});

}
