// Civ types: a behaviour bias layered on top of each person's own traits. The
// type sets how eagerly its people migrate, how it fights and blends with
// other civs, and how it levels up; starting traits come from the civ's
// people (peoples.js).
// Every number here is listed in RULES.md ("Civ types", "Migration", "Contact").

/** Type ids; also the default civs' order (Civ 1 Expansionist, Civ 2 Aggressive, …, repeating; see peoples.js DEFAULT_PEOPLES). */
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

/** One or two plain sentences per type for the setup screen (they follow RULES.md "Civ types"). */
const BEHAVIOUR = {
  expansionist: 'Moves on early: its people set out once their hex holds 30% of its food capacity, long before it is crowded at 50%.',
  aggressive: 'Always fights any civ it shares a hex with.',
  cooperative: 'Never starts a fight, and its people leave it for another civ half as often as others do.',
  isolationist: 'Keeps to itself: when its hex is crowded, its people only move to land with no other civ in or next to it.',
  nomadic: 'Wanders far: 5 movement points a year instead of 3, and sets out twice as often.',
};

/** The setup screen's explanation of a type: what it does differently. */
export const civTypeText = (type) => BEHAVIOUR[type] ?? '';
