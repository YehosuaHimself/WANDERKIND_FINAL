/**
 * <wk-tabbar> — bottom 3-tab navigation: Map · More(hub) · Me.
 *
 * The middle tab is the "hub" — visually oversized, rising above the
 * horizontal bar like a FAB, carrying the Wanderkind W-seal as its
 * glyph. Side tabs (Me, Map) keep the compact icon+label format.
 *
 * Active state is set from location.pathname so the bar works without
 * JS upgrade; the element just adds aria-current and color cues.
 *
 * Tabs (canonical, V3 — see DOCTRINE.md):
 *   Map  → /map.html      · folded-map glyph
 *   More → /more.html     · W-seal hub (the centerpiece)
 *   Me   → /me.html       · person glyph
 */

// @ts-check

class WkTabbar extends HTMLElement {
  connectedCallback() {
    const path = location.pathname.replace(/\/$/, '') || '/';

    const meActive = path === '/me.html';
    const moreActive = path === '/more.html';
    const mapActive = path === '/map.html';

    this.setAttribute('role', 'navigation');
    this.setAttribute('aria-label', 'Primary');

    // SVGs inline so the hub seal uses currentColor (themes through
    // .wk-tab-hub's color, which is amber when active, ink otherwise).
    this.innerHTML = `
      <a href="/map.html" class="wk-tab"${mapActive ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M9 3v15M15 6v15M3 5l6-2 6 3 6-2v15l-6 2-6-3-6 2z"/>
        </svg>
        <span>Map</span>
      </a>

      <a href="/more.html" class="wk-tab wk-tab-hub"${moreActive ? ' aria-current="page"' : ''}>
        <span class="wk-tab-hub-circle" aria-hidden="true">
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <g transform="rotate(-2.2 40 40)">
              <circle cx="40" cy="40" r="37" fill="none" stroke="currentColor" stroke-width="2.4"/>
              <circle cx="40" cy="40" r="33" fill="none" stroke="currentColor" stroke-width="1.0" opacity="0.65"/>
              <path d="M 22 30 L 30 53 L 36 39 L 40 50 L 44 39 L 50 53 L 58 30"
                    fill="none" stroke="currentColor" stroke-width="3.4"
                    stroke-linecap="round" stroke-linejoin="round"/>
            </g>
          </svg>
        </span>
        <span class="wk-tab-hub-label">More</span>
      </a>

      <a href="/me.html" class="wk-tab"${meActive ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <circle cx="12" cy="9" r="3.5"/>
          <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>
        </svg>
        <span>Me</span>
      </a>
    `;
  }
}

customElements.define('wk-tabbar', WkTabbar);
