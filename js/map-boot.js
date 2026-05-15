// @ts-nocheck
/**
 * /js/map-boot.js — careful, lazy boot for /map.html.
 *
 * Goals:
 *   - Never block the page on bootstrap. Defer until DOM is idle.
 *   - Always render the tile layer, even if Supabase fetch fails.
 *   - Bound the data fetch with a 4-second AbortController timeout.
 *   - Show explicit "Loading…" → "N doors" / "0 doors so far" status.
 *   - If Leaflet itself doesn't load, reveal the empty-state sheet and quit.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const TIMEOUT_MS = 4000;
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function setStatus(text) {
  const el = document.querySelector('.map-status');
  if (el) el.textContent = text;
}
function showEmptySheet() {
  const sheet = document.querySelector('.empty-sheet');
  if (sheet) sheet.hidden = false;
}
function hideEmptySheet() {
  const sheet = document.querySelector('.empty-sheet');
  if (sheet) sheet.hidden = true;
}

async function fetchPins(signal) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?show_on_map=eq.true&lat=not.is.null&lng=not.is.null&select=id,trail_name,wanderkind_id,lat,lng,is_walking,avatar_url&limit=500`;
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY }, signal });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function bootMap() {
  const host = document.getElementById('map');
  if (!host) return;

  if (typeof L === 'undefined') {
    setStatus('—');
    showEmptySheet();
    host.hidden = true;
    return;
  }

  host.hidden = false;
  host.removeAttribute('aria-hidden');

  let map;
  try {
    map = L.map(host, {
      center: [47.5, 9.7],
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      minZoom: 3,
    }).addTo(map);
  } catch (e) {
    console.warn('[map] Leaflet boot failed', e);
    showEmptySheet();
    host.hidden = true;
    return;
  }

  setStatus('Loading doors…');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  fetchPins(ac.signal).then((rows) => {
    clearTimeout(t);
    if (!Array.isArray(rows) || rows.length === 0) {
      setStatus('0 doors so far');
      showEmptySheet();
      return;
    }
    hideEmptySheet();
    setStatus(`${rows.length} ${rows.length === 1 ? 'door' : 'doors'}`);

    const bounds = [];
    for (const p of rows) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      const ll = [p.lat, p.lng];
      bounds.push(ll);
      const icon = L.divIcon({
        className: 'wk-marker',
        html: `<span class="wk-marker-dot${p.is_walking ? ' walking' : ''}" aria-hidden="true"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker(ll, { icon }).addTo(map);
      const name = (p.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
      marker.bindPopup(`
        <div style="font-family:'Helvetica Neue',sans-serif;font-size:13px;color:#1A120A;">
          <div style="font-weight:700;margin-bottom:4px;">${name}</div>
          ${p.wanderkind_id ? `<div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#9A8B73;">${p.wanderkind_id}</div>` : ''}
          ${p.wanderkind_id ? `<a href="/u/${p.wanderkind_id}" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.22em;color:#9C5A1E;text-transform:uppercase;">Open profile →</a>` : ''}
        </div>
      `, { closeButton: false });
    }
    if (bounds.length > 1) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 }); } catch {}
    }
  }).catch((e) => {
    clearTimeout(t);
    console.warn('[map] fetch error', e);
    setStatus('Map data unavailable');
  });
}

function scheduleBoot() {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(bootMap, { timeout: 600 });
  } else {
    setTimeout(bootMap, 250);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleBoot, { once: true });
} else {
  scheduleBoot();
}
