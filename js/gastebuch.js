// @ts-nocheck
/**
 * /js/gastebuch.js · the host's full public memory.
 *
 * Reads stamps where host_id = me, ordered by stayed_on desc. Renders
 * each as a card with the walker's monogram, name, region, date, their
 * vouch quote, and either the host's existing reply or a reply composer
 * (textarea + "Save reply" button) for the host to add one quietly.
 */

import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/gastebuch.html'); return; }

  const list  = document.getElementById('g-list');
  const empty = document.getElementById('g-empty');
  const count = document.getElementById('g-count');

  let stamps = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/stamps?host_id=eq.${session.user.id}&order=stayed_on.desc&select=id,stayed_on,region_label,vouch_text,host_reply,walker:profiles!walker_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } }
    );
    if (resp.ok) stamps = await resp.json();
  } catch (_) {}

  if (count) {
    const n = stamps.length;
    count.textContent = '· ' + n + ' ' + (n === 1 ? 'entry' : 'entries');
  }
  if (!stamps.length) { empty.hidden = false; return; }
  list.hidden = false;

  for (const s of stamps) {
    const w = s.walker || {};
    const name = (w.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const dt = new Date(s.stayed_on);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const date = `${dt.getDate()} ${roman[dt.getMonth()]} ${(dt.getFullYear() % 100).toString().padStart(2, '0')}`;
    const text = (s.vouch_text || '').replace(/[<>"']/g, '');
    const reply = (s.host_reply || '').replace(/[<>"']/g, '');
    const region = (s.region_label || '').replace(/[<>"']/g, '');

    const card = document.createElement('article');
    card.className = 'g-entry';
    card.innerHTML = `
      <div class="g-entry-head">
        <div class="g-av" aria-hidden="true">${initial}</div>
        <div class="g-meta">
          <div class="g-name">${name}</div>
          <div class="g-region">${region}</div>
        </div>
        <div class="g-date">${date}</div>
      </div>
      ${text ? `<p class="g-vouch">"${text}"</p>` : ''}
      ${reply
        ? `<p class="g-reply"><span class="g-reply-lbl">— You replied</span>${reply}</p>`
        : `<textarea class="g-reply-input" placeholder="Reply quietly · one line" maxlength="280" data-id="${s.id}"></textarea>
           <button type="button" class="g-reply-btn" data-id="${s.id}">Save reply</button>`}
    `;
    list.appendChild(card);
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.g-reply-btn'); if (!btn) return;
    const id = btn.dataset.id;
    const ta = list.querySelector(`textarea[data-id="${id}"]`);
    if (!ta) return;
    const val = ta.value.trim();
    if (!val) return;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/stamps?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ host_reply: val }),
      });
      // Replace textarea + button with rendered reply
      const card = btn.closest('.g-entry');
      ta.remove(); btn.remove();
      const p = document.createElement('p');
      p.className = 'g-reply';
      p.innerHTML = `<span class="g-reply-lbl">— You replied</span>${val.replace(/[<>"']/g, '')}`;
      card.appendChild(p);
    } catch (err) {
      console.warn('[gast] reply failed', err);
      btn.disabled = false;
      btn.textContent = 'Save reply';
    }
  });
});
