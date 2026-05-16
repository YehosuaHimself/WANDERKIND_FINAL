// @ts-nocheck

function openDrawer(host) {
  const d = document.getElementById('map-drawer');
  if (!d) return;
  const name = (host.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
  document.getElementById('drawer-eyebrow').textContent = '— Wanderkind';
  document.getElementById('drawer-name').textContent = name;
  document.getElementById('drawer-meta').textContent = (host.wanderkind_id || '') + ' · ' + (host.last_location_label || '').replace(/[<>"']/g, '');
  const offers = document.getElementById('drawer-offers');
  offers.innerHTML = '';
  const arr = Array.isArray(host.host_offers) ? host.host_offers : [];
  for (const o of arr) {
    const span = document.createElement('span');
    span.className = 'map-drawer-offer';
    span.textContent = o;
    offers.appendChild(span);
  }
  const knock = document.getElementById('drawer-knock');
  if (knock && host.wanderkind_id) knock.href = '/u/?wkid=' + host.wanderkind_id + '#knock';
  const pass = document.getElementById('drawer-pass');
  if (pass && host.wanderkind_id) pass.href = '/u/?wkid=' + host.wanderkind_id;
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  const d = document.getElementById('map-drawer');
  if (!d) return;
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
}

/* Map clicks outside the drawer close it */
document.addEventListener('click', (e) => {
  const d = document.getElementById('map-drawer');
  if (!d) return;
  if (e.target.closest('.map-drawer')) return;
  if (e.target.closest('.wk-pin')) return;
  if (e.target.closest('.wk-walker')) return;
  if (d.classList.contains('open')) closeDrawer();
});

/* Wire the visibility toggle */
document.addEventListener('DOMContentLoaded', () => {
  const pill = document.getElementById('map-visible-pill');
  if (!pill) return;
  /* Read profile.show_on_map once */
  try {
    const session = JSON.parse(localStorage.getItem('wk-session-v1') || 'null');
    if (!session) return;
    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=show_on_map`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.accessToken }
    }).then(r => r.json()).then(rows => {
      const visible = rows && rows[0] && rows[0].show_on_map;
      pill.setAttribute('aria-pressed', visible ? 'true' : 'false');
      pill.textContent = visible ? 'Visible' : 'Invisible';
    });
    pill.addEventListener('click', async () => {
      const wasOn = pill.getAttribute('aria-pressed') === 'true';
      const next = !wasOn;
      pill.setAttribute('aria-pressed', next ? 'true' : 'false');
      pill.textContent = next ? 'Visible' : 'Invisible';
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + session.accessToken,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ show_on_map: next }),
        });
      } catch {}
    });
  } catch {}
});


// @ts-nocheck
/**
 * /js/map-boot.js — the Wanderkind Map (v2).
 *
 * Old paper meets Marauder's Map.
 *
 *   • CartoDB Positron (no labels) tile layer, sepia-filtered for aged feel
 *   • Region labels (states / cantons only, no country names) from
 *     /js/region-labels.js
 *   • Eight pin classes: host-bed, host-bed-food, host-food, host-water,
 *     church, mountain, festival, wifi, water-fountain, bakery, walker (self),
 *     walker (other).
 *   • Other walkers smoothly transition to new positions every 30s while the
 *     tab is visible; footprint trail of last 3 positions fades behind them.
 *   • Lazy boot · 4s fetch timeout · tiles always render · never blocks app.
 *
 * No third-party JS beyond the self-hosted Leaflet under /js/vendor.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { REGIONS } from './region-labels.js';

const TIMEOUT_MS = 4000;
const WALKER_POLL_MS = 30000;
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

const state = {
  map: null,
  myId: '',
  hostLayer: null,
  poiLayer: null,
  walkerLayer: null,
  regionLayer: null,
  walkerMarkers: new Map(),
  walkerTrails: new Map(),
  filters: new Set(['beds', 'food', 'water', 'churches', 'mountains', 'festivals', 'walkers']),
};

function $(s) { return document.querySelector(s); }
function setStatus(t) { const el = $('.map-status'); if (el) el.textContent = t; }
function showEmpty() { const s = $('.empty-pill'); if (s) s.hidden = false; }
function hideEmpty() { const s = $('.empty-pill'); if (s) s.hidden = true; }

/* ─── glyph icons ─────────────────────────────────────────────────
 * Eight icon classes. All inline SVG inside a Leaflet divIcon so the
 * stroke + fill come from CSS, themed by the cream/amber/ink system.
 * ───────────────────────────────────────────────────────────────── */
const GLYPH = {
  'host-bed': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 L12 4 L20 11 V20 H4 Z"/><path d="M10 20v-5h4v5"/></svg>`,
  'host-bed-food': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 L12 4 L20 11 V20 H4 Z"/><circle cx="12" cy="15" r="2.6" fill="currentColor" fill-opacity="0.35"/></svg>`,
  'host-food': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v8a2 2 0 0 0 2 2v6M9 4v8M18 4l-2 6c0 1.5 1 2 2 2v6"/></svg>`,
  'host-water': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L7 11 a6 6 0 0 0 10 0 L12 3 Z"/></svg>`,
  'church': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 v6 M10 5 h4 M5 11 L12 7 L19 11 V21 H5 Z"/><rect x="10" y="15" width="4" height="6"/></svg>`,
  'mountain': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L9 8 L13 14 L16 10 L21 20 Z"/><path d="M8 12 L9.5 10 L11 11 Z" fill="currentColor"/></svg>`,
  'festival': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21 V4 L18 8 L6 12"/><circle cx="6" cy="3" r="0.8" fill="currentColor"/></svg>`,
  'wifi': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9 a16 16 0 0 1 20 0 M5 13 a11 11 0 0 1 14 0 M8 17 a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="0.8" fill="currentColor"/></svg>`,
  'water-fountain': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 v6 M8 7 c1 -2 3 -2 4 -2 s3 0 4 2 M6 13 h12 v8 H6 Z"/></svg>`,
  'bakery': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 c0 -4 4 -7 8 -7 s8 3 8 7 v3 H4 Z M8 13 v3 M12 13 v3 M16 13 v3"/></svg>`,
};

/* Marker class → glyph + colour family */
const PIN_THEME = {
  'host-bed':       { glyph: 'host-bed',       color: 'var(--wk-amber)',      ring: 'var(--wk-amber-press)' },
  'host-bed-food':  { glyph: 'host-bed-food',  color: 'var(--wk-amber)',      ring: 'var(--wk-amber-press)' },
  'host-food':      { glyph: 'host-food',      color: '#A0522D',              ring: '#7A3E20' },
  'host-water':     { glyph: 'host-water',     color: '#4CA8C9',              ring: '#2E7997' },
  'church':         { glyph: 'church',         color: '#5A4632',              ring: '#3A2D1F' },
  'mountain':       { glyph: 'mountain',       color: '#5C6B40',              ring: '#3D4828' },
  'festival':       { glyph: 'festival',       color: '#9C2E5C',              ring: '#6A1E3F' },
  'wifi':           { glyph: 'wifi',           color: '#8A7250',              ring: '#5A4632' },
  'water-fountain': { glyph: 'water-fountain', color: '#4CA8C9',              ring: '#2E7997' },
  'bakery':         { glyph: 'bakery',         color: '#B5651D',              ring: '#7C420E' },
};

function makeIcon(kind, opts = {}) {
  const t = PIN_THEME[kind];
  if (!t) return null;
  const size = opts.size || 28;
  const ring = opts.large ? 'box-shadow: 0 0 0 1.5px var(--wk-bg), 0 0 0 2.5px ' + t.ring + ';' : '';
  return L.divIcon({
    className: 'wk-pin',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    html: `
      <span class="wk-pin-bg" style="
        display: grid; place-items: center;
        width: ${size}px; height: ${size}px;
        border-radius: 50%;
        background: var(--wk-bg);
        color: ${t.color};
        box-shadow: 0 0 0 1.5px ${t.color}, 0 1px 2px rgba(11,7,5,0.18);
        ${ring}
      ">
        <span style="display:block;width:${Math.round(size*0.65)}px;height:${Math.round(size*0.65)}px;">${GLYPH[t.glyph]}</span>
      </span>`,
  });
}

function makeWalkerIcon(isSelf, walking) {
  const color = isSelf ? 'var(--wk-amber)' : 'var(--wk-amber-text)';
  const halo = isSelf
    ? 'box-shadow: 0 0 0 2px var(--wk-bg), 0 0 0 3.5px var(--wk-amber), 0 0 16px rgba(200,118,42,0.45);'
    : 'box-shadow: 0 0 0 2px var(--wk-bg), 0 0 0 3px rgba(200,118,42,0.55);';
  return L.divIcon({
    className: 'wk-walker' + (walking ? ' wk-walker--walking' : '') + (isSelf ? ' wk-walker--self' : ''),
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<span class="wk-walker-dot" style="
      display: block; width: 12px; height: 12px;
      border-radius: 50%;
      background: ${color};
      ${halo}
    "></span>`,
  });
}

function makeFootprintIcon(opacity) {
  return L.divIcon({
    className: 'wk-footprint',
    iconSize: [8, 8],
    iconAnchor: [4, 4],
    html: `<span style="
      display:block;width:6px;height:6px;border-radius:50%;
      background: var(--wk-amber-text);
      opacity: ${opacity};
    "></span>`,
  });
}

/* ─── boot ─────────────────────────────────────────────────────── */
async function fetchHosts(signal) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?show_on_map=eq.true&lat=not.is.null&lng=not.is.null&select=id,trail_name,wanderkind_id,lat,lng,host_offers&limit=300`;
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY }, signal });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function fetchWalkers(signal) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?show_on_map=eq.true&is_walking=eq.true&lat=not.is.null&lng=not.is.null&select=id,trail_name,wanderkind_id,lat,lng,last_seen&limit=200`;
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY }, signal });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function placeRegionLabels(map) {
  /* Zoom-aware: large regions visible at every zoom, smaller ones reveal
     as the user zooms in. Prevents the Alps from becoming a label soup. */
  const allMarkers = []; // [{ marker, weight }]
  const layer = L.layerGroup();

  for (const r of REGIONS) {
    const size = r.weight === 3 ? 14 : r.weight === 2 ? 11 : 10;
    const op = r.weight === 3 ? 0.55 : r.weight === 2 ? 0.42 : 0.32;
    const icon = L.divIcon({
      className: 'wk-region-label',
      iconSize: [200, 16],
      iconAnchor: [100, 8],
      html: `<span style="
        display: block; text-align: center;
        font-family: 'Courier New', monospace;
        font-size: ${size}px; letter-spacing: 0.30em;
        color: #3A2D1F; opacity: ${op};
        text-transform: uppercase;
        text-shadow: 0 0 4px rgba(246,237,216,0.95), 0 0 2px rgba(246,237,216,0.95);
        pointer-events: none;
        white-space: nowrap;
      ">${r.name}</span>`,
    });
    const m = L.marker([r.lat, r.lng], { icon, interactive: false, keyboard: false });
    allMarkers.push({ marker: m, weight: r.weight });
  }

  function applyVisibility() {
    const z = map.getZoom();
    /* zoom < 6: only weight 3 (large countries/regions)
       6 - 7: weight 3 + 2
       ≥ 8:  all */
    const threshold = z < 6 ? 3 : z < 8 ? 2 : 1;
    layer.clearLayers();
    for (const { marker, weight } of allMarkers) {
      if (weight >= threshold) layer.addLayer(marker);
    }
  }
  map.on('zoomend', applyVisibility);
  applyVisibility();
  return layer;
}

function isVisible(kind) {
  if (kind.startsWith('host-bed')) return state.filters.has('beds');
  if (kind === 'host-food') return state.filters.has('food');
  if (kind === 'host-water') return state.filters.has('water');
  if (kind === 'church') return state.filters.has('churches');
  if (kind === 'mountain') return state.filters.has('mountains');
  if (kind === 'festival') return state.filters.has('festivals');
  return true;
}

function hostKindFromOffers(offers) {
  /* host_offers is jsonb on profiles. Shape examples:
     ['bed', 'food'], ['bed'], ['food'], ['water'], null/undefined.
     Falls back to 'host-bed' for legacy rows. */
  const a = Array.isArray(offers) ? offers : [];
  const hasBed   = a.includes('bed') || a.includes('accommodation');
  const hasFood  = a.includes('food') || a.includes('meal');
  const hasWater = a.includes('water');
  if (hasBed && hasFood) return 'host-bed-food';
  if (hasBed)            return 'host-bed';
  if (hasFood)           return 'host-food';
  if (hasWater)          return 'host-water';
  return 'host-bed';
}

function renderHostsAndPoi(rows) {
  if (state.hostLayer) state.map.removeLayer(state.hostLayer);
  state.hostLayer = L.layerGroup();
  if (!rows.length) return;

  for (const p of rows) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    const kind = hostKindFromOffers(p.host_offers);
    if (!isVisible(kind)) continue;
    const icon = makeIcon(kind, { size: 28, large: true });
    if (!icon) continue;
    const name = (p.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
    const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: 500 });
    m.bindPopup(popupHTML(name, p.wanderkind_id, kindLabel(kind)));
    m.addTo(state.hostLayer);
  }
  state.hostLayer.addTo(state.map);
}

