/**
 * Auth-callback bypass.
 *
 * If Supabase landed the user on a page that's NOT /app.html with the
 * magic-link tokens in the URL hash (because the project's site_url or
 * the user's allow-list doesn't include /app.html), bounce them through
 * with the hash preserved so main.js can resolve the session there.
 *
 * Mounted as a module (CSP-safe) on:
 *   /install.html · /auth.html · /map.html
 *
 * /index.html does the same check inline (it has no CSP). /app.html
 * doesn't need it — main.js parses the hash directly.
 */

// @ts-check

(function () {
  if (location.hash && location.hash.indexOf('access_token=') !== -1) {
    location.replace('/app.html' + location.hash);
  }
})();
