// Inherited traits: what each of the 8 traits does, the founders' starting
// values per civ type, and mutation. Every number here is listed in RULES.md
// ("Traits"). A trait is 0 to 1 and 0.5 gives the base values everyone had
// before traits existed.
//
// Strength, aggression and cooperation are carried and inherited but have no
// effect yet; fights and civ switching will read them.

import { DESERT, TUNDRA, MOUNTAIN } from './terrain.js';

/** Trait ids in storage order: people.traits[k] is the Float32Array of trait TRAITS[k]. */
export const TRAITS = Object.freeze([
  'fertility', 'lifeExpectancy', 'strength', 'aggression', 'cooperation', 'metabolism', 'heatTolerance', 'coldTolerance',
]);
export const TRAIT_NAMES = Object.freeze([
  'Fertility', 'Life expectancy', 'Strength', 'Aggression', 'Cooperation', 'Metabolism', 'Heat tolerance', 'Cold tolerance',
]);
export const TRAIT_COUNT = TRAITS.length;
export const FERTILITY = 0;
export const LIFE_EXPECTANCY = 1;
export const STRENGTH = 2;
export const AGGRESSION = 3;
export const COOPERATION = 4;
export const METABOLISM = 5;
export const HEAT_TOLERANCE = 6;
export const COLD_TOLERANCE = 7;

export const TRAIT_RULES = Object.freeze({
  /** Value every trait has unless a civ type says otherwise; also what a person gets when added without traits. */
  base: 0.5,
  /** Birth chance = (birthBase + birthPerFertility × f) × (metabolism factor, see foodNeed). */
  birthBase: 0.025,
  birthPerFertility: 0.05,
  /** Old age starts at oldAgeBase + oldAgePerLife × l. */
  oldAgeBase: 35,
  oldAgePerLife: 20,
  /** Food eaten a year = needBase + needPerMetabolism × m (also the birth chance's metabolism factor). */
  needBase: 0.75,
  needPerMetabolism: 0.5,
  /** Hunger burden B = clamp(1 + burdenFertility × (f − 0.5) + burdenMetabolism × (m − 0.5), burdenMin, burdenMax). */
  burdenFertility: 2.8,
  burdenMetabolism: 1.2,
  burdenMin: 0.5,
  burdenMax: 3,
  /** Founders get their type's value ± up to this (uniform), clamped to 0 … 1. */
  founderSpread: 0.1,
});

/**
 * Founders' starting values by civ type; traits not listed are TRAIT_RULES.base.
 * Every civ is type-less ('none') until civ types ship.
 */
export const CIV_TYPE_TRAITS = Object.freeze({
  none: Object.freeze({}),
  aggressive: Object.freeze({ aggression: 0.7, strength: 0.65 }),
  cooperative: Object.freeze({ cooperation: 0.7 }),
  expansionist: Object.freeze({ heatTolerance: 0.55, coldTolerance: 0.55 }),
  isolationist: Object.freeze({ lifeExpectancy: 0.6 }),
  nomadic: Object.freeze({ metabolism: 0.45, heatTolerance: 0.6, coldTolerance: 0.6 }),
});

/** The 8 starting values of a civ type, in TRAITS order (unknown types are type-less). */
export function typeTraits(type) {
  const t = CIV_TYPE_TRAITS[type] ?? CIV_TYPE_TRAITS.none;
  return TRAITS.map((k) => t[k] ?? TRAIT_RULES.base);
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Food a person with metabolism m eats a year. */
export const foodNeed = (m) => TRAIT_RULES.needBase + TRAIT_RULES.needPerMetabolism * m;

/** Yearly birth chance for an eligible person. */
export const birthChance = (f, m) => (TRAIT_RULES.birthBase + TRAIT_RULES.birthPerFertility * f) * foodNeed(m);

/** Age from which a person with life expectancy l may die of old age. */
export const oldAgeStart = (l) => TRAIT_RULES.oldAgeBase + TRAIT_RULES.oldAgePerLife * l;

/** How much harder hunger hits fertile, fast-burning people. */
export function hungerBurden(f, m) {
  const r = TRAIT_RULES;
  return Math.min(r.burdenMax, Math.max(r.burdenMin, 1 + r.burdenFertility * (f - 0.5) + r.burdenMetabolism * (m - 0.5)));
}

/** Tolerance factor: 2 at 0, 1 at 0.5, 0.5 at 1 (piecewise linear). */
export const tolerance = (x) => (x <= 0.5 ? 2 - 2 * x : 1.5 - x);

/**
 * Climate factor on hunger's health loss: in desert heat tolerance helps and
 * cold tolerance costs, in tundra and mountain the other way round; 1 elsewhere.
 */
export function climateFactor(terrain, h, c) {
  if (terrain === DESERT) return tolerance(h) * (0.5 + c);
  if (terrain === TUNDRA || terrain === MOUNTAIN) return tolerance(c) * (0.5 + h);
  return 1;
}
