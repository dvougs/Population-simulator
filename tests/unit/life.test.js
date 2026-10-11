import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFE, oldAgeChance, eat, deaths, births, regrow, found, pickStarts, DEATH_OLD_AGE, DEATH_STARVATION,
} from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { generateMap } from '../../src/sim/mapgen.js';
import { normalizeParams } from '../../src/sim/params.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS, DEEP_WATER, COAST, DESERT, FOOD_CAPACITY } from '../../src/sim/terrain.js';
import { makeMap, scratch, hexCounts } from './helpers.js';

const plains = () => makeMap(10, 10, () => PLAINS);
const HEX = 55;

test('RULES.md "A year" numbers', () => {
  assert.equal(LIFE.foodPerPerson, 1);
  assert.equal(LIFE.foodRegrowth, 0.5);
  assert.equal(LIFE.healthMax, 100);
  assert.equal(LIFE.healthFedGain, 25);
  assert.equal(LIFE.healthHungryLoss, 35);
  assert.equal(LIFE.fertileMin, 16);
  assert.equal(LIFE.fertileMax, 40);
  assert.equal(LIFE.baseBirthChance, 0.05);
  assert.equal(LIFE.baseOldAgeStart, 45);
  assert.equal(LIFE.oldAgeSpan, 40);
  assert.equal(LIFE.founderAgeMax, 40);
  assert.equal(LIFE.startMinDistance, 3);
  assert.equal(LIFE.startMinFood, 40);
});

test('RULES.md "A year" 3: old-age chance is (age - 45) / 40, certain at 85', () => {
  assert.equal(oldAgeChance(0), 0);
  assert.equal(oldAgeChance(44), 0);
  assert.equal(oldAgeChance(45), 0);
  assert.equal(oldAgeChance(46), 0.025);
  assert.equal(oldAgeChance(55), 0.25);
  assert.equal(oldAgeChance(65), 0.5);
  assert.equal(oldAgeChance(84), 0.975);
  assert.equal(oldAgeChance(85), 1);
  assert.equal(oldAgeChance(200), 1);
});

function crowd(map, n, { food, health = 50, age = 20, civ = 0 } = {}) {
  const people = new People(16);
  for (let k = 0; k < n; k++) people.add(HEX, civ, age, health, 0);
  if (food !== undefined) map.food[HEX] = food;
  return people;
}

test('RULES.md "A year" 2: enough whole food and everyone eats; food drops by one each', () => {
  const map = plains();
  const people = crowd(map, 10, { food: 10 });
  const s = scratch(map, people);
  eat(people, map, new Rng('e1'), s.pop, s.seen, s.picked);
  assert.equal(map.food[HEX], 0);
  for (let i = 0; i < 10; i++) assert.deepEqual([people.health[i], people.hunger[i]], [75, 0]);
});

test('RULES.md "A year" 2: with fewer whole food units than people exactly floor(food) eat', () => {
  for (const [food, expected] of [[5.9, 5], [5, 5], [0.9, 0], [0, 0], [9.99, 9]]) {
    const map = plains();
    const people = crowd(map, 10, { food });
    const s = scratch(map, people);
    eat(people, map, new Rng(`e${food}`), s.pop, s.seen, s.picked);
    let fed = 0;
    for (let i = 0; i < 10; i++) {
      if (people.hunger[i] === 0) { fed++; assert.equal(people.health[i], 75); }
      else { assert.equal(people.hunger[i], 1); assert.equal(people.health[i], 15); }
    }
    assert.equal(fed, expected, `food ${food}`);
    assert.ok(Math.abs(map.food[HEX] - (food - expected)) < 1e-6, `food left after ${food}`);
  }
});

test('RULES.md "A year" 2: food is shared fairly (every person has the same chance), whatever the slot', () => {
  const trials = 3000;
  const fedCount = new Array(10).fill(0);
  for (let t = 0; t < trials; t++) {
    const map = plains();
    const people = crowd(map, 10, { food: 3 });
    const s = scratch(map, people);
    eat(people, map, new Rng(`fair${t}`), s.pop, s.seen, s.picked);
    for (let i = 0; i < 10; i++) if (people.hunger[i] === 0) fedCount[i]++;
  }
  for (let i = 0; i < 10; i++) {
    const share = fedCount[i] / trials;
    assert.ok(share > 0.26 && share < 0.34, `slot ${i} fed ${share}, expected 0.3`);
  }
});

