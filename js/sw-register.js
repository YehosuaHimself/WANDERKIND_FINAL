/**
 * Service Worker registration.
 *
 * Strategy: register at load, then on each launch fetch /version.json
 * (cache-busted) and compare against the SW's version. If the live build
 * has moved on, we tell the SW to skipWaiting + reload — the user lands
 * on the new bundle automatically.
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Probe /version.json with no-store. If the deployed bundle differs
      // from what the SW thinks, force update + reload.
      const localVer = await fetchLocalVersion();
      const liveVer  = await fetchLiveVersion();
      if (localVer && liveVer && localVer !== liveVer) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        location.reload();
      }
    } catch (err) {
      // Failure here is non-fatal — the app still works without SW.
      console.warn('[sw] register failed:', err);
    }
  });
}

async function fetchLiveVersion() {
  try {
    const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return v?.bundle || null;
  } catch {
    return null;
  }
}

async function fetchLocalVersion() {
  // SW's version is hardcoded in sw.js; on first install we have none locally.
  // Read from localStorage if we cached it previously.
  return localStorage.getItem('wk-sw-version');
}
