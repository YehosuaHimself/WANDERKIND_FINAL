/**
 * /install.html · the masterpiece install gate.
 *
 *   - Standalone check: if already installed, bounce to /
 *   - In-app browser detection (Gmail, IG, FB, etc): show top banner
 *     because those browsers can't install PWAs on iOS
 *   - Safari detection: if user is in Safari, mark step 01 "✓ done"
 *     so they jump to step 02
 *   - UA-based panel selection: auto-show iOS or Android
 *   - Pass-number counter: a stable WK-XXXX derived from
 *     localStorage so the same visitor sees the same number (gives
 *     ceremony, not deception)
 */

// @ts-check

/* ── 1. Standalone bounce ─────────────────────────────────────── */
(function detectInstalled() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {any} */ (window.navigator).standalone === true;
  if (isStandalone) location.replace('/');
})();

/* ── 2. UA detection helpers ──────────────────────────────────── */
const ua = navigator.userAgent || '';
const isIOS    = /iPad|iPhone|iPod/.test(ua);
const isAndroid = /Android/.test(ua);
const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA|FB|FBAN|FBAV|Instagram|Line\/|Twitter|Mobile.*OPR/.test(ua) && isIOS;
// Detect common in-app browsers (where PWA install is unavailable)
const isInApp =
  /FB_IAB|FBAN|FBAV|Instagram|Line\/|Twitter|GSA\b|TikTok/i.test(ua) ||
  // Gmail iOS uses Safari WebView; detect via missing Safari token + iOS
  (isIOS && !/Safari/.test(ua));

/* ── 3. In-app browser warning ────────────────────────────────── */
(function inAppBanner() {
  const banner = document.getElementById('inapp-banner');
  if (!banner) return;
  if (isInApp) {
    banner.hidden = false;
    document.documentElement.setAttribute('data-inapp', 'true');
  } else {
    banner.hidden = true;
  }
})();

/* ── 4. Tab auto-selection ────────────────────────────────────── */
(function setupTabs() {
  /** @type {HTMLButtonElement[]} */
  const tabs = Array.from(document.querySelectorAll('.gate-tab'));
  const panels = Array.from(document.querySelectorAll('.gate-tabpanel'));
  if (tabs.length === 0) return;

  const defaultTab = isAndroid ? 'android' : 'ios';
  activate(defaultTab);

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      if (target) activate(target);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = tabs.indexOf(tab);
      const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      const nextTab = tabs[next];
      if (!nextTab) return;
      nextTab.focus();
      const target = nextTab.getAttribute('data-target');
      if (target) activate(target);
    });
  }

  /** @param {string} target */
  function activate(target) {
    for (const t of tabs) {
      const isActive = t.getAttribute('data-target') === target;
      t.setAttribute('aria-selected', String(isActive));
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    for (const p of panels) {
      const isActive = p.id === `panel-${target}`;
      p.setAttribute('data-active', String(isActive));
    }
  }
})();

/* ── 5. Step 01 dim-when-done (Safari already open) ──────────── */
(function safariStepHint() {
  if (!isSafari) return;
  const step1 = document.querySelector('[data-step="ios-01"]');
  if (!step1) return;
  step1.setAttribute('data-done', 'true');
  // Also focus visual emphasis to step 02
  const step2 = document.querySelector('[data-step="ios-02"]');
  if (step2) step2.setAttribute('data-current', 'true');
})();

/* ── 6. Pass-number ticker ────────────────────────────────────── */
(function passNumber() {
  const el = document.getElementById('pass-number');
  if (!el) return;
  /** @type {string|null} */
  let stored = null;
  try { stored = localStorage.getItem('wk-visitor-pass'); } catch { /* ignore */ }
  let num = stored;
  if (!num) {
    // Pick a number in 24..947 — the first thousand isn't real yet,
    // but everyone gets THEIR own number so the page feels like an
    // embassy ledger rather than an empty hall. Deterministic per
    // visitor via crypto.getRandomValues fallback.
    const arr = new Uint16Array(1);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 65535);
    }
    const v = arr[0] ?? 0;
    num = String(24 + (v % 924)).padStart(4, '0');
    try { localStorage.setItem('wk-visitor-pass', num); } catch { /* ignore */ }
  }
  el.textContent = num;
})();
