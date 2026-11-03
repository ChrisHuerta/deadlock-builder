// ═══════════════════════════════════════════════════════════════════════════
// engine.js — the build recommendation "brain"
// ═══════════════════════════════════════════════════════════════════════════
//
// This file decides WHICH items go into a build. It has no idea a web page
// exists: it takes a plain object describing what the user wants and returns
// a plain object describing the build. That separation ("pure functions") is
// what lets the tests in tests/engine.test.js run it without a browser.
//
// The big picture, in 3 steps:
//
//  1. SPLIT THE 12 SLOTS. The Weapon/Spirit/Vitality sliders become fractions
//     that add to 1 (e.g. 60/20/20 → 0.6/0.2/0.2). Multiply by 12 slots and
//     round fairly → e.g. 7 weapon, 3 spirit, 2 vitality items.
//
//  2. PLAN THE ORDER. The "game plan" says how many items of each tier to
//     buy (e.g. 3× tier-1, 4× tier-2, 3× tier-3, 2× tier-4). We walk through
//     those slots cheapest-first and hand each one to a category, interleaving
//     categories so every focus area gets items in every phase of the game.
//
//  3. SCORE AND PICK. For each slot, every item that fits (right category and
//     tier, not already chosen, not excluded) gets a score; the highest wins.
//
//        score = core + Σ  tagWeight[tag] × 0.8^(times tag already in build)
//                     tags
//
//     tagWeight[tag] is the sum of three sources:
//        • slider focus   : 1.5 × your fraction for that category
//        • priorities     : +2   for every selected priority that lists the tag
//        • hero           : +0.75 if the hero's preset lists the tag
//
//     Two user choices override the scores:
//        • banned items (swapped out) are never considered,
//        • pinned items (picked from a Swap list) always win their slot.
//     The runner-up items for each slot are kept as that item's "Swap" choices.
//
//     Upgrade paths: many items upgrade from a cheaper "component" (Headhunter
//     from Headshot Booster). An upgrade gets +1 score when its component is
//     already in the build. When both end up in the build, the component is
//     bought early and later upgraded: its cost counts toward the upgrade and
//     it stops taking a slot, so the freed slot is filled with another item.
//     The build therefore always ends with 12 FINAL items.
//
//  4. COUNTERS (optional). For each enemy threat the user turned on, suggest
//     up to 3 situational items from data/manual/counters.json. These sit
//     OUTSIDE the 12 slots; each one names the core item to sell for it.
//
// Worked example: Haze with Weapon 60%, "Sustained DPS" selected. The tag
// fire_rate weighs 1.5×0.6 (slider) + 2 (priority) + 0.75 (hero) = 3.65,
// so Rapid Rounds (core 1.2, tags fire_rate + dps) scores about 7.5 and
// beats most other tier-1 weapon items.
//
// JS ⇄ Python cheat-sheet for this file:
//   import { X } from './y.js'   ≈  from y import X
//   export function f(a) {...}   ≈  def f(a): ...   (and make it importable)
//   const x = ...                ≈  x = ...  (but x can't be reassigned)
//   let x = ...                  ≈  x = ...  (can be reassigned)
//   (a) => a * 2                 ≈  lambda a: a * 2
//   arr.map(f) / arr.filter(f)   ≈  [f(a) for a in arr] / [a for a in arr if f(a)]
//   new Map()                    ≈  dict()   (.get / .set / .has)
//   new Set()                    ≈  set()
//   { ...obj, k: v }             ≈  {**obj, "k": v}
//   a || b                       ≈  a or b
//   x ** y                       ≈  x ** y   (same!)

import { ITEMS, ITEM_BY_ID, TIER_COST, CATEGORIES } from './data/items.js';
import { HERO_BY_ID } from './data/heroes.js';
import { PRIORITY_BY_ID, GAME_PLAN_BY_ID, TAG_LABELS } from './data/priorities.js';
import { COUNTER_BY_ID } from './data/counters.js';

// A Deadlock build has 12 item slots once all flex slots are unlocked.
export const TOTAL_SLOTS = 12;

