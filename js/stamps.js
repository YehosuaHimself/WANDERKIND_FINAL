// @ts-nocheck
/**
 * /js/stamps.js · drives the Wanderbuch (/stamps.html).
 *
 * Reads stamps where walker_id = me, ordered by stayed_on desc. Each row
 * joins host:profiles to surface trail_name + region. If the table doesn't
 * exist yet (pre-migration), the page renders the empty state silently.
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/stamps.html'); return; }

  const list  = document.getElementById('stamps-list');
  const empty = document.getElementById('stamps-empty');
  const count = document.getElementById('stamps-count');

  let stamps = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/stamps?walker_id=eq.${session.user.id}&order=stayed_on.desc&select=id,stayed_on,region_label,vouch_text,host_reply,host:profiles!host_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) stamps = await resp.json();
  } catch (_) {}

  if (count) {
    const n = stamps.length;
    count.textContent = '· ' + n + ' ' + (n === 1 ? 'stamp' : 'stamps');
  }

  if (!stamps.length) {
    if (empty) empty.hidden = false;
    if (list) list.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  if (list) list.hidden = false;
  list.innerHTML = '';

  for (const s of stamps) {
    const host = s.host || {};
    const name = (host.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const date = fmtDate(s.stayed_on);
    const card = document.createElement('article');
    card.className = 'stamp';
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
});

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  return dt.getDate() + ' ' + roman[dt.getMonth()] + ' ' + (dt.getFullYear() % 100).toString().padStart(2,'0');
}
