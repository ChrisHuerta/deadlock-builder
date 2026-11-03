// ═══════════════════════════════════════════════════════════════════════════
// priorities.js — the "tag" vocabulary, playstyle priorities and game plans
// ═══════════════════════════════════════════════════════════════════════════
//
// TAGS are the glue of the whole system. Items, heroes and priorities all
// describe themselves with the same keywords (e.g. 'lifesteal', 'cc'):
//
//   item   Leech         tags: lifesteal, spirit_power, hp
//   hero   Abrams        tags: melee, close, lifesteal, hp, cc
//   prio   "Healing..."  tags: lifesteal, regen
//
// The engine scores an item by adding up the weights of its tags, so an item
// whose tags match what you selected scores higher. See engine.js.

import GAME_DATA from './game-data.js';

// Every valid tag → the readable text shown in "Fits: ..." on item cards.
// The list itself is in data/manual/tags.json; to add a tag, add it there
// and run `python tools/update_data.py build`.
// A Map (not a plain object) so lookups can't hit built-in keys like "__proto__".
export const TAG_LABELS = new Map(
  Object.entries(GAME_DATA.tags && typeof GAME_DATA.tags === 'object' ? GAME_DATA.tags : {})
    .filter(([tag, label]) => /^[a-z0-9_]{1,40}$/.test(tag) && typeof label === 'string')
    .map(([tag, label]) => [tag, label.slice(0, 40)]),
);

// The chips under "3. Playstyle priorities". Selecting one adds +2
// (PRIORITY_WEIGHT in engine.js) to each listed tag's weight.
export const PRIORITIES = Object.freeze([
  { id: 'dps', label: 'Sustained DPS', tags: ['dps', 'fire_rate', 'ammo'] },
  { id: 'burst', label: 'Burst damage', tags: ['burst'] },
  { id: 'headshots', label: 'Headshots / precision', tags: ['headshot', 'range'] },
  { id: 'abilities', label: 'Ability spam', tags: ['cooldown', 'charges', 'duration'] },
  { id: 'spirit', label: 'Spirit scaling', tags: ['spirit_power'] },
  { id: 'tank', label: 'Tankiness', tags: ['hp', 'shield', 'bullet_armor', 'spirit_armor'] },
  { id: 'sustain', label: 'Healing & lifesteal', tags: ['lifesteal', 'regen'] },
  { id: 'mobility', label: 'Mobility', tags: ['mobility', 'stamina'] },
  { id: 'escape', label: 'Escape tools', tags: ['escape', 'cleanse'] },
  { id: 'cc', label: 'Crowd control', tags: ['cc', 'debuff'] },
  { id: 'anti_heal', label: 'Anti-heal', tags: ['anti_heal'] },
  { id: 'anti_tank', label: 'Shred tanks', tags: ['anti_tank', 'debuff'] },
  { id: 'team', label: 'Team support', tags: ['team'] },
  { id: 'melee', label: 'Melee', tags: ['melee', 'close'] },
  { id: 'vs_guns', label: 'Counter gun heroes', tags: ['bullet_armor'] },
  { id: 'vs_spirit', label: 'Counter spirit heroes', tags: ['spirit_armor', 'cleanse'] },
  { id: 'farm', label: 'Fast farming', tags: ['farm', 'ammo'] },
]);

export const PRIORITY_BY_ID = new Map(PRIORITIES.map((p) => [p.id, p]));

// "4. Game plan": how many items of each tier end up in the 12-slot build.
// Each `tiers` object must add up to 12. Early aggression buys more cheap
// items (spike sooner); late scaling saves up for more expensive items.
export const GAME_PLANS = Object.freeze([
  { id: 'balanced', label: 'Balanced', tiers: { 1: 3, 2: 4, 3: 3, 4: 2 } },
  { id: 'early', label: 'Early aggression', tiers: { 1: 4, 2: 5, 3: 2, 4: 1 } },
  { id: 'late', label: 'Late-game scaling', tiers: { 1: 2, 2: 3, 3: 4, 4: 3 } },
]);

export const GAME_PLAN_BY_ID = new Map(GAME_PLANS.map((g) => [g.id, g]));