// ['weapon', 'vitality', 'spirit'] — like list(CATEGORIES.keys()) in Python.
const CATS = Object.keys(CATEGORIES);

// "Implicit" tags for each category. Even if the user selects no priorities,
// moving the Spirit slider up should favor spirit-power/cooldown items, etc.
// 'burst' appears under both weapon and spirit because both deal burst damage.
const FOCUS_TAGS = {
  weapon: ['dps', 'fire_rate', 'ammo', 'headshot', 'burst'],
  spirit: ['spirit_power', 'cooldown', 'charges', 'duration', 'burst'],
  vitality: ['hp', 'bullet_armor', 'spirit_armor', 'regen', 'lifesteal', 'shield'],
};

// ── Tuning knobs ──────────────────────────────────────────────────────────
// These numbers control how much each input matters. They're hand-picked
// (not derived from game data), so feel free to experiment.
const PRIORITY_WEIGHT = 2;    // a selected priority is the strongest signal
const HERO_WEIGHT = 0.75;     // hero kit nudges picks but doesn't dominate
const FOCUS_WEIGHT = 1.5;     // multiplied by the slider fraction (0..1)
const TAG_DECAY = 0.8;        // each repeat of a tag is worth 80% of the last
const UPGRADE_BONUS = 1;      // upgrading something you already own is efficient

// Labels shown above each group of items. The key is the item tier.
export const PHASES = Object.freeze({
  1: { label: 'Lane phase', hint: 'Cheap stat items to win your lane and farm.' },
  2: { label: 'Early game', hint: 'Core items that define how the build plays.' },
  3: { label: 'Mid game', hint: 'Power spikes. Look for fights after these.' },
  4: { label: 'Late game', hint: 'Big-ticket items. Sell lane items to make room if needed.' },
});

/**
 * Turn slider values (any scale) into fractions that add up to 1.
 *   {weapon: 60, spirit: 20, vitality: 20} → {weapon: 0.6, spirit: 0.2, vitality: 0.2}
 * If every slider is 0, fall back to an even three-way split.
 */
export function normalizeFocus(focus) {
  // Math.max(0, x) guards against negatives; `|| 0` turns undefined into 0.
  const w = Math.max(0, focus.weapon || 0);
  const s = Math.max(0, focus.spirit || 0);
  const v = Math.max(0, focus.vitality || 0);
  const sum = w + s + v;
  if (sum === 0) return { weapon: 1 / 3, spirit: 1 / 3, vitality: 1 / 3 };
  return { weapon: w / sum, spirit: s / sum, vitality: v / sum };
}

/**
 * Split `total` slots across categories in proportion to `fractions`, using
 * the "largest remainder" method (the same one used to split parliament
 * seats). Plain rounding can produce 11 or 13 slots; this always gives 12.
 *
 * Example with 0.45 / 0.30 / 0.25 and 12 slots:
 *   exact  = 5.4 / 3.6 / 3.0
 *   floor  = 5   / 3   / 3      (11 used, 1 left over)
 *   the leftover goes to the biggest fractional part (.6 → spirit)
 *   result = 5   / 4   / 3
 */
export function allocateSlots(fractions, total = TOTAL_SLOTS) {
  const raw = CATS.map((c) => ({ c, exact: fractions[c] * total }));
  const out = {};
  let used = 0;
  for (const r of raw) {
    out[r.c] = Math.floor(r.exact);
    used += out[r.c];
  }
  raw
    // Sort by fractional part, biggest first (ties: bigger category wins).
    // JS sort takes a compare function returning negative/0/positive —
    // like Python's sorted(key=...), but written as a comparison.
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || b.exact - a.exact)
    .slice(0, total - used)          // take as many as there are leftover slots
    .forEach((r) => { out[r.c] += 1; });
  return out;
}

/**
 * Build the tag → weight table used for scoring (step 3 in the header).
 * Returns a Map like { 'spirit_power' → 2.6, 'cooldown' → 0.6, ... }.
 */