test('RULES.md "A year" 2: each hex eats from its own food; other hexes are untouched', () => {
  const map = plains();
  const people = new People(16);
  for (let k = 0; k < 4; k++) people.add(10, 0, 20, 50, 0);
  for (let k = 0; k < 4; k++) people.add(11, 1, 20, 50, 0);
  map.food[10] = 2; map.food[11] = 100;
  const s = scratch(map, people);
  eat(people, map, new Rng('two'), s.pop, s.seen, s.picked);
  assert.equal(map.food[10], 0);
  assert.equal(map.food[11], 96);
  assert.equal(map.food[12], 60);
  let fedHere = 0;
  for (let i = 0; i < 4; i++) if (people.hunger[i] === 0) fedHere++;
  assert.equal(fedHere, 2);
  for (let i = 4; i < 8; i++) assert.equal(people.hunger[i], 0);
});

test('RULES.md "A year" 2: health caps at 100 and floors at 0; hunger counts years in a row, fed resets it', () => {
  const map = plains();
  const people = new People(16);
  const a = people.add(HEX, 0, 20, 90, 0); // fed: 90 + 25 -> 100
  const b = people.add(HEX, 0, 20, 100, 0);
  const c = people.add(OTHER, 0, 20, 20, 0); // unfed: 20 - 35 -> 0
  const d = people.add(OTHER, 0, 20, 35, 0); // unfed: 35 - 35 = 0 boundary
  const e = people.add(OTHER, 0, 20, 36, 0); // unfed: 1
  map.food[OTHER] = 0;
  people.hunger[c] = 4;
  const s = scratch(map, people);
  eat(people, map, new Rng('cap'), s.pop, s.seen, s.picked);
  assert.deepEqual([people.health[a], people.health[b]], [100, 100]);
  assert.deepEqual([people.health[c], people.health[d], people.health[e]], [0, 0, 1]);
  assert.equal(people.hunger[c], 5);
  map.food[OTHER] = 5;
  eat(people, map, new Rng('cap2'), s.pop, s.seen, s.picked);
  assert.deepEqual([people.hunger[c], people.hunger[d], people.hunger[e]], [0, 0, 0], 'fed resets hunger');
  assert.deepEqual([people.health[c], people.health[e]], [25, 26]);
});
const OTHER = 77;

test('RULES.md "A year" 3: starvation is the third year in a row without food, from full health', () => {
  const map = plains();
  const people = crowd(map, 1, { food: 0, health: 100 });
  const s = scratch(map, people);
  const dead = [];
  for (let year = 1; year <= 3; year++) {
    eat(people, map, new Rng('s'), s.pop, s.seen, s.picked);
    deaths(people, new Rng('d'), (i, cause) => dead.push([year, cause]));
  }
  assert.deepEqual(dead, [[3, DEATH_STARVATION]]);
  assert.equal(people.count, 0);
});

test('RULES.md "A year" 3: health 0 dies of starvation whatever the age; the callback sees the slot before removal', () => {
  const people = new People(16);
  const a = people.add(0, 0, 10, 0, 0);
  const b = people.add(0, 0, 85, 0, 0);
  const c = people.add(0, 0, 10, 1, 0);
  const seen = [];
  deaths(people, new Rng('x'), (i, cause) => seen.push([i, cause, people.alive[i], people.age[i]]));
  assert.deepEqual(seen, [[a, DEATH_STARVATION, 1, 10], [b, DEATH_STARVATION, 1, 85]]);
  assert.equal(people.alive[c], 1);
});

test('RULES.md "A year" 3: nobody dies of old age at 44 or 45; everyone at 85; about half at 65', () => {
  const run = (age, n) => {
    const people = new People(16);
    for (let k = 0; k < n; k++) people.add(0, 0, age, 100, 0);
    let old = 0;
    deaths(people, new Rng(`age${age}`), (i, cause) => { if (cause === DEATH_OLD_AGE) old++; });
    assert.equal(people.count, n - old);
    return old;
  };
  assert.equal(run(44, 2000), 0);
  assert.equal(run(45, 2000), 0);
  assert.equal(run(85, 2000), 2000);
  assert.equal(run(120, 100), 100);
  const half = run(65, 4000);
  assert.ok(half > 1850 && half < 2150, `age 65 deaths ${half}`);
  const quarter = run(55, 4000);
  assert.ok(quarter > 850 && quarter < 1150, `age 55 deaths ${quarter}`);
  const few = run(46, 8000);
  assert.ok(few > 120 && few < 290, `age 46 deaths ${few}`);
});

