/**
 * /map.html · live wanderkind count.
 *
 * Fetches the count of wanderkinds who have publicly opted into the map
 * AND are currently walking. Updates a small badge in the topbar. No
 * auth required — RLS allows public read of profiles where
 * show_profile_public = true AND invisibility_mode = false.
 *
 * Real markers on the canvas land in Week 1 Day 3 with geolocation.
 */

// @ts-check
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

(async function liveCount() {
  const badge = document.getElementById('walking-count');
  if (!badge) return;

  try {
    // Count walking wanderkinds via a HEAD request with `Prefer: count=exact`.
    // Returns the count in the Content-Range header — cheap, no rows shipped.
    const url = `${SUPABASE_URL}/rest/v1/profiles?is_walking=eq.true&show_profile_public=eq.true&select=id&limit=0`;
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Prefer: 'count=exact',
      },
    });

    const range = res.headers.get('content-range');
    // content-range looks like "0-0/N" or "*/0"
    const total = range ? parseInt(range.split('/')[1] || '0', 10) : 0;

    if (!Number.isFinite(total) || total === 0) {
      badge.textContent = 'Day Zero · be the first to walk';
    } else if (total === 1) {
      badge.textContent = '1 wanderkind walking now';
    } else {
      badge.textContent = `${total} wanderkinds walking now`;
    }
    badge.removeAttribute('hidden');
  } catch (err) {
    console.warn('live count fetch failed', err);
    // keep the badge hidden on error — no broken UI
  }
})();
