// @ts-nocheck
import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=' + encodeURIComponent(location.pathname + location.search)); return; }
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/stamps?id=eq.${id}&select=id,stayed_on,region_label,category,vouch_text,host_reply,host:profiles!host_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.accessToken } }
    );
    if (!r.ok) return;
    const rows = await r.json();
    const s = rows && rows[0];
    if (!s) return;
    const host = s.host || {};
    const name = (host.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    document.getElementById('stamp-title-main').innerHTML = name.toUpperCase().split(' ')[0] + (name.includes(' ') ? ' <em>' + name.split(' ').slice(1).join(' ').toUpperCase() + '</em>' : '');
    const dt = new Date(s.stayed_on);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    document.getElementById('stamp-coords').textContent = `${(s.region_label || '').replace(/[<>"']/g, '')} · ${dt.getDate()} ${roman[dt.getMonth()]} ${dt.getFullYear()}`;
    document.getElementById('stamp-num').textContent = '#' + (s.id || '').slice(0, 2).toUpperCase();
    const gal = document.getElementById('stamp-gallery');
    /* For now · placeholder 5 photo slots + add tile */
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'g-photo';
      gal.appendChild(d);
    }
    const add = document.createElement('div');
    add.className = 'g-photo add';
    add.textContent = '＋';
    gal.appendChild(add);
    document.getElementById('stamp-photo-count').textContent = '0 photos · 6 slots';
    if (s.vouch_text || s.host_reply) {
      document.getElementById('stamp-vouch-block').hidden = false;
      document.getElementById('stamp-vouch-empty').hidden = true;
      if (s.vouch_text) document.getElementById('stamp-vouch-text').textContent = '"' + (s.vouch_text || '').replace(/[<>"']/g, '') + '"';
      if (s.host_reply) {
        document.getElementById('stamp-vouch-reply').hidden = false;
        document.getElementById('stamp-vouch-reply-lbl').textContent = '— ' + name + ' replied';
        document.getElementById('stamp-vouch-reply-text').textContent = (s.host_reply || '').replace(/[<>"']/g, '');
      }
    }
  } catch (err) { console.warn('[stamp]', err); }
});
