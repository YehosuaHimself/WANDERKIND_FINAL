/**
 * Session module · the single source of truth for "is this person
 * signed in?"
 *
 * On magic-link callback, Supabase redirects to /app.html with the
 * tokens in the URL hash:
 *
 *   /app.html#access_token=…&refresh_token=…&expires_in=…&type=magiclink
 *
 * We parse that, exchange the access token for the user record via
 * /auth/v1/user, persist everything to localStorage, and from then on
 * any page can call getSession() to read the cached identity.
 *
 * Tokens are stored in localStorage (not a cookie) because we use the
 * Supabase REST API directly — no httpOnly cookie flow.
 *
 * Day-4 scope: parse + persist + read + sign out. Day-5 will add
 * automatic token refresh when access_token expires.
 */

// @ts-check

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

/** localStorage key — versioned so a schema change can invalidate cleanly. */
const SESSION_KEY = 'wk-session-v1';

/**
 * @typedef {Object} WkSession
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt  - unix ms
 * @property {{id: string, email: string, user_metadata: Record<string, unknown>}} user
 */

/**
 * Load the cached session from localStorage.
 * @returns {WkSession | null}
 */
export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.accessToken || !s?.user?.id) return null;
    return /** @type {WkSession} */ (s);
  } catch {
    return null;
  }
}

/** @param {WkSession} s */
export function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Parse Supabase magic-link tokens from the current URL hash.
 *
 * Supabase emits a fragment like:
 *   #access_token=…&refresh_token=…&expires_in=3600&token_type=bearer&type=magiclink
 *
 * On error it emits:
 *   #error=…&error_code=…&error_description=…
 *
 * @returns {{access_token: string, refresh_token: string, expires_in: number} | {error: string} | null}
 */
export function parseAuthHash() {
  if (!location.hash || location.hash.length < 2) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error')) {
    return { error: params.get('error_description') || params.get('error') || 'Auth failed' };
  }
  const at = params.get('access_token');
  const rt = params.get('refresh_token');
  const ei = params.get('expires_in');
  if (at && rt && ei) {
    return { access_token: at, refresh_token: rt, expires_in: Number(ei) };
  }
  return null;
}

/**
 * Strip the auth hash from the URL — call after a successful exchange
 * so the tokens don't linger in browser history / shared links.
 */
export function clearAuthHash() {
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

/**
 * Fetch the current user from Supabase, given a known access token.
 * @param {string} accessToken
 * @returns {Promise<WkSession['user'] | null>}
 */
export async function fetchUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return {
    id: data.id,
    email: data.email,
    user_metadata: data.user_metadata || {},
  };
}

/**
 * Sign out: best-effort revoke on the server, then wipe local state.
 */
/**
 * Refresh the access token if it's within REFRESH_WINDOW_MS of expiring.
 *
 * Returns the (possibly refreshed) session, or null if we have no session
 * to refresh, or if the refresh failed (in which case the session is also
 * cleared so the next render falls through to signed-out).
 *
 * Cheap to call: if the access token has more than 5 min of life, this
 * is a no-op and returns immediately.
 *
 * @returns {Promise<WkSession | null>}
 */
export async function refreshIfNeeded() {
  const s = getSession();
  if (!s) return null;
  const remaining = s.expiresAt - Date.now();
  if (remaining > REFRESH_WINDOW_MS) return s;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    });
    if (!res.ok) {
      // Refresh token is dead — sign the user out so they re-auth.
      clearSession();
      return null;
    }
    const data = await res.json();
    if (!data?.access_token || !data?.refresh_token || !data?.expires_in) {
      clearSession();
      return null;
    }
    /** @type {WkSession} */
    const next = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata || {},
      } : s.user,
    };
    saveSession(next);
    return next;
  } catch {
    // Network failure — keep the existing session, let the next call retry.
    return s;
  }
}

/** Refresh 5 min before expiry. */
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export async function signOut() {
  const s = getSession();
  if (s?.accessToken) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s.accessToken}`,
      },
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  }
  clearSession();
}

/**
 * The full magic-link resolution flow. Returns the resolved session,
 * or null if there was nothing to resolve / it failed.
 *
 * Side effect: writes to localStorage on success.
 *
 * @returns {Promise<WkSession | {error: string} | null>}
 */
export async function resolveAuthCallback() {
  const parsed = parseAuthHash();
  if (!parsed) return null;
  if ('error' in parsed) {
    clearAuthHash();
    return { error: parsed.error };
  }
  const user = await fetchUser(parsed.access_token);
  if (!user) {
    clearAuthHash();
    return { error: 'Could not load your profile.' };
  }
  /** @type {WkSession} */
  const session = {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
    user,
  };
  saveSession(session);
  clearAuthHash();
  return session;
}
