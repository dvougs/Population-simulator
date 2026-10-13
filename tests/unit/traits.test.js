// RULES.md "Traits": what each trait does, founders, inheritance and mutation (T-021, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAITS, TRAIT_COUNT, TRAIT_RULES, traitValues, foodNeed, birthChance, oldAgeStart,
  hungerBurden, tolerance, climateFactor, FERTILITY, LIFE_EXPECTANCY, STRENGTH, AGGRESSION, COOPERATION,
  METABOLISM, HEAT_TOLERANCE, COLD_TOLERANCE,
} from '../../src/sim/traits.js';
import { eat, deaths, births, found, hungryLoss, oldAgeChance, LIFE, DEATH_OLD_AGE } from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import {
  PLAINS, COAST, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA,
} from '../../src/sim/terrain.js';
import { Simulation } from '../../src/sim/simulation.js';
import { makeMap, scratch } from './helpers.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('RULES.md Traits: 8 traits in the documented order', () => {
  assert.deepEqual(TRAITS, [
    'fertility', 'lifeExpectancy', 'strength', 'aggression', 'cooperation', 'metabolism', 'heatTolerance', 'coldTolerance',
  ]);
  assert.equal(TRAIT_COUNT, 8);
  assert.deepEqual([FERTILITY, LIFE_EXPECTANCY, STRENGTH, AGGRESSION, COOPERATION, METABOLISM, HEAT_TOLERANCE, COLD_TOLERANCE],
    [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('RULES.md Traits: every trait at 0.5 gives the old numbers', () => {
  assert.equal(TRAIT_RULES.base, 0.5);
  assert.equal(birthChance(0.5, 0.5), 0.05);
  assert.equal(oldAgeStart(0.5), 45);
  assert.equal(foodNeed(0.5), 1);
  for (const terrain of [COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA]) {
    assert.equal(hungryLoss(0.5, 0.5, 0.5, 0.5, terrain), 35, `terrain ${terrain}`);
  }
  assert.equal(hungerBurden(0.5, 0.5), 1);
});

test('RULES.md Traits: birth chance = (2.5% + 5% × f) × (0.75 + 0.5 × m)', () => {
  close(birthChance(0, 0.5), 0.025);
  close(birthChance(1, 0.5), 0.075);
  close(birthChance(0.5, 0), 0.05 * 0.75);
  close(birthChance(0.5, 1), 0.05 * 1.25);
  close(birthChance(1, 1), 0.075 * 1.25);
  close(birthChance(0, 0), 0.025 * 0.75);
});

test('RULES.md Traits: old age starts at 35 + 20 × l (35 at 0, 45 at 0.5, 55 at 1)', () => {
  assert.equal(oldAgeStart(0), 35);
  assert.equal(oldAgeStart(0.5), 45);
  assert.equal(oldAgeStart(1), 55);
  // The chance rises from the start: 0 at the start itself, then (age - start) / 40.
  assert.equal(oldAgeChance(35, 0), 0);
  assert.equal(oldAgeChance(34, 0), 0);
  assert.equal(oldAgeChance(36, 0), 0.025);
  assert.equal(oldAgeChance(55, 1), 0);
  assert.equal(oldAgeChance(56, 1), 0.025);
  assert.equal(oldAgeChance(95, 1), 1);
  assert.equal(oldAgeChance(75, 0), 1, 'certain at start + 40');
});

test('RULES.md Traits: food eaten = 0.75 + 0.5 × m', () => {
  assert.equal(foodNeed(0), 0.75);
  assert.equal(foodNeed(0.5), 1);
  assert.equal(foodNeed(1), 1.25);
  const p = new People(16);
  const i = p.add(0, 0, 20, 100, 0);
  assert.equal(p.need[i], 1, 'a person added without traits needs 1');
  p.setTraits(i, [0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5]);
  assert.equal(p.need[i], 1.25, 'setTraits refreshes the cached need');
  p.setTraits(i, [0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5, 0.5]);
  assert.equal(p.need[i], 0.75);
});

test('RULES.md Traits: hunger burden B = 1 + 2.8 (f - 0.5) + 1.2 (m - 0.5), kept between 0.5 and 3', () => {
  close(hungerBurden(0.7, 0.5), 1.56);
  close(hungerBurden(0.5, 0.7), 1.24);
  close(hungerBurden(0.6, 0.6), 1 + 0.28 + 0.12);
  assert.equal(hungerBurden(1, 1), 3, 'the largest burden any valid traits give');
  assert.equal(hungerBurden(2, 2), 3, 'clamped above');
  assert.equal(hungerBurden(0, 0), 0.5, 'clamped below');
  assert.equal(hungerBurden(0.3, 0.5), 0.5, '1 - 0.56 = 0.44 is lifted to 0.5');
  close(hungerBurden(0.32, 0.5), 0.5, 1e-9);
  assert.ok(hungerBurden(0.33, 0.5) > 0.5);
  assert.equal(TRAIT_RULES.burdenMin, 0.5);
  assert.equal(TRAIT_RULES.burdenMax, 3);
});

test('RULES.md Traits: tolerance T(x) = 2 - 2x up to 0.5, 1.5 - x above', () => {
  assert.equal(tolerance(0), 2);
  assert.equal(tolerance(0.25), 1.5);
  assert.equal(tolerance(0.5), 1);
  assert.equal(tolerance(0.75), 0.75);
  assert.equal(tolerance(1), 0.5);
});

test('RULES.md Traits: climate in desert is T(h) × (0.5 + c); tundra and mountain T(c) × (0.5 + h); 1 elsewhere', () => {
  assert.equal(climateFactor(DESERT, 0, 1), 3);
  assert.equal(climateFactor(DESERT, 1, 0), 0.25);
  assert.equal(climateFactor(DESERT, 0.5, 0.5), 1);
  assert.equal(climateFactor(TUNDRA, 1, 0), 3, 'cold tolerance 0, heat tolerance 1');
  assert.equal(climateFactor(TUNDRA, 0, 1), 0.25);
  assert.equal(climateFactor(MOUNTAIN, 1, 0), 3);
  assert.equal(climateFactor(MOUNTAIN, 0, 1), 0.25);
  for (const t of [COAST, PLAINS, FOREST, HILLS]) assert.equal(climateFactor(t, 0, 1), 1, `terrain ${t}`);
  // Heat tolerance helps in the desert, hurts in tundra.
  assert.ok(climateFactor(DESERT, 0.8, 0.5) < climateFactor(DESERT, 0.2, 0.5));
  assert.ok(climateFactor(TUNDRA, 0.8, 0.5) > climateFactor(TUNDRA, 0.2, 0.5));
});

test('RULES.md Traits: hunger loss = round(35 × B × climate); f = 0.7 gives 55 on plains', () => {
  assert.equal(hungryLoss(0.7, 0.5, 0.5, 0.5, PLAINS), 55);
  assert.equal(hungryLoss(0.7, 0.5, 0.5, 0.5, DESERT), 55);
  assert.equal(hungryLoss(0.5, 0.5, 0, 1, DESERT), 105);
  assert.equal(hungryLoss(0.5, 0.5, 1, 0, DESERT), 9, '8.75 rounds to 9');
  assert.equal(hungryLoss(0.5, 0.5, 1, 0, TUNDRA), 105);
  assert.equal(hungryLoss(0.3, 0.5, 0.5, 0.5, PLAINS), 18, 'B = 0.5 gives 17.5, rounded to 18');
  assert.equal(hungryLoss(1, 1, 0.5, 0.5, PLAINS), 105, 'B = 3');
  // Shelter (level 3) halves it before rounding.
  assert.equal(hungryLoss(0.5, 0.5, 0.5, 0.5, DESERT, 0.5), 18, '17.5 rounds to 18');
  assert.equal(hungryLoss(0.7, 0.5, 0.5, 0.5, DESERT, 0.5), 27, '27.3');
});

/** A one-hex plains map with n people whose metabolism and health come from a function. */
function hexWith(n, food, meta, { health = 100, fert = 0.5 } = {}) {
  const map = makeMap(3, 3, () => PLAINS);
  const people = new People(64);
  for (let k = 0; k < n; k++) {
    const i = people.add(4, 0, 20, health, 0);
    people.setTraits(i, [fert, 0.5, 0.5, 0.5, 0.5, meta(k), 0.5, 0.5]);
  }
  map.food[4] = food;
  return { map, people, s: scratch(map, people) };
}
const doEat = ({ map, people, s }, seed) => eat(people, map, new Rng(seed), s.pop, s.seen, s.picked);
const fedCount = (people) => { let k = 0; for (let i = 0; i < people.high; i++) if (people.hunger[i] === 0) k++; return k; };

test('RULES.md A year 3 Eating: with food >= total need everyone eats and the hex loses their needs', () => {
  const w = hexWith(10, 12.5, () => 1); // need 1.25 each, N = 12.5 exactly
  doEat(w, 'a');
  assert.equal(fedCount(w.people), 10);
  assert.equal(w.map.food[4], 0);
  const v = hexWith(4, 5, (k) => k / 3); // needs 0.75, 0.9167, 1.0833, 1.25
  doEat(v, 'a');
  assert.equal(fedCount(v.people), 4);
  close(v.map.food[4], 1, 1e-5); // 5 - (0.75 + 0.9167 + 1.0833 + 1.25)
});

test('RULES.md A year 3 Eating: with less food, exactly floor(food × n / N) people eat; food never below 0', () => {
  // Mixed needs: 6 at 0.75 and 4 at 1.25, N = 9.5.
  for (let seed = 0; seed < 40; seed++) {
    const food = 5 + (seed % 5) * 0.4; // 5, 5.4, … 6.6
    const w = hexWith(10, food, (k) => (k < 6 ? 0 : 1));
    doEat(w, `mix${seed}`);
    assert.equal(fedCount(w.people), Math.floor((food * 10) / 9.5), `food ${food}`);
    assert.ok(w.map.food[4] >= 0, 'never below 0');
  }
  // All metabolism 0.5: floor(food) people.
  const w = hexWith(10, 6.9, () => 0.5);
  doEat(w, 'plain');
  assert.equal(fedCount(w.people), 6);
  close(w.map.food[4], 0.9, 1e-5);
  // Exactly enough for the picked eaters, or less: food is clamped at 0, never negative.
  let sawClamp = false;
  for (let seed = 0; seed < 60; seed++) {
    const t = hexWith(10, 5, (k) => (k < 4 ? 1 : 0));
    doEat(t, `clamp${seed}`);
    assert.ok(t.map.food[4] >= 0);
    if (t.map.food[4] === 0) sawClamp = true;
  }
  assert.ok(sawClamp);
});

test('RULES.md A year 3 Eating: the unfed lose round(35 × B × climate); the fed gain 25', () => {
  const w = hexWith(2, 0, () => 0.5, { health: 100, fert: 0.7 });
  w.people.setTraits(1, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  doEat(w, 'x');
  assert.deepEqual([w.people.health[0], w.people.health[1]], [45, 65]);
  assert.deepEqual([w.people.hunger[0], w.people.hunger[1]], [1, 1]);
});

test('RULES.md A year 3 Eating: shelter halves the loss in desert, tundra and mountain only', () => {
  for (const [terrain, expected] of [[DESERT, 18], [TUNDRA, 18], [MOUNTAIN, 18], [PLAINS, 35], [FOREST, 35], [HILLS, 35], [COAST, 35]]) {
    const map = makeMap(3, 3, () => terrain);
    map.food.fill(0);
    const people = new People(16);
    people.add(4, 0, 20, 100, 0);
    const s = scratch(map, people);
    eat(people, map, new Rng('s'), s.pop, s.seen, s.picked, undefined, undefined, Float64Array.of(0.5));
    assert.equal(100 - people.health[0], expected, `terrain ${terrain}`);
  }
});

test('RULES.md A year 4 Deaths: old age starts at 35 + 20 × l; 5 years later with a civ delay', () => {
  const deathsAt = (age, l, delay = null) => {
    const people = new People(512);
    for (let k = 0; k < 400; k++) {
      const i = people.add(0, 0, age, 100, 0);
      people.setTraits(i, [0.5, l, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    }
    let died = 0;
    deaths(people, new Rng(`d${age}${l}`), () => { died++; }, delay);
    return died;
  };
  assert.equal(deathsAt(35, 0), 0, 'l = 0: no chance at the start age itself');
  assert.equal(deathsAt(75, 0), 400, 'certain at start + 40');
  assert.equal(deathsAt(55, 1), 0);
  assert.equal(deathsAt(95, 1), 400, 'nobody lives past 95');
  assert.equal(deathsAt(45, 0.5), 0);
  assert.equal(deathsAt(85, 0.5), 400);
  const d = deathsAt(65, 0.5);
  assert.ok(d > 150 && d < 250, `about half at 65: ${d}`);
  // Level 5: five years later.
  assert.ok(deathsAt(85, 0.5, Int32Array.of(5)) < 400, '85 is no longer certain with the delay');
  assert.equal(deathsAt(90, 0.5, Int32Array.of(5)), 400, 'certain at 90');
  assert.ok(deathsAt(95, 1, Int32Array.of(5)) < 400, '95 is no longer certain with the delay');
  assert.equal(deathsAt(100, 1, Int32Array.of(5)), 400, 'nobody lives past 100 in a Kingdom');
  assert.equal(oldAgeChance(95, 1, 5), (95 - 60) / 40);
});

test('RULES.md A year 5 Births: a woman\'s yearly chance is 6 × ((2.5% + 5% f)(0.75 + 0.5 m) + civ bonus) at her best ages', () => {
  const rate = (f, m, bonus = null) => {
    const map = makeMap(3, 3, () => PLAINS);
    map.foodCap.fill(1e6);
    const people = new People(16384);
    for (let k = 0; k < 8000; k++) {
      // Even slots are women (the sex that gives birth), odd slots men with the same traits.
      const i = people.add(k % 9, 0, 27, 100, 0, 1, 0, k % 2 === 0 ? 1 : 0);
      people.setTraits(i, [f, 0.5, 0.5, 0.5, 0.5, m, 0.5, 0.5]);
    }
    const s = scratch(map, people);
    return births(people, map, new Rng(`b${f}${m}`), s.pop, s.parents, () => {}, null, 0, bonus) / 4000;
  };
  // Twins count both children, so births run 1.5% above the women who gave birth.
  const near = (got, want) => assert.ok(Math.abs(got - want * 1.015) < 0.03, `${got} vs ${want}`);
  near(rate(0.5, 0.5), 0.3);
  near(rate(0, 0.5), 0.15);
  near(rate(1, 0.5), 0.45);
  near(rate(0.5, 1), 0.375);
  near(rate(0.5, 0), 0.225);
  near(rate(0.5, 0.5, Float64Array.of(0.02)), 0.42);
});

test('RULES.md Traits: a civ\'s starting traits in TRAITS order; missing ones are 0.5', () => {
  assert.deepEqual(traitValues({ aggression: 0.7, strength: 0.65 }), [0.5, 0.5, 0.65, 0.7, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(traitValues([0.1, 0.2]), [0.1, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(traitValues(undefined), Array(8).fill(0.5));
  assert.equal(TRAIT_RULES.founderSpread, 0.1);
});

const BASES = [
  { heatTolerance: 0.55, coldTolerance: 0.55 }, { aggression: 0.7, strength: 0.65 }, { cooperation: 0.7 },
  { lifeExpectancy: 0.6 }, { metabolism: 0.45, heatTolerance: 0.6, coldTolerance: 0.6 },
];

test('RULES.md Traits: founders are within ±0.1 of their civ\'s starting value, and vary (uniform spread)', () => {
  const people = new People(2000);
  found(people, [0, 1, 2, 3, 4], 200, new Rng('f'), new Rng('ft'), BASES);
  assert.equal(people.count, 1000);
  const base = BASES.map(traitValues);
  for (let i = 0; i < people.high; i++) {
    const c = people.civ[i];
    for (let t = 0; t < 8; t++) {
      const v = people.traits[t][i];
      assert.ok(v >= base[c][t] - 0.1 - 1e-6 && v <= base[c][t] + 0.1 + 1e-6, `civ ${c} trait ${t}: ${v}`);
      assert.ok(v >= 0 && v <= 1);
    }
    close(people.need[i], foodNeed(people.metabolism[i]), 1e-6);
  }
  // Both ends of the spread are used, and the mean is near the starting value.
  let min = 1; let max = 0; let sum = 0;
  for (let i = 0; i < 200; i++) { min = Math.min(min, people.aggression[i]); max = Math.max(max, people.aggression[i]); sum += people.aggression[i]; }
  assert.ok(min < 0.42 && max > 0.58, `${min} ${max}`);
  assert.ok(Math.abs(sum / 200 - 0.5) < 0.02);
  // Without a trait stream, exact values.
  const exact = new People(64);
  found(exact, [0], 5, new Rng('f'), null, [BASES[4]]);
  for (let i = 0; i < 5; i++) assert.deepEqual([...exact.traits.map((a) => a[i])], traitValues(BASES[4]).map(Math.fround));
});

test('founders: each civ can have its own number, numbered on from the civs before', () => {
  const people = new People(64);
  found(people, [0, 1, 2], [3, 5, 2], new Rng('f'), null, null);
  assert.equal(people.count, 10);
  const perCiv = [0, 0, 0];
  for (let i = 0; i < people.high; i++) perCiv[people.civ[i]]++;
  assert.deepEqual(perCiv, [3, 5, 2]);
  assert.deepEqual([...people.founder.slice(0, 10)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('RULES.md Traits: founders are clamped to 0 .. 1 (a starting value near the end cannot leave the range)', () => {
  const people = new People(512);
  found(people, [0], 400, new Rng('c'), new Rng('ct'), [{ fertility: 0.98, strength: 0.03 }]);
  for (let i = 0; i < people.high; i++) for (let t = 0; t < 8; t++) assert.ok(people.traits[t][i] >= 0 && people.traits[t][i] <= 1);
});

/**
 * One hex of mothers (fertility 1, so many children) with their own traits and as many fathers with theirs;
 * returns the children's traits and what the parents' average is.
 */
function children(motherTraits, mutation, seed = 'm', rngOn = true, fatherTraits = motherTraits) {
  const map = makeMap(3, 3, () => PLAINS);
  map.foodCap.fill(1e6);
  const people = new People(4096);
  const n = 400;
  const mother = motherTraits.slice();
  mother[0] = 1;
  for (let k = 0; k < n; k++) people.setTraits(people.add(k % 9, 0, 25, 100, 0, 1, 0, 1), mother);
  for (let k = 0; k < n; k++) people.setTraits(people.add(k % 9, 0, 25, 100, 0, 1, 0, 0), fatherTraits);
  const s = scratch(map, people);
  const first = people.high;
  const got = births(people, map, new Rng(seed), s.pop, s.parents, () => {}, rngOn ? new Rng(`${seed}t`) : null, mutation);
  assert.ok(got > 20, 'enough children to look at');
  const out = [];
  for (let i = first; i < people.high; i++) out.push(people.traits.map((a) => a[i]));
  const avg = mother.map((v, t) => (Math.fround(v) + Math.fround(fatherTraits[t])) / 2);
  return { kids: out, avg };
}

test('RULES.md Traits: children get the average of both parents\' traits ± mutation, clamped, drawn separately per trait', () => {
  const mother = [1, 0.5, 0.02, 0.98, 0.5, 0.5, 0.5, 0.5];
  const father = [0.6, 0.3, 0, 1, 0.5, 0.5, 0.5, 0.5];
  const { kids, avg } = children(mother, 0.05, 'm', true, father);
  let moved = 0;
  const seenSigns = [new Set(), new Set()];
  for (const k of kids) {
    for (let t = 0; t < 8; t++) {
      assert.ok(k[t] >= 0 && k[t] <= 1, 'clamped to 0 .. 1');
      assert.ok(Math.abs(k[t] - avg[t]) <= 0.05 + 1e-6, `trait ${t} moved ${k[t] - avg[t]}`);
    }
    if (Math.abs(k[1] - 0.4) > 1e-6) moved++;
    seenSigns[0].add(Math.sign(k[1] - 0.4));
    seenSigns[1].add(Math.sign(k[4] - 0.5));
  }
  assert.ok(Math.abs(avg[1] - 0.4) < 1e-6 && Math.abs(avg[0] - 0.8) < 1e-6, 'the average, not the mother\'s value');
  assert.ok(moved > kids.length * 0.9, 'a trait moves almost every time');
  assert.ok(seenSigns[0].has(1) && seenSigns[0].has(-1), 'both directions');
  assert.ok(kids.some((k) => k[2] === 0), 'clamped at 0');
  assert.ok(kids.some((k) => k[3] === 1), 'clamped at 1');
  assert.ok(kids.some((k) => Math.sign(k[1] - 0.4) !== Math.sign(k[4] - 0.5)), 'separate draws per trait');
  const biggest = Math.max(...kids.map((k) => Math.abs(k[1] - 0.4)));
  assert.ok(biggest > 0.045, `${biggest}`);
});

test('RULES.md Traits: mutation 0 (or no trait stream) gives exactly the parents\' average', () => {
  const mother = [1, 0.37, 0.21, 0.83, 0.5, 0.64, 0.12, 0.99];
  const father = [0.2, 0.91, 0.5, 0.17, 0.5, 0.36, 0.88, 0.01];
  for (const run of [children(mother, 0, 'z', true, father), children(mother, 0.05, 'n', false, father)]) {
    for (const kid of run.kids) assert.deepEqual(kid, run.avg.map(Math.fround));
  }
  assert.ok(Math.abs(children(mother, 0, 'z', true, father).avg[1] - 0.64) < 1e-6);
});

test('RULES.md Game settings: mutation 3% by default moves a child by at most ±0.03 from its parents\' average in a seeded run', () => {
  const sim = new Simulation({ seed: 'mut', size: 10, civCount: 1, civTypes: ['expansionist'], startPop: 30 });
  assert.equal(sim.params.mutation, 0.03);
  sim.tick(60);
  const p = sim.people;
  const byId = new Map();
  for (let i = 0; i < p.high; i++) if (p.alive[i]) byId.set(p.id[i], i);
  let checked = 0;
  let moved = 0;
  for (const [, i] of byId) {
    const m = byId.get(p.parent[i]);
    const f = byId.get(p.father[i]);
    if (m === undefined || f === undefined || p.gen[i] === 1) continue;
    for (let t = 0; t < 8; t++) {
      const d = Math.abs(p.traits[t][i] - (p.traits[t][m] + p.traits[t][f]) / 2);
      assert.ok(d <= 0.03 + 1e-6);
      if (d > 1e-6) moved++;
    }
    checked++;
  }
  assert.ok(checked > 10, `children with both parents alive: ${checked}`);
  assert.ok(moved > 0);
});

test('RULES.md Traits: with mutation 0% a child is exactly its parents\' average and no one leaves the founders\' range', () => {
  const sim = new Simulation({ seed: 'nomut', size: 10, civCount: 2, startPop: 20, mutation: 0 });
  const lo = new Float64Array(8).fill(1);
  const hi = new Float64Array(8);
  for (let i = 0; i < sim.people.high; i++) {
    for (let t = 0; t < 8; t++) { lo[t] = Math.min(lo[t], sim.people.traits[t][i]); hi[t] = Math.max(hi[t], sim.people.traits[t][i]); }
  }
  sim.tick(80);
  const p = sim.people;
  assert.ok(p.count > 40);
  const byId = new Map();
  for (let i = 0; i < p.high; i++) if (p.alive[i]) byId.set(p.id[i], i);
  let exact = 0;
  for (const [, i] of byId) {
    for (let t = 0; t < 8; t++) assert.ok(p.traits[t][i] >= lo[t] - 1e-6 && p.traits[t][i] <= hi[t] + 1e-6, 'inside the founders\' range');
    const m = byId.get(p.parent[i]);
    const f = byId.get(p.father[i]);
    if (m === undefined || f === undefined || p.gen[i] === 1) continue;
    for (let t = 0; t < 8; t++) assert.equal(p.traits[t][i], Math.fround((p.traits[t][m] + p.traits[t][f]) / 2));
    exact++;
  }
  assert.ok(exact > 5, `${exact}`);
});

test('RULES.md Traits: a civ\'s own mutation applies to the children born into it', () => {
  const parent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  // The parents are all in civ 0: its entry decides, the other civ's does not.
  const exact = children(parent, Float64Array.of(0, 0.1), 'own0');
  // children() makes every mother's fertility 1, the fathers keep 0.5: the average is 0.75.
  for (const t of exact.kids) assert.deepEqual(t, exact.avg.map(Math.fround));
  const mutated = children(parent, Float64Array.of(0.1, 0), 'own1');
  assert.ok(mutated.kids.some((t) => t.some((v, k) => Math.abs(v - mutated.avg[k]) > 0.01)));
  for (const t of mutated.kids) t.forEach((v, k) => assert.ok(Math.abs(v - mutated.avg[k]) <= 0.1 + 1e-6));
});
