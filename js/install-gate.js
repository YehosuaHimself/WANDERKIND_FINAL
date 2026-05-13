/**
 * /install.html · companion script
 *   - If the page is already running as an installed PWA (display-mode:
 *     standalone OR iOS navigator.standalone), redirect to /.
 *   - Auto-select the iOS or Android tab based on UA hint.
 *   - Switch tabs on click + arrow-key navigation.
 */

// @ts-check

(function detectInstalled() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {any} */ (window.navigator).standalone === true;
  if (isStandalone) {
    // The user is already in the installed PWA — they don't need this page.
    location.replace('/');
  }
})();

(function setupTabs() {
  /** @type {HTMLButtonElement[]} */
  const tabs = Array.from(document.querySelectorAll('.gate-tab'));
  const panels = Array.from(document.querySelectorAll('.gate-tabpanel'));

  // Default to Android if the UA hints Android
  const ua = navigator.userAgent || '';
  const defaultTab = /android/i.test(ua) ? 'android' : 'ios';
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
    }
    for (const p of panels) {
      const isActive = p.id === `panel-${target}`;
      p.setAttribute('data-active', String(isActive));
    }
  }
})();
