// App state + (de)serialization for share links and saved builds.
//
// SECURITY: Everything that comes from outside the code (URL hash,
// localStorage) is treated as untrusted. `sanitizeState` accepts only known
// ids from allow-lists and clamps numbers, so nothing unexpected can reach
// the engine or the DOM.

import { ITEM_BY_ID } from './data/items.js';
import { HERO_BY_ID } from './data/heroes.js';
import { PRIORITY_BY_ID, GAME_PLAN_BY_ID } from './data/priorities.js';

const MAX_HASH_LENGTH = 2000;
const MAX_LIST = 64;
const ID_RE = /^[a-z0-9_]{1,40}$/;

export function defaultState() {
  return {
    hero: '',
    focus: { weapon: 40, spirit: 30, vitality: 30 },
    priorities: [],
    plan: 'balanced',
    banned: [],
  };
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanIdList(list, lookup) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, MAX_LIST)) {
    if (typeof raw !== 'string' || !ID_RE.test(raw) || !lookup.has(raw)) continue;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

/** Returns a brand-new, fully validated state object from arbitrary input. */
export function sanitizeState(input) {
  const d = defaultState();
  if (!input || typeof input !== 'object') return d;
  const focus = input.focus && typeof input.focus === 'object' ? input.focus : {};
  return {
    hero: typeof input.hero === 'string' && HERO_BY_ID.has(input.hero) ? input.hero : '',
    focus: {
      weapon: clampInt(focus.weapon, 0, 100, d.focus.weapon),
      spirit: clampInt(focus.spirit, 0, 100, d.focus.spirit),
      vitality: clampInt(focus.vitality, 0, 100, d.focus.vitality),
    },
    priorities: cleanIdList(input.priorities, PRIORITY_BY_ID),
    plan: typeof input.plan === 'string' && GAME_PLAN_BY_ID.has(input.plan) ? input.plan : d.plan,
    banned: cleanIdList(input.banned, ITEM_BY_ID),
  };
}

/** State → compact URL hash (without the leading '#'). */
export function encodeState(state) {
  const p = new URLSearchParams();
  if (state.hero) p.set('h', state.hero);
  p.set('w', String(state.focus.weapon));
  p.set('s', String(state.focus.spirit));
  p.set('v', String(state.focus.vitality));
  if (state.priorities.length) p.set('p', state.priorities.join('.'));
  if (state.plan !== 'balanced') p.set('g', state.plan);
  if (state.banned.length) p.set('x', state.banned.join('.'));
  return p.toString();
}

/** URL hash → sanitized state, or null if there is nothing usable. */
export function decodeState(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw || raw.length > MAX_HASH_LENGTH) return null;
  let p;
  try {
    p = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const split = (key) => (p.get(key) || '').split('.').filter(Boolean);
  return sanitizeState({
    hero: p.get('h') || '',
    focus: { weapon: p.get('w'), spirit: p.get('s'), vitality: p.get('v') },
    priorities: split('p'),
    plan: p.get('g') || 'balanced',
    banned: split('x'),
  });
}