function buildTagWeights(state, fractions) {
  const w = new Map();
  // Helper: add v to the tag's current weight (like d[tag] = d.get(tag, 0) + v).
  const add = (tag, v) => w.set(tag, (w.get(tag) || 0) + v);

  // 1) Sliders: each category's implicit tags get 1.5 × that category's share.
  for (const cat of CATS) {
    for (const tag of FOCUS_TAGS[cat]) add(tag, fractions[cat] * FOCUS_WEIGHT);
  }
  // 2) Selected priorities: +2 for each tag the priority lists.
  for (const pid of state.priorities) {
    const p = PRIORITY_BY_ID.get(pid);
    if (p) p.tags.forEach((t) => add(t, PRIORITY_WEIGHT));
  }
  // 3) Hero: +0.75 for each tag in the hero's preset.
  const hero = HERO_BY_ID.get(state.hero);
  if (hero) hero.tags.forEach((t) => add(t, HERO_WEIGHT));
  return w;
}

/**
 * Score one item. `tagCounts` remembers how many times each tag already
 * appears in the build, so repeated tags give less (diminishing returns).
 *
 * Example: Extra Spirit (core 1.4, tags ['spirit_power']) in a build where
 * spirit_power has weight 2.6 and already appears twice:
 *   1.4 + 2.6 × 0.8² = 1.4 + 1.664 = 3.064
 *
 * Upgrade bonus: if the item upgrades from something already in the build
 * (e.g. Headhunter when you own Headshot Booster), add UPGRADE_BONUS. That
 * path is cheap: the component's cost counts toward it and frees a slot.
 *
 * Also returns the top 3 contributing reasons as readable text, which the
 * UI shows under each item ("Fits: spirit power, upgrade path").
 */
function scoreItem(item, tagWeights, tagCounts, chosen = new Set()) {
  let score = item.core;
  const reasons = [];
  for (const tag of item.tags) {
    const tw = tagWeights.get(tag) || 0;
    if (tw <= 0) continue;
    const v = tw * TAG_DECAY ** (tagCounts.get(tag) || 0);
    score += v;
    reasons.push({ label: TAG_LABELS.get(tag) || tag, v });
  }
  if (item.from.some((c) => chosen.has(c))) {
    score += UPGRADE_BONUS;
    reasons.push({ label: 'upgrade path', v: UPGRADE_BONUS });
  }
  reasons.sort((a, b) => b.v - a.v); // biggest contribution first
  return { score, reasons: reasons.slice(0, 3).map((r) => r.label) };
}

/**
 * Make the ordered list of slots to fill, e.g.
 *   [{tier:1, cat:'weapon'}, {tier:1, cat:'spirit'}, {tier:1, cat:'vitality'}, {tier:2, cat:'weapon'}, ...]
 *
 * Tiers come from the game plan (cheap first). For categories we want them
 * spread evenly over time rather than "all weapon items, then all spirit".
 * At each step we compute how far behind schedule each category is:
 *
 *     gap = quota × progress − already_assigned
 *
 * where progress goes from 1/12 up to 12/12. The category furthest behind
 * gets the slot. Over the 12 steps each category ends up exactly at its quota.
 */
function planSlots(quotas, tierCounts) {
  // Expand {1:3, 2:4, 3:3, 4:2} into [1,1,1,2,2,2,2,3,3,3,4,4].
  const tiers = [];
  for (const t of [1, 2, 3, 4]) for (let i = 0; i < (tierCounts[t] || 0); i++) tiers.push(t);
  const total = tiers.length;
  const assigned = { weapon: 0, spirit: 0, vitality: 0 };

  return tiers.map((tier, i) => {
    const progress = (i + 1) / total;
    let best = null;
    let bestGap = -Infinity;
    for (const c of CATS) {
      if (assigned[c] >= quotas[c]) continue; // this category is full
      const gap = quotas[c] * progress - assigned[c];
      // On a tie, prefer the category with the bigger overall quota.
      if (gap > bestGap || (gap === bestGap && quotas[c] > quotas[best])) {
        best = c;
        bestGap = gap;
      }
    }
    assigned[best] += 1;
    return { tier, cat: best };
  });
}

/**
 * Choose the best item for one slot, and remember the runners-up so the UI
 * can offer them when the user clicks "Swap".
 * If no item of the exact category+tier is left (e.g. you excluded them all
 * with "Swap"), it looks at neighbouring tiers in the same category, and only
 * as a last resort at other categories.
 */
