// Civ types: a behaviour bias layered on top of each person's own traits. The
// type sets the founders' starting traits (CIV_TYPE_TRAITS in traits.js), how
// eagerly its people migrate, and how it fights and blends with other civs.
// Every number here is listed in RULES.md ("Civ types", "Migration", "Contact").

import { CIV_TYPE_TRAITS } from './traits.js';

/** Type ids; this is also the order new civs get by default (Civ 1 Expansionist, Civ 2 Aggressive, …, repeating). */
export const CIV_TYPES = Object.freeze(['expansionist', 'aggressive', 'cooperative', 'isolationist', 'nomadic']);
export const CIV_TYPE_NAMES = Object.freeze({
  expansionist: 'Expansionist',
  aggressive: 'Aggressive',
  cooperative: 'Cooperative',
  isolationist: 'Isolationist',
  nomadic: 'Nomadic',
});

/** Default type of civ k (0-based): the CIV_TYPES order, repeating. */
export const defaultCivType = (k) => CIV_TYPES[k % CIV_TYPES.length];

/**
 * Migration and contact numbers per type. Anything not listed uses the usual
 * values in migration.js MIGRATION.
 */
export const TYPE_RULES = Object.freeze({
  expansionist: Object.freeze({ crowdedShare: 0.3 }),
  aggressive: Object.freeze({ alwaysFights: true }),
  cooperative: Object.freeze({ neverStartsFights: true, switchAwayFactor: 0.5 }),
  isolationist: Object.freeze({ fedKeepsApart: true }),
  nomadic: Object.freeze({ movePoints: 5, setOutFactor: 2 }),
});

/**
 * One or two plain sentences per type for the setup screen (they follow
 * RULES.md "Civ types"). Starting traits are appended from CIV_TYPE_TRAITS so
 * the text cannot drift from the numbers.
 */
const BEHAVIOUR = {
  expansionist: 'Moves on early: its people set out once their hex holds 30% of its food capacity, long before it is crowded at 50%.',
  aggressive: 'Always fights any civ it shares a hex with.',
  cooperative: 'Never starts a fight, and its people leave it for another civ half as often as others do.',
  isolationist: 'Keeps to itself: when its hex is crowded, its people only move to land with no other civ in or next to it.',
  nomadic: 'Wanders far: 5 movement points a year instead of 3, and sets out twice as often.',
};

const TRAIT_WORDS = {
  fertility: 'fertility', lifeExpectancy: 'life expectancy', strength: 'strength', aggression: 'aggression',
  cooperation: 'cooperation', metabolism: 'metabolism', heatTolerance: 'heat tolerance', coldTolerance: 'cold tolerance',
};

/** The setup screen's explanation of a type: what it does differently and its starting traits. */
export function civTypeText(type) {
  const t = CIV_TYPE_TRAITS[type] ?? {};
  const traits = Object.entries(t).map(([k, v]) => `${TRAIT_WORDS[k]} ${v}`);
  return `${BEHAVIOUR[type] ?? ''} Starts with ${traits.join(', ')}; other traits 0.5.`;
}
