// @ts-nocheck
import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/walks.html'); return; }
  const list = document.getElementById('walks-list');
  const empty = document.getElementById('walks-empty');
  let walks = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/walks?order=started_at.desc&select=id,kind,name,started_at,expires_at,members:walk_members(user_id,profile:profiles(trail_name,wanderkind_id))`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.accessToken } }
    );
    if (r.ok) walks = await r.json();
  } catch {}
  if (!walks.length) { empty.hidden = false; return; }
  for (const w of walks) {
    const startMin = Math.round((Date.now() - new Date(w.started_at)) / 60000);
    const expMin = Math.round((new Date(w.expires_at) - Date.now()) / 60000);
    const card = document.createElement('article');
    card.className = 'gw-card' + (w.kind === 'walking' ? ' active' : '');
    const dots = (w.members || []).slice(0, 5).map(m => {
      const n = (m.profile?.trail_name || 'W').replace(/[<>"']/g, '');
      const initial = (n.match(/[A-Z]/) || ['W'])[0];
      return `<div class="gw-dot">${initial}</div>`;
    }).join('');
    card.innerHTML = `
      <div class="gw-head">
        <div class="gw-name">${(w.name || 'Walk').replace(/[<>"']/g, '')}</div>
        <div class="gw-badge">${(w.kind || 'walking').toUpperCase()}</div>
      </div>
      <div class="gw-meta">Started ${startMin}m ago · ${(w.members || []).length} wanderkinder<br>Expires in ${Math.max(0, Math.floor(expMin/60))}h ${Math.max(0, expMin % 60)}m</div>
      <div class="gw-dots">${dots}<div class="gw-dot ghost">+</div></div>
    `;
    list.appendChild(card);
  }
});
