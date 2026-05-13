/**
 * PWA standalone detection.
 *
 * When the page is loaded as the installed PWA (display-mode: standalone
 * on iOS Safari / Android Chrome), we strip any Safari-flavored hints.
 * When loaded in a regular browser tab, we surface a hint so the user
 * knows where they are.
 *
 * Sets data-pwa="standalone" or data-pwa="browser" on <html> so CSS
 * can react too.
 */

// @ts-check

(function () {
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    /** @type {any} */ (window.navigator).standalone === true;

  document.documentElement.setAttribute('data-pwa', isStandalone ? 'standalone' : 'browser');

  if (isStandalone) {
    // Hide every element marked browser-only
    document.querySelectorAll('[data-only="browser"]').forEach((el) => {
      /** @type {HTMLElement} */ (el).style.display = 'none';
    });
  } else {
    // Hide every element marked standalone-only
    document.querySelectorAll('[data-only="standalone"]').forEach((el) => {
      /** @type {HTMLElement} */ (el).style.display = 'none';
    });
  }
})();
