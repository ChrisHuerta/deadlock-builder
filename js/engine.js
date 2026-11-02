// Build recommendation engine. Pure functions, no DOM access — easy to test.
//
// How it works:
//  1. The weapon/spirit/vitality sliders are normalized into fractions and the
//     12 item slots are split between categories (largest-remainder method).
//  2. The game plan decides how many items of each tier the build has. Slots
//     are filled in tier order, and categories are interleaved so every focus
//     area gets items in every phase of the game.
//  3. Each candidate item is scored: baseline `core` value + weight of each of
//     its tags. Tag weights come from the sliders (implicit), the selected
//     priorities (strong) and the hero (mild). Repeated tags decay so the
//     build stays varied.

import { ITEMS, TIER_COST, CATEGORIES } from './data/items.js';
import { HERO_BY_ID } from './data/heroes.js';
import { PRIORITY_BY_ID, GAME_PLAN_BY_ID, TAG_LABELS } from './data/priorities.js';

export const TOTAL_SLOTS = 12;
const CATS = Object.keys(CATEGORIES);

const FOCUS_TAGS = {
  weapon: ['dps', 'fire_rate', 'ammo', 'headshot', 'burst'],
  spirit: ['spirit_power', 'cooldown', 'charges', 'duration', 'burst'],
  vitality: ['hp', 'bullet_armor', 'spirit_armor', 'regen', 'lifesteal', 'shield'],
};

const PRIORITY_WEIGHT = 2;
const HERO_WEIGHT = 0.75;
const FOCUS_WEIGHT = 1.5;
const TAG_DECAY = 0.8;

export const PHASES = Object.freeze({
  1: { label: 'Lane phase', hint: 'Cheap stat items to win your lane and farm.' },
  2: { label: 'Early game', hint: 'Core items that define how the build plays.' },
  3: { label: 'Mid game', hint: 'Power spikes. Look for fights after these.' },
  4: { label: 'Late game', hint: 'Big-ticket items. Sell lane items to make room if needed.' },
});

export function normalizeFocus(focus) {
  const w = Math.max(0, focus.weapon || 0);
  const s = Math.max(0, focus.spirit || 0);
  const v = Math.max(0, focus.vitality || 0);
  const sum = w + s + v;
  if (sum === 0) return { weapon: 1 / 3, spirit: 1 / 3, vitality: 1 / 3 };
  return { weapon: w / sum, spirit: s / sum, vitality: v / sum };
}

/** Split `total` slots across categories proportional to `fractions`. */
export function allocateSlots(fractions, total = TOTAL_SLOTS) {
  const raw = CATS.map((c) => ({ c, exact: fractions[c] * total }));
  const out = {};
  let used = 0;
  for (const r of raw) {
    out[r.c] = Math.floor(r.exact);
    used += out[r.c];
  }
  raw
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || b.exact - a.exact)
    .slice(0, total - used)
    .forEach((r) => { out[r.c] += 1; });
  return out;
}

function buildTagWeights(state, fractions) {
  const w = new Map();
  const add = (tag, v) => w.set(tag, (w.get(tag) || 0) + v);

  for (const cat of CATS) {
    for (const tag of FOCUS_TAGS[cat]) add(tag, fractions[cat] * FOCUS_WEIGHT);
  }
  for (const pid of state.priorities) {
    const p = PRIORITY_BY_ID.get(pid);
    if (p) p.tags.forEach((t) => add(t, PRIORITY_WEIGHT));
  }
  const hero = HERO_BY_ID.get(state.hero);
  if (hero) hero.tags.forEach((t) => add(t, HERO_WEIGHT));
  return w;
}

function scoreItem(item, tagWeights, tagCounts) {
  let score = item.core;
  const reasons = [];
  for (const tag of item.tags) {
    const tw = tagWeights.get(tag) || 0;
    if (tw <= 0) continue;
    const v = tw * TAG_DECAY ** (tagCounts.get(tag) || 0);
    score += v;
    reasons.push({ tag, v });
  }
  reasons.sort((a, b) => b.v - a.v);
  return { score, reasons: reasons.slice(0, 3).map((r) => TAG_LABELS[r.tag] || r.tag) };
}