/** n adults of one civ in hex h, all fed. */
function adults(people, h, n, age, civ = 0) {
  for (let k = 0; k < n; k++) people.add(h, civ, age, 100, 0);
}

test('RULES.md "A year" 4: fertile ages are 16 to 40 inclusive', () => {
  const map = plains();
  const born = (age) => {
    const people = new People(16);
    // 50 hexes of 50 people each: below the capacity of 60, 2500 chances.
    for (let h = 0; h < 50; h++) adults(people, h, 50, age);
    const s = scratch(map, people);
    return births(people, map, new Rng(`b${age}`), s.pop, s.parents, () => {});
  };
  assert.equal(born(15), 0);
  assert.equal(born(41), 0);
  assert.equal(born(0), 0);
  assert.equal(born(85), 0);
  for (const age of [16, 17, 30, 40]) {
    const n = born(age);
    assert.ok(n > 85 && n < 170, `age ${age}: ${n} births from 2500 adults (expected about 125)`);
  }
});

test('RULES.md "A year" 4: only people who ate this year have children', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) adults(people, h, 50, 25);
  for (let i = 0; i < people.high; i++) people.hunger[i] = 1;
  const s = scratch(map, people);
  assert.equal(births(people, map, new Rng('hungry'), s.pop, s.parents, () => {}), 0);
});

test('RULES.md "A year" 4: no births in a hex with people (all civs) >= food capacity; one below still has them', () => {
  const map = plains(); // capacity 60
  const trial = (n) => {
    let total = 0;
    for (let t = 0; t < 40; t++) {
      const people = new People(16);
      adults(people, HEX, Math.ceil(n / 2), 25, 0);
      adults(people, HEX, Math.floor(n / 2), 25, 1);
      const s = scratch(map, people);
      total += births(people, map, new Rng(`cap${n}-${t}`), s.pop, s.parents, () => {});
    }
    return total;
  };
  assert.equal(trial(61), 0);
  assert.equal(trial(60), 0);
  assert.ok(trial(59) > 0, 'at 59 of 60 births happen');
  assert.ok(trial(1) > 0);
});

test('RULES.md "A year" 4: births are decided against the head count before any child is added', () => {
  const map = plains();
  const people = new People(256);
  adults(people, HEX, 59, 25);
  const before = people.count;
  const s = scratch(map, people);
  let n = 0;
  for (let t = 0; t < 200 && n < 2; t++) n = births(people, map, new Rng(`multi${t}`), s.pop, s.parents, () => {});
  assert.ok(n >= 2, 'several parents in one hex can all give birth even when that goes over capacity');
  assert.ok(people.count - before >= 2);
});

test('RULES.md "A year" 4: the child is age 0, health 100, hunger 0, in the parent hex and civ, with the parent recorded', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) adults(people, h, 40, 30, h % 3);
  const parentsOf = new Map();
  const s = scratch(map, people);
  const high = people.high;
  const kids = [];
  const n = births(people, map, new Rng('kid'), s.pop, s.parents, (c) => kids.push(c));
  assert.ok(n > 0);
  assert.equal(kids.length, n);
  assert.equal(people.count, high + n);
  for (const c of kids) {
    assert.ok(c >= high || people.alive[c], 'child lives in the pool');
    const parent = people.id[c] && [...Array(high).keys()].find((i) => people.id[i] === people.parent[c]);
    assert.notEqual(parent, undefined, 'parent recorded');
    assert.deepEqual([people.age[c], people.health[c], people.hunger[c]], [0, 100, 0]);
    assert.equal(people.hex[c], people.hex[parent]);
    assert.equal(people.civ[c], people.civ[parent]);
    assert.ok(!parentsOf.has(c));
  }
});

test('births take the slots freed by deaths; high does not grow', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) adults(people, h, 40, 30);
  const high = people.high;
  const doomed = [3, 100, 500, 900, 1200, 1500, 1900];
  doomed.forEach((i) => people.remove(i));
  const s = scratch(map, people);
  let n = 0;
  for (let t = 0; t < 50 && n === 0; t++) n = births(people, map, new Rng(`reuse${t}`), s.pop, s.parents, () => {});
  assert.ok(n > 0);
  assert.equal(people.high, high + Math.max(0, n - doomed.length));
  assert.ok(n <= doomed.length ? people.high === high : true);
  assert.equal(people.count + people.freeTop, people.high);
});

