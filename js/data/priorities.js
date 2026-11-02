// Playstyle priorities the user can toggle. Each maps to item tags that get a
// scoring boost when the priority is selected.

export const TAG_LABELS = Object.freeze({
  ammo: 'ammo',
  dps: 'sustained damage',
  burst: 'burst damage',
  headshot: 'headshots',
  fire_rate: 'fire rate',
  range: 'long range',
  close: 'close range',
  melee: 'melee',
  farm: 'farming',
  spirit_power: 'spirit power',
  cooldown: 'cooldowns',
  charges: 'ability charges',
  duration: 'ability duration',
  ability_range: 'ability range',
  hp: 'health',
  regen: 'regen',
  lifesteal: 'lifesteal',
  bullet_armor: 'bullet resist',
  spirit_armor: 'spirit resist',
  shield: 'barriers',
  mobility: 'mobility',
  stamina: 'stamina',
  escape: 'escape',
  cleanse: 'cleanse',
  cc: 'crowd control',
  debuff: 'debuffs',
  anti_heal: 'anti-heal',
  anti_tank: 'anti-tank',
  team: 'team support',
});

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

// How many items of each tier end up in the final 12-slot build.
export const GAME_PLANS = Object.freeze([
  { id: 'balanced', label: 'Balanced', tiers: { 1: 3, 2: 4, 3: 3, 4: 2 } },
  { id: 'early', label: 'Early aggression', tiers: { 1: 4, 2: 5, 3: 2, 4: 1 } },
  { id: 'late', label: 'Late-game scaling', tiers: { 1: 2, 2: 3, 3: 4, 4: 3 } },
]);

export const GAME_PLAN_BY_ID = new Map(GAME_PLANS.map((g) => [g.id, g]));
