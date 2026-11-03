// ═══════════════════════════════════════════════════════════════════════════
// storage.js — "Saved builds" kept in the browser
// ═══════════════════════════════════════════════════════════════════════════
//
// localStorage is a small key → text store built into every browser. Data
// saved here stays on this device/browser only; it is never uploaded, and
// other websites can't read it. Think of it as a tiny per-site JSON file.
//
// We store ONE key whose value is a JSON list:
//   [ { id: 'k3j2h1', name: 'Haze gun build', state: {...} }, ... ]
//
// SECURITY: localStorage can be edited by the user (dev tools) or broken by
// a buggy older version, so whatever we read back is re-validated:
//   • names are stripped of invisible/control characters and length-capped,
//   • each state goes through sanitizeState() (see state.js),
//   • any JSON error just means "no saved builds".
// Names are later shown with textContent (see main.js), so even a name like
// "<script>" is displayed as plain text, not run.

import { sanitizeState } from './state.js';

const KEY = 'deadlock-builder.saved.v1';   // ".v1" lets us change the format later
const MAX_SAVED = 30;
const MAX_NAME = 40;

/**
 * Clean a user-typed build name: remove control characters, zero-width
 * characters and text-direction overrides (which can make text display
 * misleadingly), trim spaces, and limit the length.
 */
export function cleanName(name) {
  return String(name ?? '')   // `??` = "use '' if name is null/undefined"
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}

/** Read and validate the saved list. Never throws; returns [] on any problem. */
export function loadSaved() {
  let parsed;
  try {
    // localStorage itself can throw (e.g. disabled in some private modes).
    parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, MAX_SAVED)
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      id: typeof e.id === 'string' && /^[a-z0-9]{1,20}$/.test(e.id) ? e.id : newId(),
      name: cleanName(e.name) || 'Untitled build',
      state: sanitizeState(e.state),
    }));
}

/** Write the list. Returns false if the browser refused (storage full/disabled). */
function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Random id for a saved build, used by the Delete button.
 * crypto.getRandomValues is the browser's secure random generator
 * (like Python's `secrets` module).
 */
function newId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36)).join('');  // base-36 → short text
}

/** Add a build to the top of the list. Returns the new list, or null on failure. */
export function saveBuild(name, state) {
  const list = loadSaved();
  list.unshift({ id: newId(), name: cleanName(name) || 'Untitled build', state: sanitizeState(state) });
  return persist(list) ? list.slice(0, MAX_SAVED) : null;
}

/** Remove a build by id and return the remaining list. */
export function deleteBuild(id) {
  const list = loadSaved().filter((e) => e.id !== id);
  persist(list);
  return list;
}

export const LIMITS = Object.freeze({ MAX_NAME, MAX_SAVED });
