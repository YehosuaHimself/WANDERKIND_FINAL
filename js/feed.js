// @ts-nocheck
import { getSession } from './session.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) { location.replace('/auth.html?next=/feed.html'); return; }
  const list = document.getElementById('feed-list');
  const empty = document.getElementById('feed-empty');
  let posts = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/feed_posts?order=created_at.desc&limit=50&select=id,author_id,kind,body_text,image_url,hearts_count,created_at,author:profiles!author_id(trail_name,wanderkind_id)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.accessToken } }
    );
    if (r.ok) posts = await r.json();
  } catch {}
  if (!posts.length) { empty.hidden = false; return; }
  for (const p of posts) {
    const a = p.author || {};
    const name = (a.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const initial = (name.match(/[A-Z]/) || ['W'])[0];
    const dt = new Date(p.created_at);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const date = `${dt.getDate()} ${roman[dt.getMonth()]} ${(dt.getFullYear() % 100).toString().padStart(2,'0')}`;
    const text = (p.body_text || '').replace(/[<>"']/g, '');
    const card = document.createElement('article');
    card.className = 'f-post';
    card.innerHTML = `
      <div class="f-post-head">
        <div class="f-post-av">${initial}</div>
        <div>
          <div class="f-post-name">${name}</div>
          <div class="f-post-meta">${a.wanderkind_id || ''} · ${date}</div>
        </div>
      </div>
      <span class="f-post-tag ${p.kind === 'road' ? 'road' : ''}">${p.kind === 'road' ? 'POST FROM THE ROAD' : 'NEW STAMP CLAIMED'}</span>
      <div class="f-post-body">${text ? `<p>"${text}"</p>` : ''}</div>
      <div class="f-post-act">
        <button class="f-post-act-btn heart" type="button" data-id="${p.id}">♡ ${p.hearts_count || 0}</button>
        <button class="f-post-act-btn" type="button">↗</button>
      </div>
    `;
    list.appendChild(card);
  }
});
