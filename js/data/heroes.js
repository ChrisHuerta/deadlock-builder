// ═══════════════════════════════════════════════════════════════════════════
// heroes.js — the hero list the rest of the app uses
// ═══════════════════════════════════════════════════════════════════════════
//
// Hero data lives in data/manual/heroes.json (edit that) and is merged with
// the current playable-hero list by tools/update_data.py into game-data.js.
// This file validates it again and exports read-only lists.
//
// Each hero has:
//   id    – stable snake_case id used in share links
//   name  – display name
//   lean  – suggested slider values (weapon / spirit / vitality, 0-100),
//           applied when the hero is picked. engine.js normalizes them.
//   tags  – item tags that suit the hero's kit. Each matching tag on an item
//           adds +0.75 to its score (HERO_WEIGHT in engine.js), so hero tags
//           nudge the picks without overriding the user's own choices.
//
// The lean/tags values are hand-written estimates, not game data.

import GAME_DATA from './game-data.js';
import { TAG_LABELS } from './priorities.js';

const ID_RE = /^[a-z0-9_]{1,40}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '&.:!-]{0,39}$/;
const pct = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : 33);

/** Return a clean frozen hero, or null if the id/name are invalid. */
function validHero(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  if (typeof raw.name !== 'string' || !NAME_RE.test(raw.name)) return null;
  const lean = raw.lean && typeof raw.lean === 'object' ? raw.lean : {};
  return Object.freeze({
    id: raw.id,
    name: raw.name,
    lean: Object.freeze({ weapon: pct(lean.weapon), spirit: pct(lean.spirit), vitality: pct(lean.vitality) }),
    tags: Object.freeze((Array.isArray(raw.tags) ? raw.tags : []).filter((t) => TAG_LABELS.has(t)).slice(0, 8)),
  });
}

const seen = new Set();
export const HEROES = Object.freeze(
  (Array.isArray(GAME_DATA.heroes) ? GAME_DATA.heroes : [])
    .map(validHero)
    .filter((h) => h && !seen.has(h.id) && seen.add(h.id)),
);

// Lookup by id: HERO_BY_ID.get('haze') → the Haze object.
export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