function pickItem(slot, chosen, banned, pinned, tagWeights, tagCounts) {
  // All items of a category+tier that are still allowed.
  const available = (cat, tier) =>
    ITEMS.filter((it) => it.cat === cat && it.tier === tier && !chosen.has(it.id) && !banned.has(it.id));

  // Search order for tiers, e.g. for tier 2: [2, 3, 1, 4]. Out-of-range tiers are dropped.
  const tierOrder = [slot.tier, slot.tier + 1, slot.tier - 1, slot.tier + 2, slot.tier - 2, slot.tier + 3, slot.tier - 3]
    .filter((t) => t >= 1 && t <= 4);
  let pool = [];
  for (const t of tierOrder) {
    pool = available(slot.cat, t);
    if (pool.length) break;
  }
  if (!pool.length) {
    // flatMap ≈ [it for c in CATS for it in available(c, t)]
    for (const t of tierOrder) {
      pool = CATS.flatMap((c) => available(c, t));
      if (pool.length) break;
    }
  }
  if (!pool.length) return null; // nothing left at all

  // Score every candidate, best first. Ties are broken alphabetically so the
  // result is always the same for the same input (deterministic).
  const ranked = pool
    .map((item) => ({ item, ...scoreItem(item, tagWeights, tagCounts, chosen) })) // ≈ {"item": item, **s}
    .sort((a, b) => b.score - a.score || (a.item.name < b.item.name ? -1 : 1));

  // An item the user pinned (picked from the Swap list) always wins its slot.
  const best = ranked.find((r) => pinned.has(r.item.id)) || ranked[0];

  // The runners-up become this slot's "Swap" choices. We keep a few extra
  // because some may be picked for later slots (filtered out in generateBuild).
  const alternatives = ranked.filter((r) => r !== best).slice(0, SWAP_CHOICES + 4)
    .map((r) => ({ item: r.item, reasons: r.reasons }));
  return { ...best, pinned: pinned.has(best.item.id), alternatives };
}

// How many alternatives the Swap list shows for each item.
export const SWAP_CHOICES = 4;

// ───────────────────────── Counter items ─────────────────────────
//
// Counter items are NOT part of the 12-slot core build. For each enemy
// threat the user selects, we suggest up to COUNTER_OPTIONS items and, for
// each one, which core item to sell to make room.
//
// Which counters? data/manual/counters.json lists them in priority order
// (cheap/most reliable first). We blend that order with your focus, so a
// spirit player countering tanks sees Decay/Tankbuster before Toxic Bullets:
//
//     counterScore = (1 − position / listLength) + 0.8 × yourFocusShare[item category]
//
// What to replace? Like real players do: sell your CHEAPEST items first
// (lowest tier), and among those the one with the lowest score (least
// valuable to your build). This avoids selling core power items like a
// tier-3/4 item your build is built around.
// Within one threat, every option suggests the same kind of swap (you'd buy
// just one of them). The top option's replacement is then reserved, so the
// next threat suggests replacing a different item.

const COUNTER_OPTIONS = 3;
const COUNTER_FOCUS_WEIGHT = 0.8;

function pickReplacement(picks, reserved) {
  const pool = picks.filter((p) => !reserved.has(p.item.id));
  if (!pool.length) return null;
  // Lowest tier first; within a tier, the lowest score.
  return pool.reduce((a, b) => (b.item.tier < a.item.tier || (b.item.tier === a.item.tier && b.score < a.score) ? b : a)).item;
}

/**
 * @param picks       every item in the build, including components
 * @param finalPicks  only the items you end up holding (what can be sold)
 */