function kindLabel(kind) {
  return {
    'host-bed':       'Bed',
    'host-bed-food':  'Bed · Food',
    'host-food':      'Food only',
    'host-water':     'Water only',
    'church':         'Church',
    'mountain':       'Mountain',
    'festival':       'Festival',
    'wifi':           'WiFi',
    'water-fountain': 'Water fountain',
    'bakery':         'Bakery',
  }[kind] || '';
}

function popupHTML(name, wkid, sub) {
  return `
    <div style="font-family:'Helvetica Neue',sans-serif;font-size:13px;color:#1A120A;min-width:140px;">
      <div style="font-weight:700;margin-bottom:4px;">${name}</div>
      ${sub ? `<div style="font-family:'Courier New',monospace;font-size:9.5px;letter-spacing:0.22em;color:#9C5A1E;text-transform:uppercase;margin-bottom:6px;">${sub}</div>` : ''}
      ${wkid ? `<a href="/u/${wkid}" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.22em;color:#9C5A1E;text-transform:uppercase;text-decoration:none;">Open profile →</a>` : ''}
    </div>`;
}

function renderWalkers(rows) {
  if (!state.walkerLayer) {
    state.walkerLayer = L.layerGroup().addTo(state.map);
  }
  if (!state.filters.has('walkers')) {
    state.walkerMarkers.forEach((m) => state.walkerLayer.removeLayer(m));
    state.walkerMarkers.clear();
    return;
  }

  const seen = new Set();
  for (const w of rows) {
    if (typeof w.lat !== 'number' || typeof w.lng !== 'number') continue;
    seen.add(w.id);
    const existing = state.walkerMarkers.get(w.id);
    if (existing) {
      // Smoothly transition to new position; record previous as footprint
      const prev = existing.getLatLng();
      addFootprint(w.id, prev);
      existing.setLatLng([w.lat, w.lng]);
    } else {
      const isSelf = w.id === state.myId;
      const marker = L.marker([w.lat, w.lng], {
        icon: makeWalkerIcon(isSelf, true),
        zIndexOffset: 800,
        keyboard: false,
      });
      const name = (w.trail_name || 'Wanderkind').replace(/[<>"']/g, '');
      marker.on('click', () => openDrawer(p));
      marker.bindPopup(popupHTML(name + (isSelf ? ' · you' : ''), w.wanderkind_id, isSelf ? 'On the road' : 'Walking now'));
      marker.addTo(state.walkerLayer);
      state.walkerMarkers.set(w.id, marker);
    }
  }
  // Remove markers for walkers no longer present
  state.walkerMarkers.forEach((m, id) => {
    if (!seen.has(id)) {
      state.walkerLayer.removeLayer(m);
      state.walkerMarkers.delete(id);
      const trail = state.walkerTrails.get(id);
      if (trail) {
        trail.forEach(fp => state.walkerLayer.removeLayer(fp));
        state.walkerTrails.delete(id);
      }
    }
  });
}

function addFootprint(id, latlng) {
  const trail = state.walkerTrails.get(id) || [];
  // Cap trail at 3 fading prints
  if (trail.length >= 3) {
    const oldest = trail.shift();
    state.walkerLayer.removeLayer(oldest);
  }
  // Fade existing trail
  for (let i = 0; i < trail.length; i++) {
    const op = [0.32, 0.20, 0.12][i] || 0.10;
    trail[i].setIcon(makeFootprintIcon(op));
  }
  const fp = L.marker(latlng, {
    icon: makeFootprintIcon(0.5),
    interactive: false, keyboard: false,
    zIndexOffset: -100,
  });
  fp.addTo(state.walkerLayer);
  trail.push(fp);
  state.walkerTrails.set(id, trail);
}

function wireFilterChips() {
  const chips = document.querySelectorAll('.filter-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.host;
      if (!key) return;
      if (state.filters.has(key)) { state.filters.delete(key); chip.setAttribute('aria-pressed', 'false'); }
      else { state.filters.add(key); chip.setAttribute('aria-pressed', 'true'); }
      // Re-render
      if (state.hostsCache) renderHostsAndPoi(state.hostsCache);
      if (state.walkersCache) renderWalkers(state.walkersCache);
    });
    // Initial pressed state
    if (state.filters.has(chip.dataset.host)) chip.setAttribute('aria-pressed', 'true');
  });
}

async function bootMap() {
  const host = document.getElementById('map');
  if (!host) return;

  if (typeof L === 'undefined') {
    setStatus('Map unavailable'); showEmpty(); host.hidden = true; return;
  }
  host.hidden = false;
  host.removeAttribute('aria-hidden');

  try {
    state.map = L.map(host, {
      center: [47.4, 10.8],
      zoom: 6,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      preferCanvas: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    L.tileLayer(TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 17,
      minZoom: 4,
      className: 'wk-tiles',
    }).addTo(state.map);
  } catch (e) {
    console.warn('[map] boot failed', e);
    setStatus('Map unavailable'); showEmpty(); host.hidden = true; return;
  }

  // Region labels — always visible, no fetch needed
  state.regionLayer = placeRegionLabels(state.map).addTo(state.map);

  wireFilterChips();

  setStatus('Loading doors…');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);

  // Try to resolve own user id (best-effort)
  try {
    const raw = localStorage.getItem('wk-session-v1');
    if (raw) state.myId = JSON.parse(raw)?.user?.id || '';
  } catch {}

  fetchHosts(ac.signal).then((rows) => {
    clearTimeout(t);
    state.hostsCache = rows;
    if (rows.length === 0) {
      setStatus('0 doors so far'); showEmpty();
    } else {
      hideEmpty();
      setStatus(`${rows.length} ${rows.length === 1 ? 'door' : 'doors'}`);
      renderHostsAndPoi(rows);
    }
  }).catch(() => {
    clearTimeout(t);
    setStatus('Map data unavailable');
  });

  // Start walker polling (every 30s while visible)
  pollWalkers();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollWalkers();
  });
  setInterval(() => {
    if (!document.hidden) pollWalkers();
  }, WALKER_POLL_MS);
}

async function pollWalkers() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const rows = await fetchWalkers(ac.signal);
  clearTimeout(t);
  state.walkersCache = rows;
  renderWalkers(rows);
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
