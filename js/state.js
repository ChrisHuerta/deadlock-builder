// ═══════════════════════════════════════════════════════════════════════════
// state.js — what the user picked, and turning it into / out of a share link
// ═══════════════════════════════════════════════════════════════════════════
//
// "State" is one small object that fully describes the user's choices:
//
//   {
//     hero: 'haze',                                  // '' = any hero
//     focus: { weapon: 60, spirit: 10, vitality: 30 },
//     priorities: ['dps', 'sustain'],
//     plan: 'balanced',                              // or 'early' / 'late'
//     banned: ['glass_cannon'],                      // items removed with "Swap"
//     counters: ['spirit', 'flying'],                // enemy threats to counter
//   }
//
// Share links store this state in the part of the URL after '#' (the "hash"):
//   https://you.github.io/deadlock-build-maker/#h=haze&w=60&s=10&v=30&p=dps.sustain
// The hash is never sent to a server; only the browser sees it.
//
// SECURITY: anyone can craft a link with any text after '#', and browser
// storage can be edited too. So EVERYTHING from outside goes through
// sanitizeState(), which:
//   • only accepts hero/priority/plan/item ids that exist in our data
//     (an "allow-list": anything not on the list is dropped),
//   • clamps numbers to 0–100,
//   • caps list and URL lengths so a huge link can't freeze the page.
// The rest of the app can then trust the state completely.

import { ITEM_BY_ID } from './data/items.js';
import { HERO_BY_ID } from './data/heroes.js';
import { PRIORITY_BY_ID, GAME_PLAN_BY_ID } from './data/priorities.js';
import { COUNTER_BY_ID } from './data/counters.js';

const MAX_HASH_LENGTH = 2000;          // ignore absurdly long links
const MAX_LIST = 64;                   // max entries read from any list
const ID_RE = /^[a-z0-9_]{1,40}$/;     // regex: ids are lowercase letters, digits, underscores

/** The starting state for a new visitor (a function so each call gets a fresh copy). */
export function defaultState() {
  return {
    hero: '',
    focus: { weapon: 40, spirit: 30, vitality: 30 },
    priorities: [],
    plan: 'balanced',
    banned: [],
    counters: [],
  };
}

/**
 * Convert anything to a whole number between min and max.
 * Returns `fallback` if it isn't a number at all (e.g. 'abc', null).
 */
function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;   // NaN / Infinity → fallback
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Keep only strings that look like ids AND exist in `lookup`, without duplicates.
 * Lookups use Map.has(), which (unlike a plain object) can't be tricked by
 * special keys such as "__proto__" or "constructor".
 */
function cleanIdList(list, lookup) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, MAX_LIST)) {
    if (typeof raw !== 'string' || !ID_RE.test(raw) || !lookup.has(raw)) continue;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

/**
 * Build a brand-new, fully validated state from ANY input (even garbage).
 * Unknown fields are ignored; bad values fall back to the defaults.
 */
export function sanitizeState(input) {
  const d = defaultState();
  if (!input || typeof input !== 'object') return d;
  const focus = input.focus && typeof input.focus === 'object' ? input.focus : {};
  return {
    // `cond ? a : b` is JS's version of Python's `a if cond else b`.
    hero: typeof input.hero === 'string' && HERO_BY_ID.has(input.hero) ? input.hero : '',
    focus: {
      weapon: clampInt(focus.weapon, 0, 100, d.focus.weapon),
      spirit: clampInt(focus.spirit, 0, 100, d.focus.spirit),
      vitality: clampInt(focus.vitality, 0, 100, d.focus.vitality),
    },
    priorities: cleanIdList(input.priorities, PRIORITY_BY_ID),
    plan: typeof input.plan === 'string' && GAME_PLAN_BY_ID.has(input.plan) ? input.plan : d.plan,
    banned: cleanIdList(input.banned, ITEM_BY_ID),
    counters: cleanIdList(input.counters, COUNTER_BY_ID),
  };
}

/**
 * State → short URL hash text (without the '#').
 * Keys are single letters to keep links short:
 *   h=hero  w/s/v=weapon/spirit/vitality  p=priorities  g=game plan  x=excluded items
 *   c=counters
 * Lists are joined with '.' (ids never contain dots).
 * URLSearchParams handles URL-escaping, like urllib.parse.urlencode in Python.
 */
export function encodeState(state) {
  const p = new URLSearchParams();
  if (state.hero) p.set('h', state.hero);
  p.set('w', String(state.focus.weapon));
  p.set('s', String(state.focus.spirit));
  p.set('v', String(state.focus.vitality));
  if (state.priorities.length) p.set('p', state.priorities.join('.'));
  if (state.plan !== 'balanced') p.set('g', state.plan);
  if (state.banned.length) p.set('x', state.banned.join('.'));
  if (state.counters.length) p.set('c', state.counters.join('.'));
  return p.toString();
}

/**
 * URL hash → validated state. Returns null when the hash is empty or too long,
 * meaning "no shared build here, use the default".
 */
export function decodeState(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw || raw.length > MAX_HASH_LENGTH) return null;
  let p;
  try {
    p = new URLSearchParams(raw);   // ≈ urllib.parse.parse_qs
  } catch {
    return null;
  }
  // 'a.b.c' → ['a', 'b', 'c'] (filter(Boolean) drops empty strings).
  const split = (key) => (p.get(key) || '').split('.').filter(Boolean);
  // Raw values go straight into sanitizeState, which does all the checking.
  return sanitizeState({
    hero: p.get('h') || '',
    focus: { weapon: p.get('w'), spirit: p.get('s'), vitality: p.get('v') },
    priorities: split('p'),
    plan: p.get('g') || 'balanced',
    banned: split('x'),
    counters: split('c'),
  });
}