function buildCounters(state, fractions, picks, finalPicks, banned) {
  const inBuild = new Set(picks.map((p) => p.item.id));
  const used = new Set();       // counter items already suggested for another threat
  const reserved = new Set();   // core items already earmarked for replacement

  const pinned = new Set(state.counterPins);   // counters the user chose from a Swap list

  return state.counters
    .map((tid) => COUNTER_BY_ID.get(tid))
    .filter(Boolean)
    .map((threat) => {
      const n = threat.items.length;
      const alreadyHave = threat.items.filter((c) => inBuild.has(c.item.id)).map((c) => c.item);
      // Every usable counter for this threat, best first (pinned ones on top).
      const ranked = threat.items
        .map((c, idx) => ({ ...c, rank: (1 - idx / n) + COUNTER_FOCUS_WEIGHT * fractions[c.item.cat] + (pinned.has(c.item.id) ? 100 : 0) }))
        .filter((c) => !inBuild.has(c.item.id) && !banned.has(c.item.id) && !used.has(c.item.id))
        .sort((a, b) => b.rank - a.rank);
      const shown = ranked.slice(0, COUNTER_OPTIONS);
      // The rest of this threat's list is what "Swap" can offer instead.
      const spare = ranked.slice(COUNTER_OPTIONS, COUNTER_OPTIONS + SWAP_CHOICES).map((c) => ({ item: c.item, why: c.why }));
      const options = shown.map((c) => ({
        item: c.item, why: c.why, pinned: pinned.has(c.item.id),
        replace: pickReplacement(finalPicks, reserved), alternatives: spare,
      }));

      options.forEach((o) => used.add(o.item.id));
      if (options[0]?.replace) reserved.add(options[0].replace.id);
      return { id: threat.id, label: threat.label, hint: threat.hint, alreadyHave, options };
    });
}

/** Simple rule-based advice shown in the "Tips" panel. */
function buildTips(fractions, state, quotas) {
  const tips = [];
  if (fractions.spirit >= 0.45) tips.push('Spirit-heavy: spirit power and cooldown items multiply your ability damage. Prioritize them before situational picks.');
  if (fractions.weapon >= 0.45) tips.push('Gun-heavy: farm hard with your weapon early. Fire rate and ammo items stack well together.');
  if (fractions.vitality >= 0.45) tips.push('Tank-heavy: you win by staying in fights longer. Buy bullet or spirit armor based on which damage type the enemy team leans on.');
  if (quotas.vitality === 0) tips.push('No vitality items: you will be fragile. One cheap health item usually pays for itself.');
  if (!state.priorities.includes('anti_heal') && !state.counters.includes('vitality')) tips.push('If the enemy has lots of healing or lifesteal, turn on "Tanky enemies" under Counter the enemy.');
  tips.push('Your flex slots unlock as the game goes on. Late in the game, sell lane-phase items to make room for bigger upgrades.');
  return tips;
}

/**
 * MAIN ENTRY POINT — main.js calls this every time the user changes anything.
 *
 * @param state  Already-validated object (see sanitizeState in state.js):
 *   { hero: 'haze', focus: {weapon, spirit, vitality}, priorities: ['dps'],
 *     plan: 'balanced', banned: ['glass_cannon'], pinned: ['ricochet'],
 *     counters: ['flying'], counterPins: ['knockdown'] }
 * Each pick in phases[].items is { item, score, reasons, pinned, alternatives }.
 * @returns { fractions, quotas, phases: [{tier, label, hint, items}], totalCost, tips, counters }
 */
