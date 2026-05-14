/**
 * /map.html — real OpenStreetMap tile layer + live wanderkind markers.
 *
 *   No third-party JS: Leaflet is self-hosted under /js/vendor.
 *   Tiles: CartoDB Positron (no API key, no tracking). Permissive
 *   attribution is rendered inside Leaflet's control.
 *
 *   Markers: every profile with show_on_map=true AND lat/lng set is
 *   plotted as a small amber dot. Tapping a marker opens a quiet
 *   popup with the trail name and a link to /u/<wkid>.
 *
 *   Self pin: if the visitor is signed in and has their own pin set,
 *   their dot is rendered in a deeper amber with a soft ring so they
 *   know which one is them.
 */

// @ts-check
/* global L */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { refreshIfNeeded } from './session.js';

(async function bootMap() {
  const host = document.getElementById('map');
  if (!host || typeof L === 'undefined') return;

  // World view, centered loosely on Europe (the launch audience).
  const map = L.map(host, {
    center: [47.5, 9.7],
    zoom: 5,
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // CartoDB Positron — desaturated, parchment-friendly, free.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    minZoom: 3,
  }).addTo(map);

  // Resolve session (best-effort; map is public)
  let myId = '';
  try {
    const s = await refreshIfNeeded();
    if (s) myId = s.user.id;
  } catch { /* anon path */ }

  // Fetch every wanderkind that opted in AND has coords.
  // RLS allows public read of profiles where show_profile_public.
  const url = `${SUPABASE_URL}/rest/v1/profiles?show_on_map=eq.true&lat=not.is.null&lng=not.is.null&select=id,trail_name,wanderkind_id,lat,lng,is_walking,avatar_url&limit=500`;
  let rows = /** @type {Array<any>} */ ([]);
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (res.ok) rows = await res.json();
  } catch (e) {
    console.warn('map fetch failed', e);
  }

  // Render markers
  const bounds = /** @type {L.LatLngBounds|null} */ (null);
  /** @type {L.LatLngBoundsLiteral} */
  const collected = [];
  for (const p of rows) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    const isSelf = p.id === myId;
    const isWalking = !!p.is_walking;
    const dot = L.divIcon({
      className: 'wk-marker' + (isSelf ? ' wk-marker--self' : '') + (isWalking ? ' wk-marker--walking' : ''),
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      html: '<span class="wk-marker-inner" aria-hidden="true"></span>',
    });
    const m = L.marker([p.lat, p.lng], { icon: dot, title: p.trail_name || 'Wanderkind' });
    const trail = sanitize(p.trail_name || 'Wanderkind');
    const wkid = sanitize(p.wanderkind_id || p.id);
    const href = '/u/' + encodeURIComponent(wkid);
    m.bindPopup(
      `<div class="wk-popup">
         <div class="wk-popup-name">${trail}</div>
         <div class="wk-popup-wkid">${wkid}</div>
         <a class="wk-popup-link" href="${href}">View pass →</a>
       </div>`,
      { closeButton: false, autoPan: true }
    );
    m.addTo(map);
    collected.push([p.lat, p.lng]);
  }

  // Empty-state visibility — only show if zero markers
  const emptySheet = document.querySelector('.empty-sheet');
  if (emptySheet) {
    if (collected.length === 0) emptySheet.removeAttribute('hidden');
    else emptySheet.setAttribute('hidden', '');
  }

  // Auto-fit if we have at least one marker
  if (collected.length === 1) {
    map.setView(collected[0], 9);
  } else if (collected.length > 1) {
    map.fitBounds(/** @type {L.LatLngBoundsLiteral} */ (collected), { padding: [40, 40], maxZoom: 12 });
  }

  // Surface the fetched count on the topbar (replaces the live-count
  // approximation from map-live.js which is now redundant).
  const badge = document.getElementById('walking-count');
  if (badge) {
    const walkers = rows.filter((r) => r.is_walking).length;
    const total = collected.length;
    if (total === 0) badge.textContent = 'Day Zero · be the first to set a pin';
    else if (walkers > 0) badge.textContent = `${total} wanderkind${total === 1 ? '' : 's'} on the map · ${walkers} walking`;
    else badge.textContent = `${total} wanderkind${total === 1 ? '' : 's'} on the map`;
    badge.removeAttribute('hidden');
  }
})();

/** Cheap HTML-escape for popup content. @param {string} s */
function sanitize(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] || ch));
}
