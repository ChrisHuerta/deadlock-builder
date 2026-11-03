// ═══════════════════════════════════════════════════════════════════════════
// items.js — the item list the rest of the app uses
// ═══════════════════════════════════════════════════════════════════════════
//
// The actual item data is NOT written here any more. It lives in:
//   data/manual/items.json   ← edit this (tags, descriptions, core values)
// and is merged with the latest game data by tools/update_data.py, which
// generates js/data/game-data.js. This file loads that, validates it a second
// time (defense in depth: even if a bad file slipped through, nothing
// unexpected reaches the page), and exports read-only lists.
//
// Each item: { id, name, cat: 'weapon'|'vitality'|'spirit', tier: 1-4,
//              tags: [...], desc, core: 0-3 (baseline "generally good" value),
//              from: [ids] }
//
// `from` lists the item's components (its upgrade path), e.g. Headhunter has
// from: ['headshot_booster']. It's empty for items that aren't upgrades. In
// the game, the component's cost counts toward the upgrade and the component
// is used up, so it doesn't take a slot of its own once you upgrade.

import GAME_DATA from './game-data.js';
import { TAG_LABELS } from './priorities.js';

// The three shop categories. `short` is the label on the colored badge.
// Object.freeze(...) makes an object read-only (similar to a Python tuple).
export const CATEGORIES = Object.freeze({
  weapon: { label: 'Weapon', short: 'WPN' },
  vitality: { label: 'Vitality', short: 'VIT' },
  spirit: { label: 'Spirit', short: 'SPR' },
});

// Soul cost per tier. Every item in a tier costs the same.
export const TIER_COST = Object.freeze({ 1: 800, 2: 1600, 3: 3200, 4: 6400 });

const ID_RE = /^[a-z0-9_]{1,40}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '&.:!-]{0,39}$/;

/** Return a clean frozen item, or null if anything about it is wrong. */
function validItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name, cat, tier, tags, desc, core } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
  if (!Object.hasOwn(CATEGORIES, cat)) return null;
  if (![1, 2, 3, 4].includes(tier)) return null;
  if (!Array.isArray(tags)) return null;
  return Object.freeze({
    id,
    name,
    cat,
    tier,
    tags: Object.freeze(tags.filter((t) => TAG_LABELS.has(t)).slice(0, 8)),
    desc: typeof desc === 'string' ? desc.slice(0, 300) : '',
    core: typeof core === 'number' && core >= 0 && core <= 3 ? core : 1,
    // Checked properly below, once all items are known.
    from: Array.isArray(raw.from) ? raw.from.filter((c) => typeof c === 'string' && ID_RE.test(c)).slice(0, 3) : [],
  });
}

// First pass: validate each item on its own.
const seen = new Set();
const firstPass = (Array.isArray(GAME_DATA.items) ? GAME_DATA.items : [])
  .map(validItem)
  .filter((it) => it && !seen.has(it.id) && seen.add(it.id));

// Second pass: keep only upgrade components that exist and are a LOWER tier.
// The lower-tier rule also guarantees there are no loops (A from B from A).
const tierOf = new Map(firstPass.map((it) => [it.id, it.tier]));
export const ITEMS = Object.freeze(firstPass.map((it) => Object.freeze({
  ...it,
  from: Object.freeze(it.from.filter((c) => tierOf.has(c) && tierOf.get(c) < it.tier)),
})));

/**
 * Lookup by id: ITEM_BY_ID.get('extra_health') → the item object.
 * ≈ {it.id: it for it in ITEMS} in Python. A Map is used instead of a plain
 * object because plain objects have built-in keys like "__proto__" that a
 * malicious share link could otherwise try to abuse.
 */
export const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/**
 * The reverse of `from`: component id → list of items it upgrades into.
 *   UPGRADES_INTO.get('headshot_booster') → [Headhunter]
 * Used to show "Builds into: ..." on component cards.
 */
export const UPGRADES_INTO = new Map();
for (const it of ITEMS) {
  for (const c of it.from) {
    if (!UPGRADES_INTO.has(c)) UPGRADES_INTO.set(c, []);
    UPGRADES_INTO.get(c).push(it);
  }
}

/** Where the data came from, shown in the page footer. */
export const DATA_SOURCE = typeof GAME_DATA.source === 'string' ? GAME_DATA.source.slice(0, 80) : 'unknown';