/** Ordered list of {tier, cat} slots that interleaves categories over time. */
function planSlots(quotas, tierCounts) {
  const tiers = [];
  for (const t of [1, 2, 3, 4]) for (let i = 0; i < (tierCounts[t] || 0); i++) tiers.push(t);
  const total = tiers.length;
  const assigned = { weapon: 0, spirit: 0, vitality: 0 };

  return tiers.map((tier, i) => {
    const progress = (i + 1) / total;
    let best = null;
    let bestGap = -Infinity;
    for (const c of CATS) {
      if (assigned[c] >= quotas[c]) continue;
      const gap = quotas[c] * progress - assigned[c];
      if (gap > bestGap || (gap === bestGap && quotas[c] > quotas[best])) {
        best = c;
        bestGap = gap;
      }
    }
    assigned[best] += 1;
    return { tier, cat: best };
  });
}

function pickItem(slot, chosen, banned, tagWeights, tagCounts) {
  const available = (cat, tier) =>
    ITEMS.filter((it) => it.cat === cat && it.tier === tier && !chosen.has(it.id) && !banned.has(it.id));

  // Same category, nearest tier first (prefer cheaper on ties); then any category.
  const tierOrder = [slot.tier, slot.tier + 1, slot.tier - 1, slot.tier + 2, slot.tier - 2, slot.tier + 3, slot.tier - 3]
    .filter((t) => t >= 1 && t <= 4);
  let pool = [];
  for (const t of tierOrder) {
    pool = available(slot.cat, t);
    if (pool.length) break;
  }
  if (!pool.length) {
    for (const t of tierOrder) {
      pool = CATS.flatMap((c) => available(c, t));
      if (pool.length) break;
    }
  }
  if (!pool.length) return null;

  let best = null;
  for (const item of pool) {
    const s = scoreItem(item, tagWeights, tagCounts);
    if (!best || s.score > best.score || (s.score === best.score && item.name < best.item.name)) {
      best = { item, ...s };
    }
  }
  return best;
}

function buildTips(fractions, state, quotas) {
  const tips = [];
  if (fractions.spirit >= 0.45) tips.push('Spirit-heavy: spirit power and cooldown items multiply your ability damage. Prioritize them before situational picks.');
  if (fractions.weapon >= 0.45) tips.push('Gun-heavy: farm hard with your weapon early. Fire rate and ammo items stack well together.');
  if (fractions.vitality >= 0.45) tips.push('Tank-heavy: you win by staying in fights longer. Buy bullet or spirit armor based on which damage type the enemy team leans on.');
  if (quotas.vitality === 0) tips.push('No vitality items: you will be fragile. One cheap health item usually pays for itself.');
  if (!state.priorities.includes('anti_heal')) tips.push('If the enemy has lots of healing or lifesteal, add Toxic Bullets, Decay or Healbane.');
  tips.push('Your flex slots unlock as the game goes on. Late in the game, sell lane-phase items to make room for bigger upgrades.');
  return tips;
}

/**
 * @param {{hero:string, focus:{weapon:number,spirit:number,vitality:number}, priorities:string[], plan:string, banned:string[]}} state
 *   Must already be sanitized (see state.js).
 */
export function generateBuild(state) {
  const fractions = normalizeFocus(state.focus);
  const quotas = allocateSlots(fractions);
  const plan = GAME_PLAN_BY_ID.get(state.plan) || GAME_PLAN_BY_ID.get('balanced');
  const tagWeights = buildTagWeights(state, fractions);
  const banned = new Set(state.banned);
  const chosen = new Set();
  const tagCounts = new Map();

  const picks = [];
  for (const slot of planSlots(quotas, plan.tiers)) {
    const pick = pickItem(slot, chosen, banned, tagWeights, tagCounts);
    if (!pick) continue;
    chosen.add(pick.item.id);
    pick.item.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    picks.push(pick);
  }

  const phases = [1, 2, 3, 4]
    .map((tier) => ({
      tier,
      ...PHASES[tier],
      items: picks.filter((p) => p.item.tier === tier),
    }))
    .filter((p) => p.items.length);

  const actual = { weapon: 0, spirit: 0, vitality: 0 };
  picks.forEach((p) => { actual[p.item.cat] += 1; });

  return {
    fractions,
    quotas: actual,
    phases,
    totalCost: picks.reduce((sum, p) => sum + TIER_COST[p.item.tier], 0),
    tips: buildTips(fractions, state, actual),
  };
}