export function generateBuild(state) {
  // Step 1: sliders → fractions → slot counts per category.
  const fractions = normalizeFocus(state.focus);
  const quotas = allocateSlots(fractions);
  // Step 2 inputs: tier counts from the chosen game plan.
  const plan = GAME_PLAN_BY_ID.get(state.plan) || GAME_PLAN_BY_ID.get('balanced');
  // Step 3 inputs: scoring weights, plus the user's swaps.
  // Sets make "is this id in the list?" checks fast and simple (`.has(id)`).
  const tagWeights = buildTagWeights(state, fractions);
  const banned = new Set(state.banned);   // swapped out: never pick these
  const pinned = new Set(state.pinned);   // chosen from a Swap list: always pick these
  const chosen = new Set();      // ids already in the build
  const tagCounts = new Map();   // tag → how many chosen items have it

  // Fill each planned slot with the best-scoring (or pinned) item. After each
  // pick, record its tags so later items with the same tags score a bit less
  // (the 0.8^n diminishing returns from the header).
  const picks = [];
  const addPick = (slot) => {
    const pick = pickItem(slot, chosen, banned, pinned, tagWeights, tagCounts);
    if (!pick) return;
    chosen.add(pick.item.id);
    pick.item.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    picks.push(pick);
  };
  for (const slot of planSlots(quotas, plan.tiers)) addPick(slot);

  // Upgrade paths: when a component and its upgrade are both in the build
  // (e.g. Headshot Booster + Headhunter), you buy the component early and
  // later upgrade it. It's used up, so it no longer takes one of the 12
  // slots. Refill each freed slot with another item of the component's
  // category and tier. A refill can itself be a component of something in
  // the build, so repeat until nothing changes (bounded, to be safe).
  const refilled = new Set();
  for (let guard = 0; guard < TOTAL_SLOTS; guard++) {
    const fresh = [...findConsumed(picks).keys()].filter((c) => !refilled.has(c));
    if (!fresh.length) break;
    for (const c of fresh) {
      refilled.add(c);
      const comp = picks.find((p) => p.item.id === c).item;
      addPick({ tier: comp.tier, cat: comp.cat });
    }
  }
  const consumed = findConsumed(picks);   // component id → the upgrade item it becomes

  // Attach upgrade info to every pick, for the UI and the cost math:
  //   buildsInto     – (components) the upgrade this item turns into
  //   upgradesFrom   – (upgrades) the owned components that go into it
  //   effectiveCost  – what you actually pay: an upgrade's price minus the
  //                    components you already bought
  for (const p of picks) {
    p.buildsInto = consumed.get(p.item.id) || null;
    p.upgradesFrom = p.item.from.filter((c) => consumed.get(c) === p.item).map((c) => ITEM_BY_ID.get(c));
    p.effectiveCost = TIER_COST[p.item.tier] - p.upgradesFrom.reduce((s, c) => s + TIER_COST[c.tier], 0);
  }
  // "Final" items: what you end up holding (components are used up).
  const finalPicks = picks.filter((p) => !p.buildsInto);

  // Swap choices must not include items that ended up elsewhere in the build.
  for (const p of picks) {
    p.alternatives = p.alternatives.filter((a) => !chosen.has(a.item.id)).slice(0, SWAP_CHOICES);
  }

  // Group picks by tier for display; drop phases with no items. Components
  // stay in their phase (you still buy them then), marked "Builds into".
  const phases = [1, 2, 3, 4]
    .map((tier) => ({
      tier,
      ...PHASES[tier],
      items: picks.filter((p) => p.item.tier === tier),
    }))
    .filter((p) => p.items.length);

  // Count the final items per category (can differ from `quotas` if
  // fallbacks kicked in).
  const actual = { weapon: 0, spirit: 0, vitality: 0 };
  finalPicks.forEach((p) => { actual[p.item.cat] += 1; });

  return {
    fractions,
    quotas: actual,
    phases,
    finalCount: finalPicks.length,
    // What you actually spend: every item at its effective cost.
    // reduce ≈ sum(p.effectiveCost for p in picks)
    totalCost: picks.reduce((sum, p) => sum + p.effectiveCost, 0),
    tips: buildTips(fractions, state, actual),
    // Step 4: [{ id, label, hint, alreadyHave: [item],
    //           options: [{ item, why, replace, pinned, alternatives }] }]
    // Counters see everything you buy (so they never suggest an item you
    // already own), but only suggest selling final items, not components.
    counters: buildCounters(state, fractions, picks, finalPicks, banned),
  };
}

/**
 * Which picked components get used up by a picked upgrade?
 * Returns Map(component id → upgrade item). Upgrades are checked cheapest
 * first, and each component is used once: if Extra Health could become
 * either Fortitude or Colossus, it goes into whichever comes first and the
 * other upgrade is bought at full price.
 */
function findConsumed(picks) {
  const ids = new Set(picks.map((p) => p.item.id));
  const out = new Map();
  for (const p of [...picks].sort((a, b) => a.item.tier - b.item.tier)) {
    for (const c of p.item.from) {
      if (ids.has(c) && !out.has(c)) out.set(c, p.item);
    }
  }
  return out;
}
