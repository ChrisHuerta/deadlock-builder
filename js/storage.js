// Saved builds in localStorage (only on this device; nothing is sent anywhere).
// All reads are re-validated: stored data is treated as untrusted.

import { sanitizeState } from './state.js';

const KEY = 'deadlock-builder.saved.v1';
const MAX_SAVED = 30;
const MAX_NAME = 40;

export function cleanName(name) {
  return String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}

export function loadSaved() {
  let parsed;
  try {
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

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false; // storage disabled / full / private mode
  }
}

function newId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36)).join('');
}

export function saveBuild(name, state) {
  const list = loadSaved();
  list.unshift({ id: newId(), name: cleanName(name) || 'Untitled build', state: sanitizeState(state) });
  return persist(list) ? list.slice(0, MAX_SAVED) : null;
}

export function deleteBuild(id) {
  const list = loadSaved().filter((e) => e.id !== id);
  persist(list);
  return list;
}

export const LIMITS = Object.freeze({ MAX_NAME, MAX_SAVED });
