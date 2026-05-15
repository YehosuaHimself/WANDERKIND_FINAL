// @ts-nocheck
/**
 * /js/simple-mode.js — Simple Mode toggle (EPIC 02 slice 1).
 *
 * One bit of state, in localStorage. Read on every page load to set
 * <html data-simple="true|false">. CSS uses [data-simple="true"]
 * selectors to hide non-essential UI (Crypto Matrix on /id.html,
 * "What is this?" affordances, technical readouts).
 *
 * Public API:
 *   isSimpleMode()           → boolean
 *   setSimpleMode(on)        → persists + reflects to <html>
 *   bindToggle(checkbox)     → wires a checkbox to the state
 */

const KEY = 'wk-simple-mode-v1';

export function isSimpleMode() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setSimpleMode(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  reflect();
}

export function bindToggle(input) {
  if (!input) return;
  input.checked = isSimpleMode();
  input.addEventListener('change', () => setSimpleMode(input.checked));
}

function reflect() {
  document.documentElement.setAttribute('data-simple', isSimpleMode() ? 'true' : 'false');
}

/* Reflect on every import — runs once per page load */
reflect();
