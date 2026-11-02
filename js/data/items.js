// Item database.
//
// NOTE: Deadlock is in active development and items change often. This data is
// community-maintained — descriptions are intentionally qualitative (no exact
// numbers) so they age better. Edit freely; the engine only relies on the
// fields documented below.
//
// Fields:
//   id    – unique snake_case id (used in share links, must stay stable)
//   name  – display name
//   cat   – 'weapon' | 'vitality' | 'spirit'
//   tier  – 1..4 (cost comes from TIER_COST)
//   tags  – keywords from TAGS (see priorities.js) used for scoring
//   desc  – short, plain-language summary
//   core  – baseline "generally good" value (0–2, default 1). Tie-breaker.

export const CATEGORIES = Object.freeze({
  weapon: { label: 'Weapon', short: 'WPN' },
  vitality: { label: 'Vitality', short: 'VIT' },
  spirit: { label: 'Spirit', short: 'SPR' },
});

export const TIER_COST = Object.freeze({ 1: 800, 2: 1600, 3: 3200, 4: 6400 });

const I = (id, name, cat, tier, tags, desc, core = 1) =>
  Object.freeze({ id, name, cat, tier, tags: Object.freeze(tags), desc, core });

export const ITEMS = Object.freeze([
  // ───────────── WEAPON ─────────────
  I('basic_magazine', 'Basic Magazine', 'weapon', 1, ['ammo', 'dps'], 'More ammo and a little extra weapon damage.', 1.3),
  I('close_quarters', 'Close Quarters', 'weapon', 1, ['close', 'dps', 'melee'], 'Bonus bullet and melee damage against nearby enemies.'),
  I('headshot_booster', 'Headshot Booster', 'weapon', 1, ['headshot', 'burst'], 'Headshots deal bonus damage on a short cooldown.', 1.3),
  I('high_velocity_rounds', 'High-Velocity Rounds', 'weapon', 1, ['range', 'dps'], 'Faster bullets and extra weapon damage.'),
  I('monster_rounds', 'Monster Rounds', 'weapon', 1, ['farm', 'dps'], 'Stronger against troopers and jungle camps; helps you farm.'),
  I('rapid_rounds', 'Rapid Rounds', 'weapon', 1, ['fire_rate', 'dps'], 'Increased fire rate.', 1.2),
  I('restorative_shot', 'Restorative Shot', 'weapon', 1, ['regen', 'dps'], 'Hitting enemies with bullets heals you periodically.'),

  I('active_reload', 'Active Reload', 'weapon', 2, ['fire_rate', 'lifesteal', 'dps'], 'Well-timed reloads grant fire rate and bullet lifesteal.'),
  I('berserker', 'Berserker', 'weapon', 2, ['dps', 'close'], 'Gain stacking weapon damage as you take damage.'),
  I('fleetfoot', 'Fleetfoot', 'weapon', 2, ['mobility', 'ammo'], 'More move speed while shooting, plus extra ammo.'),
  I('intensifying_magazine', 'Intensifying Magazine', 'weapon', 2, ['dps', 'fire_rate'], 'Damage ramps up the longer you hold the trigger.'),
  I('kinetic_dash', 'Kinetic Dash', 'weapon', 2, ['mobility', 'fire_rate', 'stamina'], 'Dash-jumping grants a burst of fire rate and bonus ammo.'),
  I('long_range', 'Long Range', 'weapon', 2, ['range', 'dps'], 'Bonus weapon damage against far-away targets.'),
  I('melee_charge', 'Melee Charge', 'weapon', 2, ['melee', 'burst'], 'Heavy melee hits harder and closes distance.'),
  I('mystic_shot', 'Mystic Shot', 'weapon', 2, ['burst', 'spirit_power'], 'Periodic bonus spirit damage on a bullet hit; scales with spirit.'),
  I('opening_rounds', 'Opening Rounds', 'weapon', 2, ['burst', 'dps'], 'Extra damage against targets at high health.'),
  I('slowing_bullets', 'Slowing Bullets', 'weapon', 2, ['cc', 'dps'], 'Bullets slow the enemy you hit.'),
  I('soul_shredder_bullets', 'Soul Shredder Bullets', 'weapon', 2, ['debuff', 'lifesteal', 'spirit_power'], 'Bullets weaken enemy spirit resistance and grant spirit lifesteal.'),
  I('split_shot', 'Split Shot', 'weapon', 2, ['dps', 'close'], 'Fire extra projectiles on a cooldown.'),
  I('swift_striker', 'Swift Striker', 'weapon', 2, ['fire_rate', 'dps'], 'Big fire rate boost at the cost of some bullet resistance.'),
  I('weakening_headshot', 'Weakening Headshot', 'weapon', 2, ['headshot', 'debuff'], 'Headshots reduce enemy bullet resistance.'),

  I('alchemical_fire', 'Alchemical Fire', 'weapon', 3, ['burst', 'debuff', 'spirit_power'], 'Throw a fire bomb that damages and boosts your bullets against targets inside.'),
  I('burst_fire', 'Burst Fire', 'weapon', 3, ['fire_rate', 'mobility'], 'Damaging heroes gives fire rate and move speed.'),
  I('escalating_resilience', 'Escalating Resilience', 'weapon', 3, ['bullet_armor', 'dps'], 'Shooting enemies builds up bullet resistance.'),
  I('headhunter', 'Headhunter', 'weapon', 3, ['headshot', 'regen', 'burst'], 'Headshots deal bonus damage and heal you.', 1.2),
  I('heroic_aura', 'Heroic Aura', 'weapon', 3, ['team', 'fire_rate', 'mobility'], 'Aura and active that boost allies\' fire rate and speed.'),
  I('hunters_aura', "Hunter's Aura", 'weapon', 3, ['debuff', 'close'], 'Nearby enemies lose bullet resistance.'),
  I('point_blank', 'Point Blank', 'weapon', 3, ['close', 'burst', 'cc'], 'Bonus damage and a slow against close targets.'),
  I('pristine_emblem', 'Pristine Emblem', 'weapon', 3, ['dps', 'burst'], 'Bonus damage against targets at high health.'),
  I('sharpshooter', 'Sharpshooter', 'weapon', 3, ['range', 'headshot'], 'Large damage bonus at long range, with zoom.'),
  I('tesla_bullets', 'Tesla Bullets', 'weapon', 3, ['dps', 'spirit_power'], 'Bullets sometimes chain lightning to nearby enemies.'),
  I('titanic_magazine', 'Titanic Magazine', 'weapon', 3, ['ammo', 'dps'], 'A huge magazine size increase.', 1.2),
  I('toxic_bullets', 'Toxic Bullets', 'weapon', 3, ['anti_heal', 'dps', 'debuff'], 'Bullets build up a poison that also reduces healing.', 1.2),

  I('crippling_headshot', 'Crippling Headshot', 'weapon', 4, ['headshot', 'debuff'], 'Headshots strip enemy resistances.'),
  I('frenzy', 'Frenzy', 'weapon', 4, ['fire_rate', 'mobility', 'bullet_armor'], 'At low health, gain fire rate, speed and resistance.'),
  I('glass_cannon', 'Glass Cannon', 'weapon', 4, ['dps', 'burst'], 'Massive weapon damage, but less max health.', 1.3),
  I('lucky_shot', 'Lucky Shot', 'weapon', 4, ['burst', 'cc'], 'Chance for bullets to deal bonus damage and slow.'),
  I('ricochet', 'Ricochet', 'weapon', 4, ['dps'], 'Bullets bounce to additional nearby enemies.', 1.2),
  I('shadow_weave', 'Shadow Weave', 'weapon', 4, ['escape', 'burst', 'mobility'], 'Turn invisible; breaking stealth grants bonus damage.'),
  I('silencer', 'Silencer', 'weapon', 4, ['cc', 'debuff'], 'Bullets build up and eventually silence the target.'),
  I('spiritual_overflow', 'Spiritual Overflow', 'weapon', 4, ['spirit_power', 'cooldown', 'fire_rate'], 'Sustained shooting grants spirit power and cooldown reduction.'),
  I('vampiric_burst', 'Vampiric Burst', 'weapon', 4, ['lifesteal', 'fire_rate', 'ammo'], 'Active: huge fire rate and bullet lifesteal.'),

  // ───────────── VITALITY ─────────────
  I('enduring_spirit', 'Enduring Spirit', 'vitality', 1, ['lifesteal', 'hp'], 'Extra health and spirit lifesteal.'),
  I('extra_health', 'Extra Health', 'vitality', 1, ['hp'], 'A flat boost to max health.', 1.3),
  I('extra_regen', 'Extra Regen', 'vitality', 1, ['regen'], 'Passive health regeneration.'),
  I('extra_stamina', 'Extra Stamina', 'vitality', 1, ['stamina', 'mobility'], 'One more stamina charge and faster recovery.', 1.1),
  I('healing_rite', 'Healing Rite', 'vitality', 1, ['regen', 'team'], 'Cast a heal-over-time on yourself or an ally.'),
  I('melee_lifesteal', 'Melee Lifesteal', 'vitality', 1, ['melee', 'lifesteal'], 'Melee hits heal you.'),
  I('sprint_boots', 'Sprint Boots', 'vitality', 1, ['mobility', 'regen'], 'Out-of-combat sprint speed and regen.'),

  I('bullet_armor', 'Bullet Armor', 'vitality', 2, ['bullet_armor'], 'Bullet resistance.'),
  I('bullet_lifesteal', 'Bullet Lifesteal', 'vitality', 2, ['lifesteal', 'hp'], 'Bullet damage heals you.'),
  I('combat_barrier', 'Combat Barrier', 'vitality', 2, ['shield', 'fire_rate'], 'A damage barrier when you engage, plus fire rate.'),
  I('debuff_reducer', 'Debuff Reducer', 'vitality', 2, ['cleanse'], 'Shorter duration on negative effects.'),
  I('enchanters_barrier', "Enchanter's Barrier", 'vitality', 2, ['shield', 'spirit_power', 'cooldown'], 'Barrier when casting, plus spirit power and cooldown reduction.'),
  I('enduring_speed', 'Enduring Speed', 'vitality', 2, ['mobility'], 'Move speed and resistance to slows.'),
  I('healbane', 'Healbane', 'vitality', 2, ['anti_heal'], 'Your spirit damage reduces enemy healing.'),
  I('healing_booster', 'Healing Booster', 'vitality', 2, ['regen', 'lifesteal'], 'Increases healing and lifesteal received.'),
  I('reactive_barrier', 'Reactive Barrier', 'vitality', 2, ['shield'], 'Automatic barrier when you get stunned or immobilized.'),
  I('restorative_locket', 'Restorative Locket', 'vitality', 2, ['regen', 'team'], 'Stores charges from enemy abilities, then heals.'),
  I('return_fire', 'Return Fire', 'vitality', 2, ['bullet_armor', 'dps'], 'Reflect part of incoming damage back to attackers.'),
  I('spirit_armor', 'Spirit Armor', 'vitality', 2, ['spirit_armor'], 'Spirit resistance.'),
  I('spirit_lifesteal', 'Spirit Lifesteal', 'vitality', 2, ['lifesteal', 'hp'], 'Spirit damage heals you.'),

  I('debuff_remover', 'Debuff Remover', 'vitality', 3, ['cleanse', 'escape'], 'Active: remove negative effects.'),
  I('divine_barrier', 'Divine Barrier', 'vitality', 3, ['shield', 'team'], 'Active: shield yourself or an ally.'),
  I('fortitude', 'Fortitude', 'vitality', 3, ['hp', 'regen'], 'Big health pool and fast regen when not taking damage.', 1.2),
  I('healing_nova', 'Healing Nova', 'vitality', 3, ['team', 'regen'], 'Active: heal yourself and nearby allies.'),
  I('improved_bullet_armor', 'Improved Bullet Armor', 'vitality', 3, ['bullet_armor'], 'High bullet resistance.'),
  I('improved_spirit_armor', 'Improved Spirit Armor', 'vitality', 3, ['spirit_armor'], 'High spirit resistance.'),
  I('lifestrike', 'Lifestrike', 'vitality', 3, ['melee', 'lifesteal', 'cc'], 'Heavy melee heals you and slows the target.'),
  I('majestic_leap', 'Majestic Leap', 'vitality', 3, ['mobility', 'escape'], 'Active: launch high into the air.'),
  I('metal_skin', 'Metal Skin', 'vitality', 3, ['bullet_armor', 'escape'], 'Active: become nearly immune to bullets briefly.'),
  I('rescue_beam', 'Rescue Beam', 'vitality', 3, ['team', 'regen'], 'Active: heal an ally and pull them toward you.'),
  I('superior_stamina', 'Superior Stamina', 'vitality', 3, ['stamina', 'mobility'], 'More stamina, air jump and dash distance.'),
  I('veil_walker', 'Veil Walker', 'vitality', 3, ['escape', 'mobility'], 'Passing through veils grants invisibility and speed.'),

  I('colossus', 'Colossus', 'vitality', 4, ['bullet_armor', 'spirit_armor', 'cc', 'hp'], 'Active: grow huge, gain resistances and slow nearby enemies.'),
  I('diviners_kevlar', "Diviner's Kevlar", 'vitality', 4, ['shield', 'spirit_power'], 'Using your ultimate grants a big barrier and spirit power.'),
  I('inhibitor', 'Inhibitor', 'vitality', 4, ['debuff', 'anti_heal', 'cc'], 'Bullets reduce enemy damage, movement and healing.'),
  I('leech', 'Leech', 'vitality', 4, ['lifesteal', 'spirit_power', 'hp'], 'Massive bullet and spirit lifesteal.', 1.2),
  I('phantom_strike', 'Phantom Strike', 'vitality', 4, ['mobility', 'cc', 'burst'], 'Active: teleport to an enemy, damage and disarm them.'),
  I('siphon_bullets', 'Siphon Bullets', 'vitality', 4, ['hp', 'lifesteal', 'dps'], 'Hitting heroes steals max health from them.'),
  I('soul_rebirth', 'Soul Rebirth', 'vitality', 4, ['escape', 'hp'], 'Revive once after dying, on a long cooldown.'),
  I('unstoppable', 'Unstoppable', 'vitality', 4, ['cleanse', 'escape'], 'Active: immune to stuns and most crowd control.', 1.1),
  I('witchmail', 'Witchmail', 'vitality', 4, ['spirit_armor', 'cooldown'], 'Spirit resistance; taking spirit damage reduces your cooldowns.'),

  // ───────────── SPIRIT ─────────────
  I('ammo_scavenger', 'Ammo Scavenger', 'spirit', 1, ['ammo', 'spirit_power'], 'Collecting souls refills ammo and stacks spirit power.'),
  I('extra_charge', 'Extra Charge', 'spirit', 1, ['charges'], 'Charged abilities gain an extra charge.'),
  I('extra_spirit', 'Extra Spirit', 'spirit', 1, ['spirit_power'], 'Flat spirit power.', 1.4),
  I('infuser', 'Infuser', 'spirit', 1, ['spirit_power', 'lifesteal'], 'Active: temporary spirit power and spirit lifesteal.'),
  I('mystic_burst', 'Mystic Burst', 'spirit', 1, ['burst', 'spirit_power'], 'Big ability hits deal bonus damage on a cooldown.', 1.2),
  I('mystic_reach', 'Mystic Reach', 'spirit', 1, ['ability_range'], 'Increased ability range.'),
  I('mystic_regeneration', 'Mystic Regeneration', 'spirit', 1, ['regen'], 'Dealing spirit damage grants regen.'),
  I('spirit_strike', 'Spirit Strike', 'spirit', 1, ['melee', 'debuff'], 'Melee hits deal spirit damage and lower spirit resistance.'),

  I('cold_front', 'Cold Front', 'spirit', 2, ['cc', 'burst'], 'Active: an icy blast that damages and slows around you.'),
  I('decay', 'Decay', 'spirit', 2, ['anti_heal', 'dps'], 'Active: damage over time that also reduces healing.'),
  I('duration_extender', 'Duration Extender', 'spirit', 2, ['duration'], 'Abilities last longer.'),
  I('improved_cooldown', 'Improved Cooldown', 'spirit', 2, ['cooldown'], 'Reduced ability cooldowns.', 1.3),
  I('mystic_vulnerability', 'Mystic Vulnerability', 'spirit', 2, ['debuff', 'spirit_power'], 'Your spirit damage reduces enemy spirit resistance.'),
  I('quicksilver_reload', 'Quicksilver Reload', 'spirit', 2, ['ammo', 'burst', 'spirit_power'], 'Using an ability reloads part of your magazine with bonus damage.'),
  I('slowing_hex', 'Slowing Hex', 'spirit', 2, ['cc'], 'Active: slow and silence movement abilities of a target.'),
  I('suppressor', 'Suppressor', 'spirit', 2, ['debuff'], 'Your spirit damage reduces enemy fire rate.'),
  I('withering_whip', 'Withering Whip', 'spirit', 2, ['debuff', 'cc'], 'Active: reduce a target\'s fire rate and bullet resistance.'),

  I('improved_burst', 'Improved Burst', 'spirit', 3, ['burst', 'spirit_power'], 'A stronger Mystic Burst.'),
  I('improved_reach', 'Improved Reach', 'spirit', 3, ['ability_range'], 'Much larger ability range.'),
  I('improved_spirit', 'Improved Spirit', 'spirit', 3, ['spirit_power'], 'Large spirit power boost.', 1.3),
  I('knockdown', 'Knockdown', 'spirit', 3, ['cc'], 'Active: delayed stun that pulls a target to the ground.'),
  I('mystic_slow', 'Mystic Slow', 'spirit', 3, ['cc'], 'Your spirit damage slows enemies.'),
  I('rapid_recharge', 'Rapid Recharge', 'spirit', 3, ['charges', 'cooldown'], 'Faster charge recovery and extra charges.'),
  I('silence_glyph', 'Silence Glyph', 'spirit', 3, ['cc'], 'Active: silence a target so they can\'t use abilities.'),
  I('superior_cooldown', 'Superior Cooldown', 'spirit', 3, ['cooldown'], 'Significant cooldown reduction.', 1.2),
  I('superior_duration', 'Superior Duration', 'spirit', 3, ['duration'], 'Abilities last much longer.'),
  I('surge_of_power', 'Surge of Power', 'spirit', 3, ['spirit_power', 'mobility'], 'Imbue an ability: casting it grants speed and fire rate.'),
  I('tankbuster', 'Tankbuster', 'spirit', 3, ['burst', 'anti_tank'], 'Bonus damage scaling with the target\'s max health.'),
  I('torment_pulse', 'Torment Pulse', 'spirit', 3, ['dps', 'close'], 'Periodically damages enemies around you.'),

  I('boundless_spirit', 'Boundless Spirit', 'spirit', 4, ['spirit_power', 'hp'], 'Huge spirit power and extra health.', 1.3),
  I('curse', 'Curse', 'spirit', 4, ['cc'], 'Active: silence, disarm and weaken a target.', 1.1),
  I('echo_shard', 'Echo Shard', 'spirit', 4, ['cooldown', 'burst'], 'Active: instantly reset your last ability.'),
  I('escalating_exposure', 'Escalating Exposure', 'spirit', 4, ['debuff', 'spirit_power'], 'Your spirit damage stacks increasing vulnerability.'),
  I('ethereal_shift', 'Ethereal Shift', 'spirit', 4, ['escape'], 'Active: become untargetable and invulnerable briefly.'),
  I('magic_carpet', 'Magic Carpet', 'spirit', 4, ['mobility'], 'Active: fly forward while shielded.'),
  I('mystic_reverb', 'Mystic Reverb', 'spirit', 4, ['burst', 'spirit_power'], 'Imbue an ability: hits echo for extra damage and slow.'),
  I('refresher', 'Refresher', 'spirit', 4, ['cooldown', 'burst'], 'Active: reset all your ability cooldowns.'),
  I('transcendent_cooldown', 'Transcendent Cooldown', 'spirit', 4, ['cooldown'], 'Massive cooldown reduction.'),
]);

/** Lookup by id. A Map avoids prototype-key pitfalls (e.g. "__proto__"). */
export const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
