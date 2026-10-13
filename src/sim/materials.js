// Material deposits: the 9 materials, their tiers and the chance a land hex
// holds a deposit of each, by terrain. Every value here is listed in RULES.md
// ("Material deposits"). Deposits are rolled once at map generation and never
// run out; gathering from them comes later.

import { COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT } from './terrain.js';

export const WOOD = 0;
export const STONE = 1;
export const CLAY = 2;
export const COPPER = 3;
export const IRON = 4;
export const SALT = 5;
export const GOLD = 6;
export const GEMSTONES = 7;
export const SPICES = 8;
export const MATERIAL_COUNT = 9;
/** A store within this much of a cost counts as holding it, so sums of fractional yields never leave a civ a hair short. */
export const COST_EPS = 0.001;

export const MATERIAL_IDS = ['wood', 'stone', 'clay', 'copper', 'iron', 'salt', 'gold', 'gemstones', 'spices'];
export const MATERIAL_NAMES = ['Wood', 'Stone', 'Clay', 'Copper', 'Iron', 'Salt', 'Gold', 'Gemstones', 'Spices'];
export const MATERIAL_TIER = ['common', 'common', 'common', 'uncommon', 'uncommon', 'uncommon', 'exotic', 'exotic', 'exotic'];
/** Every map holds at least one deposit of each of these, where the land allows it. */
export const EXOTIC = [GOLD, GEMSTONES, SPICES];

/** Bit of material m in map.deposits[hex]. */
export const depositBit = (m) => 1 << m;
export const hasDeposit = (deposits, hex, m) => (deposits[hex] & (1 << m)) !== 0;

const row = (pairs) => {
  const a = new Array(TERRAIN_COUNT).fill(0);
  for (const [t, chance] of pairs) a[t] = chance;
  return Object.freeze(a);
};

/** DEPOSIT_CHANCE[material][terrain]: chance (0 to 1) a land hex of that terrain holds the material. */
export const DEPOSIT_CHANCE = Object.freeze([
  row([[FOREST, 0.95], [HILLS, 0.4], [PLAINS, 0.2], [TUNDRA, 0.15], [COAST, 0.1]]),
  row([[MOUNTAIN, 0.9], [HILLS, 0.7], [TUNDRA, 0.3], [DESERT, 0.25], [COAST, 0.15]]),
  row([[COAST, 0.4], [PLAINS, 0.3], [FOREST, 0.1]]),
  row([[MOUNTAIN, 0.25], [HILLS, 0.2], [DESERT, 0.08]]),
  row([[MOUNTAIN, 0.2], [HILLS, 0.15], [TUNDRA, 0.1]]),
  row([[DESERT, 0.3], [COAST, 0.25]]),
  row([[MOUNTAIN, 0.04], [HILLS, 0.02]]),
  row([[MOUNTAIN, 0.03], [DESERT, 0.02]]),
  row([[DESERT, 0.03], [COAST, 0.02]]),
]);

/** A river hex rolls these as well as its terrain's chances (a deposit if either roll hits). */
export const RIVER_DEPOSIT_CHANCE = Object.freeze([0.4, 0, 0.7, 0, 0, 0, 0.05, 0, 0]);

/**
 * Re-roll rounds for a missing exotic before the fallback (see rollDeposits).
 * Every eligible hex has at least a 2% chance a round, so the fallback is
 * practically never reached; it only guarantees the loop ends.
 */
export const EXOTIC_REROLL_LIMIT = 1000;
