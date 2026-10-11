// The yearly life cycle: founding the civs, eating, food regrowth, deaths and births.
// Every number here is listed in RULES.md ("People").
//
// The BASE_* values are the same for everyone for now; per-person traits
// (fertility, life expectancy, metabolism) will replace them in Phase 3.
//
// Each step decides first and applies after, reading only state fixed before
// the step, so the order people are visited in never changes who eats, dies
// or gives birth.

import { DEEP_WATER } from './terrain.js';
import { NO_PARENT } from './people.js';
import { indexToAxial, distance } from './hex.js';

export const LIFE = Object.freeze({
  /** Food a person eats a year. */
  foodPerPerson: 1,
  /** Share of a hex's food capacity that grows back each year (never above capacity). */
  foodRegrowth: 0.5,
  healthMax: 100,
  /** Health gained in a year with food, lost in a year without. At 0 a person dies of starvation. */
  healthFedGain: 25,
  healthHungryLoss: 35,
  /** Fertile age window, inclusive. */
  fertileMin: 16,
  fertileMax: 40,
  /** Yearly birth chance for a fed adult in the fertile window, in a hex below its food capacity. */
  baseBirthChance: 0.05,
  /** From this age a person may die of old age each year … */
  baseOldAgeStart: 45,
  /** … with chance (age − start) ÷ span, so nobody lives past start + span. */
  oldAgeSpan: 40,
  /** Founders' ages are spread evenly over 0 to this − 1. */
  founderAgeMax: 40,
  /** Civs start at least this many steps apart when the land allows it. */
  startMinDistance: 3,
  /** Start hexes need at least this food capacity when the land allows it. */
  startMinFood: 40,
});

export const DEATH_OLD_AGE = 0;
export const DEATH_STARVATION = 1;

/**
 * Picks a start hex for each civ. The first is a random good hex (land with
 * food capacity ≥ startMinFood); each next is a random good hex at least
 * startMinDistance steps from the earlier starts, or else the good hex
 * farthest from them (lowest index on ties). Without good hexes, any land.
 * Returns an array of hex indices (several civs may share one on tiny land).
 */
export function pickStarts(map, civs, rng) {
  const land = [];
  const good = [];
  for (let i = 0; i < map.count; i++) {
    if (map.terrain[i] === DEEP_WATER) continue;
    land.push(i);
    if (map.foodCap[i] >= LIFE.startMinFood) good.push(i);
  }
  const pool = good.length ? good : land;
  const starts = [];
  if (!pool.length) return starts;
  const ax = pool.map((i) => indexToAxial(i, map.cols));
  const nearest = (k) => {
    let best = Infinity;
    for (const s of starts) {
      const b = indexToAxial(s, map.cols);
      best = Math.min(best, distance(ax[k].q, ax[k].r, b.q, b.r));
    }
    return best;
  };
  for (let c = 0; c < civs; c++) {
    const far = [];
    let bestK = 0;
    let bestD = -1;
    for (let k = 0; k < pool.length; k++) {
      const d = nearest(k);
      if (d >= LIFE.startMinDistance) far.push(k);
      if (d > bestD) { bestD = d; bestK = k; }
    }
    starts.push(pool[far.length ? far[rng.int(far.length)] : bestK]);
  }
  return starts;
}

/** Old-age death chance this year at a given age. */
export function oldAgeChance(age) {
  if (age < LIFE.baseOldAgeStart) return 0;
  return Math.min(1, (age - LIFE.baseOldAgeStart) / LIFE.oldAgeSpan);
}

/**
 * Everyone eats. In a hex with fewer whole food units than people, exactly
 * ⌊food⌋ of them eat, chosen uniformly at random (selection sampling per hex,
 * which is fair whatever order people are visited in).
 * Scratch arrays (per hex): pop (people in the hex, filled here), seen, picked.
 */
export function eat(people, map, rng, pop, seen, picked) {
  const { alive, hex, health, hunger } = people;
  const food = map.food;
  pop.fill(0);
  seen.fill(0);
  picked.fill(0);
  for (let i = 0; i < people.high; i++) if (alive[i]) pop[hex[i]]++;
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    const h = hex[i];
    const n = pop[h];
    const k = Math.min(n, Math.floor(food[h] / LIFE.foodPerPerson));
    let fed;
    if (k >= n) fed = true;
    else fed = rng.next() * (n - seen[h]) < k - picked[h];
    seen[h]++;
    if (fed) {
      picked[h]++;
      hunger[i] = 0;
      health[i] = Math.min(LIFE.healthMax, health[i] + LIFE.healthFedGain);
    } else {
      if (hunger[i] < 255) hunger[i]++;
      health[i] = Math.max(0, health[i] - LIFE.healthHungryLoss);
    }
  }
  for (let h = 0; h < map.count; h++) if (picked[h]) food[h] -= picked[h] * LIFE.foodPerPerson;
}

/**
 * Deaths: starvation when health has reached 0, otherwise old age by chance.
 * A death depends only on the person's own state, so removing at once is the
 * same as deciding for everyone first. onDeath(slot, cause) records it.
 */
export function deaths(people, rng, onDeath) {
  const { alive, age, health } = people;
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    let cause = -1;
    if (health[i] === 0) cause = DEATH_STARVATION;
    else if (age[i] >= LIFE.baseOldAgeStart && rng.next() < oldAgeChance(age[i])) cause = DEATH_OLD_AGE;
    if (cause < 0) continue;
    onDeath(i, cause);
    people.remove(i);
  }
}

/**
 * Births: each fed person in the fertile window, in a hex with fewer people
 * than its food capacity, has a child with the yearly birth chance. Decided
 * for everyone against the head count before any child is added. The child
 * starts at age 0, full health, in the parent's hex and civ.
 * parents: scratch Int32Array at least people.high long. Returns births added.
 */
export function births(people, map, rng, pop, parents, onBirth) {
  const { alive, age, hunger, hex } = people;
  pop.fill(0);
  for (let i = 0; i < people.high; i++) if (alive[i]) pop[hex[i]]++;
  let n = 0;
  for (let i = 0; i < people.high; i++) {
    if (!alive[i] || hunger[i] !== 0) continue;
    if (age[i] < LIFE.fertileMin || age[i] > LIFE.fertileMax) continue;
    if (pop[hex[i]] >= map.foodCap[hex[i]]) continue;
    if (rng.next() < LIFE.baseBirthChance) parents[n++] = i;
  }
  for (let k = 0; k < n; k++) {
    const p = parents[k];
    const gen = Math.min(65535, people.gen[p] + 1);
    const child = people.add(people.hex[p], people.civ[p], 0, LIFE.healthMax, people.id[p], gen, people.founder[p]);
    onBirth(child);
  }
  return n;
}

/** Food grows back by foodRegrowth × capacity, never above capacity. */
export function regrow(map) {
  const { food, foodCap } = map;
  for (let h = 0; h < map.count; h++) {
    if (food[h] < foodCap[h]) food[h] = Math.min(foodCap[h], food[h] + LIFE.foodRegrowth * foodCap[h]);
  }
}

/** Places each civ's founders on its start hex. Founder c × startPop + k is generation 1 of its own line. */
export function found(people, starts, startPop, rng) {
  for (let c = 0; c < starts.length; c++) {
    for (let k = 0; k < startPop; k++) people.add(starts[c], c, rng.int(LIFE.founderAgeMax), LIFE.healthMax, NO_PARENT, 1, c * startPop + k);
  }
}
