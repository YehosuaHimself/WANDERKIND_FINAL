/**
 * <wk-tabbar> — the bottom 3-tab navigation: Me · More · Map.
 *
 * Custom element (no Shadow DOM, no per-component CSS) so the bar can
 * be styled with shared tokens and printed inline by any page that
 * includes /js/wk-tabbar.js.
 *
 * The active tab is determined from location.pathname so links work
 * even with JS disabled — the component just adds aria-current="page"
 * and visual highlighting after upgrade.
 *
 * <wk-tabbar></wk-tabbar>
 *
 * Tabs (canonical, V3 — see DOCTRINE.md):
 *   Me   → /me.html
 *   More → /more.html  (Day-6+, currently inert)
 *   Map  → /map.html
 */

// @ts-check

class WkTabbar extends HTMLElement {
  connectedCallback() {
    const path = location.pathname.replace(/\/$/, '') || '/';

    /** @type {Array<{label:string, href:string, active:boolean, icon:string, inert?:boolean}>} */
    const tabs = [
      { label: 'Me',   href: '/me.html',   active: path === '/me.html',
        icon: '<circle cx="12" cy="9" r="3.5"/><path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>' },
      { label: 'More', href: '/more.html', active: path === '/more.html', inert: true,
        icon: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>' },
      { label: 'Map',  href: '/map.html',  active: path === '/map.html',
        icon: '<path d="M9 3v15M15 6v15M3 5l6-2 6 3 6-2v15l-6 2-6-3-6 2z"/>' },
    ];

    this.setAttribute('role', 'navigation');
    this.setAttribute('aria-label', 'Primary');

    this.innerHTML = tabs.map((t) => `
      <a
        href="${t.href}"
        class="wk-tab"
        ${t.active ? 'aria-current="page"' : ''}
        ${t.inert ? 'aria-disabled="true" tabindex="-1"' : ''}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">${t.icon}</svg>
        <span>${t.label}</span>
      </a>
    `).join('');
  }
}

customElements.define('wk-tabbar', WkTabbar);
