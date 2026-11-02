import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBuild, allocateSlots, normalizeFocus, TOTAL_SLOTS } from '../js/engine.js';
import { defaultState, sanitizeState, encodeState, decodeState } from '../js/state.js';
import { ITEMS } from '../js/data/items.js';
import { HEROES } from '../js/data/heroes.js';
import { PRIORITIES } from '../js/data/priorities.js';

const allIds = (b) => b.phases.flatMap((p) => p.items.map((i) => i.item.id));

test('item, hero and priority ids are unique and well-formed', () => {
  for (const list of [ITEMS, HEROES, PRIORITIES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    ids.forEach((id) => assert.match(id, /^[a-z0-9_]{1,40}$/));
  }
});

test('slot allocation always sums to 12', () => {
  for (const f of [[100, 0, 0], [33, 33, 33], [50, 20, 30], [0, 0, 0], [5, 90, 5]]) {
    const q = allocateSlots(normalizeFocus({ weapon: f[0], spirit: f[1], vitality: f[2] }));
    assert.equal(q.weapon + q.spirit + q.vitality, TOTAL_SLOTS);
  }
});

test('builds have 12 unique items and respect focus', () => {
  const b = generateBuild(sanitizeState({ ...defaultState(), focus: { weapon: 100, spirit: 0, vitality: 0 } }));
  const ids = allIds(b);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  assert.equal(b.quotas.weapon, 12);
});

test('banned items never appear', () => {
  const first = generateBuild(defaultState());
  const banned = allIds(first).slice(0, 4);
  const second = generateBuild(sanitizeState({ ...defaultState(), banned }));
  banned.forEach((id) => assert.ok(!allIds(second).includes(id)));
});

test('share link round-trips', () => {
  const s = sanitizeState({ hero: 'haze', focus: { weapon: 60, spirit: 10, vitality: 30 }, priorities: ['dps', 'sustain'], plan: 'late', banned: ['glass_cannon'] });
  assert.deepEqual(decodeState('#' + encodeState(s)), s);
});

test('malicious / malformed input is rejected', () => {
  const s = decodeState('#h=<script>&w=99999&s=-5&v=abc&p=__proto__.constructor.dps&g=evil&x=toString.glass_cannon');
  assert.equal(s.hero, '');
  assert.equal(s.focus.weapon, 100);
  assert.equal(s.focus.spirit, 0);
  assert.equal(s.focus.vitality, defaultState().focus.vitality);
  assert.deepEqual(s.priorities, ['dps']);
  assert.equal(s.plan, 'balanced');
  assert.deepEqual(s.banned, ['glass_cannon']);
  assert.equal(decodeState('#' + 'a'.repeat(5000)), null);
  assert.deepEqual(sanitizeState(JSON.parse('{"__proto__":{"x":1},"hero":"haze"}')).hero, 'haze');
});
