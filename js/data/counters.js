// ═══════════════════════════════════════════════════════════════════════════
// counters.js — "Counter the enemy" options
// ═══════════════════════════════════════════════════════════════════════════
//
// Edit data/manual/counters.json (then run `python tools/update_data.py
// build`). Each threat has a label, a hint, and a priority-ordered list of
// counter items with a short reason ("why"). This file re-validates that data
// and exports read-only lists, like items.js and heroes.js do.

import GAME_DATA from './game-data.js';
import { ITEM_BY_ID } from './items.js';

// Fixed threat ids and their order in the UI. Unknown ids in the data are ignored.
const THREAT_IDS = ['weapon', 'spirit', 'vitality', 'flying'];
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/;
const text = (v, max) => (typeof v === 'string' && !UNSAFE_TEXT.test(v) ? v.slice(0, max) : '');

const raw = GAME_DATA.counters && typeof GAME_DATA.counters === 'object' ? GAME_DATA.counters : {};

/** [{ id: 'flying', label, hint, items: [{ item, why }] }] in UI order. */
export const COUNTERS = Object.freeze(
  THREAT_IDS
    .filter((id) => Object.hasOwn(raw, id) && raw[id] && typeof raw[id] === 'object')
    .map((id) => {
      const entry = raw[id];
      const items = (Array.isArray(entry.items) ? entry.items : [])
        .filter((c) => c && ITEM_BY_ID.has(c.id))   // only real, validated items
        .map((c) => Object.freeze({ item: ITEM_BY_ID.get(c.id), why: text(c.why, 120) }));
      return Object.freeze({ id, label: text(entry.label, 40) || id, hint: text(entry.hint, 200), items: Object.freeze(items) });
    })
    .filter((t) => t.items.length),
);

export const COUNTER_BY_ID = new Map(COUNTERS.map((t) => [t.id, t]));
