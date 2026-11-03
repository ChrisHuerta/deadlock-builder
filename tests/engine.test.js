// ═══════════════════════════════════════════════════════════════════════════
// Automated tests — run with `npm test` (needs Node.js 18+).
// ═══════════════════════════════════════════════════════════════════════════
// Like pytest: each test(...) block is one check, and assert.* fails the test
// if something is wrong. These cover the engine (build rules), the share-link
// round trip, and that malicious/garbage input is safely rejected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBuild, allocateSlots, normalizeFocus, TOTAL_SLOTS } from '../js/engine.js';
import { defaultState, sanitizeState, encodeState, decodeState } from '../js/state.js';
import { ITEMS } from '../js/data/items.js';
import { HEROES } from '../js/data/heroes.js';
import { PRIORITIES, TAG_LABELS } from '../js/data/priorities.js';

const allIds = (b) => b.phases.flatMap((p) => p.items.map((i) => i.item.id));

test('item, hero and priority ids are unique and well-formed', () => {
  for (const list of [ITEMS, HEROES, PRIORITIES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    ids.forEach((id) => assert.match(id, /^[a-z0-9_]{1,40}$/));
  }
});

test('generated data loaded and every tag used is defined', () => {
  assert.ok(ITEMS.length > 50, 'items loaded from game-data.js');
  assert.ok(HEROES.length > 10, 'heroes loaded from game-data.js');
  for (const p of PRIORITIES) p.tags.forEach((t) => assert.ok(TAG_LABELS.has(t), `priority tag ${t} missing from tags.json`));
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
  const s = sanitizeState({ hero: 'haze', focus: { weapon: 60, spirit: 10, vitality: 30 }, priorities: ['dps', 'sustain'], plan: 'late', banned: ['glass_cannon'], counters: ['spirit', 'flying'], pinned: ['ricochet'], counterPins: ['knockdown'] });
  assert.deepEqual(decodeState('#' + encodeState(s)), s);
});

test('counters stay outside the core build and suggest sensible replacements', () => {
  const state = sanitizeState({ ...defaultState(), counters: ['weapon', 'spirit', 'vitality', 'flying'] });
  const b = generateBuild(state);
  const core = allIds(b);
  assert.equal(core.length, 12, 'core build still has 12 items');
  assert.equal(b.counters.length, 4);
  const seen = new Set();
  for (const threat of b.counters) {
    assert.ok(threat.options.length > 0 && threat.options.length <= 3, `${threat.id} has 1-3 options`);
    for (const o of threat.options) {
      assert.ok(!core.includes(o.item.id), `${o.item.name} is not already in the core build`);
      assert.ok(!seen.has(o.item.id), `${o.item.name} is not suggested for two threats`);
      seen.add(o.item.id);
      assert.ok(o.replace && core.includes(o.replace.id), 'replacement is a core build item');
    }
  }
  // The top option for different threats should replace different core items.
  const tops = b.counters.map((t) => t.options[0].replace.id);
  assert.equal(new Set(tops).size, tops.length);
});

test('a counter never replaces a more expensive item when a cheaper one exists', () => {
  const b = generateBuild(sanitizeState({ ...defaultState(), counters: ['weapon'] }));
  const coreTiers = b.phases.flatMap((p) => p.items.map((i) => i.item.tier));
  for (const o of b.counters[0].options) {
    if (coreTiers.some((t) => t <= o.item.tier)) assert.ok(o.replace.tier <= o.item.tier);
  }
});

test('banned items are never suggested as counters, and no counters by default', () => {
  assert.deepEqual(generateBuild(defaultState()).counters, []);
  const first = generateBuild(sanitizeState({ ...defaultState(), counters: ['flying'] }));
  const top = first.counters[0].options[0].item.id;
  const second = generateBuild(sanitizeState({ ...defaultState(), counters: ['flying'], banned: [top] }));
  assert.ok(!second.counters[0].options.some((o) => o.item.id === top));
});

test('every item offers up to 4 swap alternatives that are not already in the build', () => {
  const b = generateBuild(defaultState());
  const core = allIds(b);
  for (const p of b.phases.flatMap((ph) => ph.items)) {
    assert.ok(p.alternatives.length > 0 && p.alternatives.length <= 4, `${p.item.name} has 1-4 alternatives`);
    for (const a of p.alternatives) {
      assert.ok(!core.includes(a.item.id), `${a.item.name} is not already in the build`);
      assert.equal(a.item.cat, p.item.cat, 'alternative is the same category');
    }
  }
});

test('choosing a swap alternative puts exactly that item in the build', () => {
  const first = generateBuild(defaultState());
  const target = first.phases[1].items[0];             // some tier-2 item
  const choice = target.alternatives[2].item;           // not the obvious #1 pick
  const second = generateBuild(sanitizeState({ ...defaultState(), banned: [target.item.id], pinned: [choice.id] }));
  const ids = allIds(second);
  assert.ok(ids.includes(choice.id), 'chosen item is in the build');
  assert.ok(!ids.includes(target.item.id), 'swapped-out item is gone');
  assert.equal(ids.length, 12);
  assert.ok(second.phases.flatMap((ph) => ph.items).find((p) => p.item.id === choice.id).pinned);
});

test('choosing a counter alternative shows that counter', () => {
  const first = generateBuild(sanitizeState({ ...defaultState(), counters: ['spirit'] }));
  const opt = first.counters[0].options[0];
  const choice = opt.alternatives[0].item;
  const second = generateBuild(sanitizeState({ ...defaultState(), counters: ['spirit'], banned: [opt.item.id], counterPins: [choice.id] }));
  const shown = second.counters[0].options.map((o) => o.item.id);
  assert.equal(shown[0], choice.id, 'pinned counter is listed first');
  assert.ok(!shown.includes(opt.item.id));
  assert.ok(!allIds(second).includes(choice.id), 'pinned counter does not leak into the core build');
});

test('an item cannot be both excluded and pinned', () => {
  const s = sanitizeState({ ...defaultState(), banned: ['ricochet'], pinned: ['ricochet', 'glass_cannon'] });
  assert.deepEqual(s.pinned, ['glass_cannon']);
});

// Simulates a hacked share link: script tags, huge/negative/non-numeric
// numbers, prototype-pollution keys, unknown ids, and an oversized hash.
test('malicious / malformed input is rejected', () => {
  const s = decodeState('#h=<script>&w=99999&s=-5&v=abc&p=__proto__.constructor.dps&g=evil&x=toString.glass_cannon&c=__proto__.flying.lasers');
  assert.deepEqual(s.counters, ['flying']);
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
