// What each trait and mutation does, in two depths: a plain line, and the
// exact rule (the ⓘ on the setup screen's Edit sidebar, and How to play).
// Numbers are read from the sim, so they match RULES.md "Traits".

import { TRAITS, TRAIT_NAMES, TRAIT_RULES as R } from '../sim/traits.js';
import { CONTACT as C } from '../sim/contact.js';
import { GATHER } from '../sim/levels.js';
import { LIFE } from '../sim/life.js';

const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const num = (v) => String(Math.round(v * 100) / 100);

const PLAIN = {
  fertility: 'More children each year, but hunger hits them harder.',
  lifeExpectancy: 'Old age comes later, so people live longer (and eat for longer).',
  strength: 'Wins fights: a side\'s strength is its people\'s strength added up.',
  aggression: 'Starts fights more readily: land is won, but people die in wars.',
  cooperation: 'Gathers more, so the civ levels up faster; but its people join other civs more easily.',
  metabolism: 'Burns more food: more children, but eats more and starves sooner.',
  heatTolerance: 'Copes with hunger in the desert; suffers more in tundra and mountains.',
  coldTolerance: 'Copes with hunger in tundra and mountains; suffers more in the desert.',
};

const RULE = {
  fertility: `Birth chance a year = (${pct(R.birthBase)} + ${pct(R.birthPerFertility)} × fertility) × (${num(R.needBase)} + ${num(R.needPerMetabolism)} × metabolism): `
    + `${pct(R.birthBase)} to ${pct(R.birthBase + R.birthPerFertility)} at metabolism ${R.base}, for fed people aged ${LIFE.fertileMin} to ${LIFE.fertileMax}. `
    + `A hungry year's health loss is × (1 + ${R.burdenFertility} × (fertility − ${R.base}) + ${R.burdenMetabolism} × (metabolism − ${R.base})), kept between ${R.burdenMin} and ${R.burdenMax}.`,
  lifeExpectancy: `Old age starts at ${R.oldAgeBase} + ${R.oldAgePerLife} × life expectancy: ${R.oldAgeBase} to ${R.oldAgeBase + R.oldAgePerLife} years.`,
  strength: 'In a fight each side\'s strength is the sum of its people\'s strength in the hex (times any defence, walls or Kingdom bonus); '
    + `the stronger side wins. The loser loses ${C.loserDeathPct}% of its people there and flees, the winner ${C.winnerDeathPct}%.`,
  aggression: `A civ attacks another in a shared hex when someone there went hungry and its average aggression is above ${C.hungerAggression}, `
    + `the hex is crowded and it is above ${C.crowdAggression}, or it has ${C.numbersRatio} times the people and it is above ${C.numbersAggression}; `
    + 'then with a chance equal to that average aggression. Aggressive civs always attack; Cooperative civs never start a fight.',
  cooperation: `A gatherer's yield is × (${GATHER.personBase} + cooperation): ${num(GATHER.personBase)} to ${num(GATHER.personBase + 1)}. `
    + `In a hex shared with other civs, a person switches civ with a chance of ${pct(C.switchPerCooperation)} × cooperation a year.`,
  metabolism: `Food eaten a year = ${num(R.needBase)} + ${num(R.needPerMetabolism)} × metabolism: ${num(R.needBase)} to ${num(R.needBase + R.needPerMetabolism)}. `
    + `It also multiplies the birth chance by the same amount and adds to a hungry year's health loss (× ${R.burdenMetabolism} per point above ${R.base}).`,
  heatTolerance: 'A hungry year\'s health loss in the desert is × T(heat) × (0.5 + cold), and in tundra and mountains × T(cold) × (0.5 + heat), '
    + 'where T is 2 at 0, 1 at 0.5 and 0.5 at 1. Other terrain is not affected.',
  coldTolerance: 'A hungry year\'s health loss in tundra and mountains is × T(cold) × (0.5 + heat), and in the desert × T(heat) × (0.5 + cold), '
    + 'where T is 2 at 0, 1 at 0.5 and 0.5 at 1. Other terrain is not affected.',
};

/** The eight traits: id, name, a plain line and the exact rule. */
export function traitFacts() {
  return TRAITS.map((id, k) => ({ id, name: TRAIT_NAMES[k], text: PLAIN[id], rule: RULE[id] }));
}

/** Generations a family line takes in the mutation example. */
export const EXAMPLE_GENERATIONS = 10;

/**
 * How far one family line drifts by chance alone after n generations at ±m:
 * the typical amount (one standard deviation of n uniform steps) and the most.
 */
export function drift(m, n = EXAMPLE_GENERATIONS) {
  return { typical: Math.round(m * Math.sqrt(n / 3) * 100) / 100, most: Math.round(m * n * 100) / 100 };
}

/** Plain explanation of mutation at ±m, with the 10-generation example. */
export function mutationText(m) {
  if (m <= 0) return 'Children get exactly the average of their parents\' traits, so a civ\'s traits only change as some families die out and others grow.';
  const d = drift(m);
  return `Each child gets the average of its parents' traits, each nudged by a random amount up to ±${num(m)}. `
    + `After ${EXAMPLE_GENERATIONS} generations (roughly 300 years) one family line has drifted about ±${num(d.typical)} by chance (at most ±${num(d.most)}). `
    + 'The civ as a whole moves further: traits that help people eat, survive and have children spread, so a desert people grows to bear the heat.';
}