test('RULES.md "A year" 6: regrowth adds 50% of capacity, never above capacity', () => {
  const map = makeMap(10, 10, (i) => (i % 2 ? COAST : PLAINS));
  map.food[0] = 0; map.food[1] = 0; map.food[2] = 30; map.food[3] = 25; map.food[4] = 59; map.food[5] = 50;
  regrow(map);
  assert.deepEqual([...map.food.slice(0, 6)], [30, 25, 60, 50, 60, 50]);
  assert.equal(map.food[6], 60, 'full hexes stay full');
});

test('regrowth leaves water at 0', () => {
  const map = makeMap(10, 10, (i) => (i === 0 ? DEEP_WATER : PLAINS));
  regrow(map);
  assert.equal(map.food[0], 0);
});

test('RULES.md "Civilisations and people": founders are age 0-39, health 100, hunger 0, no parent, on their start hex', () => {
  const people = new People(16);
  found(people, [12, 40, 12], 200, new Rng('found'));
  assert.equal(people.count, 600);
  const ages = new Set();
  for (let i = 0; i < 600; i++) {
    const c = Math.floor(i / 200);
    assert.equal(people.civ[i], c);
    assert.equal(people.hex[i], [12, 40, 12][c]);
    assert.deepEqual([people.health[i], people.hunger[i], people.parent[i]], [100, 0, 0]);
    assert.ok(people.age[i] >= 0 && people.age[i] <= 39);
    ages.add(people.age[i]);
  }
  assert.ok(ages.has(0) && ages.has(39), 'both ends of the age range are used');
  assert.equal(ages.size, 40);
});

const axial = (map, i) => indexToAxial(i, map.cols);
const dist = (map, a, b) => { const p = axial(map, a); const q = axial(map, b); return distance(p.q, p.r, q.q, q.r); };

test('RULES.md "Civilisations and people": start hexes are good land at least 3 steps apart', () => {
  for (const seed of ['pangaea', 'a', 'b', 'c']) {
    const map = generateMap(normalizeParams({ seed, size: 30 }));
    const starts = pickStarts(map, 8, new Rng(`${seed}:p`));
    assert.equal(starts.length, 8);
    for (const s of starts) {
      assert.notEqual(map.terrain[s], DEEP_WATER);
      assert.ok(map.foodCap[s] >= 40, `start ${s} capacity ${map.foodCap[s]}`);
    }
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) assert.ok(dist(map, starts[a], starts[b]) >= 3, `${seed}: ${a},${b}`);
  }
});

test('start hexes: the same rng gives the same starts', () => {
  const map = generateMap(normalizeParams({ seed: 'same', size: 20 }));
  assert.deepEqual(pickStarts(map, 5, new Rng('r')), pickStarts(map, 5, new Rng('r')));
});

test('start hexes: with no good hex 3 steps away, the good hex farthest away is used (lowest index on ties)', () => {
  // Only 40, 41, 42 in a row are land (plains); everything else is water.
  const map = makeMap(10, 10, (i) => (i >= 40 && i <= 42 ? PLAINS : DEEP_WATER));
  for (let t = 0; t < 10; t++) {
    const starts = pickStarts(map, 3, new Rng(`far${t}`));
    const first = starts[0];
    assert.ok([40, 41, 42].includes(first));
    if (first === 40) assert.equal(starts[1], 42);
    else if (first === 42) assert.equal(starts[1], 40);
    else assert.equal(starts[1], 40, 'tie between 40 and 42: lowest index');
    // Third: farthest from the nearest earlier start.
    for (const s of starts) assert.ok([40, 41, 42].includes(s));
  }
});

test('start hexes: with no good hexes at all, any land counts as good; several civs may share one hex', () => {
  const map = makeMap(10, 10, (i) => (i === 33 ? DESERT : DEEP_WATER));
  assert.equal(FOOD_CAPACITY[DESERT] < 40, true);
  assert.deepEqual(pickStarts(map, 3, new Rng('d')), [33, 33, 33]);
  const none = makeMap(10, 10, () => DEEP_WATER);
  assert.deepEqual(pickStarts(none, 3, new Rng('w')), []);
});

test('start hexes: capacity 40 qualifies (forest), 39 does not', () => {
  // A forest hex (40) and a hills hex (30) far apart: only the forest is good.
  const map = makeMap(10, 10, (i) => (i === 11 ? 3 : i === 88 ? 4 : DEEP_WATER));
  for (let t = 0; t < 5; t++) assert.equal(pickStarts(map, 1, new Rng(`f${t}`))[0], 11);
});

test('hexCounts helper counts alive people only', () => {
  const people = new People(16);
  adults(people, 5, 3, 20);
  people.remove(1);
  assert.equal(hexCounts(people, 10)[5], 2);
});
