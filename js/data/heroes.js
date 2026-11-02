// Hero presets. `lean` is a suggested starting focus (weapon/spirit/vitality,
// any scale) applied when the hero is picked. `tags` add a mild scoring bonus
// for items that fit the hero's kit. These are rough community-style
// heuristics — tune them as the game changes.

const H = (id, name, lean, tags) => Object.freeze({ id, name, lean: Object.freeze(lean), tags: Object.freeze(tags) });

export const HEROES = Object.freeze([
  H('abrams', 'Abrams', { weapon: 30, spirit: 20, vitality: 50 }, ['melee', 'close', 'lifesteal', 'hp', 'cc']),
  H('bebop', 'Bebop', { weapon: 35, spirit: 40, vitality: 25 }, ['cc', 'burst', 'cooldown']),
  H('calico', 'Calico', { weapon: 25, spirit: 45, vitality: 30 }, ['melee', 'mobility', 'escape']),
  H('dynamo', 'Dynamo', { weapon: 15, spirit: 45, vitality: 40 }, ['team', 'cc', 'cooldown']),
  H('grey_talon', 'Grey Talon', { weapon: 35, spirit: 50, vitality: 15 }, ['range', 'burst', 'headshot', 'charges']),
  H('haze', 'Haze', { weapon: 60, spirit: 10, vitality: 30 }, ['fire_rate', 'dps', 'escape', 'lifesteal']),
  H('holliday', 'Holliday', { weapon: 45, spirit: 30, vitality: 25 }, ['headshot', 'burst', 'range']),
  H('infernus', 'Infernus', { weapon: 25, spirit: 45, vitality: 30 }, ['dps', 'duration', 'lifesteal', 'close']),
  H('ivy', 'Ivy', { weapon: 20, spirit: 40, vitality: 40 }, ['team', 'mobility', 'cooldown']),
  H('kelvin', 'Kelvin', { weapon: 15, spirit: 40, vitality: 45 }, ['team', 'cc', 'shield']),
  H('lady_geist', 'Lady Geist', { weapon: 10, spirit: 55, vitality: 35 }, ['burst', 'lifesteal', 'hp']),
  H('lash', 'Lash', { weapon: 20, spirit: 50, vitality: 30 }, ['burst', 'cc', 'mobility', 'cooldown']),
  H('mcginnis', 'McGinnis', { weapon: 35, spirit: 45, vitality: 20 }, ['dps', 'duration', 'cc']),
  H('mirage', 'Mirage', { weapon: 40, spirit: 35, vitality: 25 }, ['dps', 'mobility']),
  H('mo_krill', 'Mo & Krill', { weapon: 15, spirit: 35, vitality: 50 }, ['cc', 'hp', 'close', 'lifesteal']),
  H('paradox', 'Paradox', { weapon: 40, spirit: 40, vitality: 20 }, ['headshot', 'burst', 'cc']),
  H('pocket', 'Pocket', { weapon: 15, spirit: 55, vitality: 30 }, ['burst', 'escape', 'mobility']),
  H('seven', 'Seven', { weapon: 30, spirit: 50, vitality: 20 }, ['dps', 'cc', 'cooldown']),
  H('shiv', 'Shiv', { weapon: 45, spirit: 20, vitality: 35 }, ['melee', 'lifesteal', 'close']),
  H('sinclair', 'Sinclair', { weapon: 25, spirit: 45, vitality: 30 }, ['cc', 'burst', 'cooldown']),
  H('vindicta', 'Vindicta', { weapon: 60, spirit: 20, vitality: 20 }, ['headshot', 'range', 'burst']),
  H('viscous', 'Viscous', { weapon: 10, spirit: 50, vitality: 40 }, ['cc', 'burst', 'escape']),
  H('vyper', 'Vyper', { weapon: 45, spirit: 30, vitality: 25 }, ['mobility', 'dps', 'debuff']),
  H('warden', 'Warden', { weapon: 40, spirit: 25, vitality: 35 }, ['cc', 'hp', 'dps']),
  H('wraith', 'Wraith', { weapon: 55, spirit: 25, vitality: 20 }, ['fire_rate', 'dps', 'cc']),
  H('yamato', 'Yamato', { weapon: 45, spirit: 30, vitality: 25 }, ['burst', 'melee', 'escape']),
]);

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
