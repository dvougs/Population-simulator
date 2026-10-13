import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFE, oldAgeChance, eat, deaths, births, regrow, found, pickStarts, DEATH_OLD_AGE, DEATH_STARVATION,
  DEATH_CHILDHOOD, DEATH_CHILDBIRTH, DEATH_CAUSES, fertileFactor, womanBirthChance, childDeathChance,
} from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { generateMap } from '../../src/sim/mapgen.js';
import { normalizeParams } from '../../src/sim/params.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS, DEEP_WATER, COAST, DESERT, FOOD_CAPACITY } from '../../src/sim/terrain.js';
import { Simulation } from '../../src/sim/simulation.js';
import { makeMap, scratch, hexCounts, addAdults } from './helpers.js';

const plains = () => makeMap(10, 10, () => PLAINS);
const HEX = 55;

test('RULES.md "A year" numbers', () => {
  assert.equal(LIFE.foodPerPerson, 1);
  assert.equal(LIFE.foodRegrowth, 0.5);
  assert.equal(LIFE.healthMax, 100);
  assert.equal(LIFE.healthFedGain, 25);
  assert.equal(LIFE.healthHungryLoss, 35);
  assert.equal(LIFE.fertileMin, 15);
  assert.equal(LIFE.fertileMax, 49);
  assert.deepEqual([...LIFE.fertileCurve], [0.45, 0.95, 1, 0.93, 0.8, 0.45, 0.08]);
  assert.equal(LIFE.baseBirthChance, 0.3);
  assert.equal(LIFE.fatherMin, 16);
  assert.equal(DEATH_CAUSES, 5);
  assert.deepEqual([DEATH_OLD_AGE, DEATH_STARVATION, DEATH_CHILDHOOD, DEATH_CHILDBIRTH], [0, 1, 3, 4]);
  assert.equal(LIFE.baseOldAgeStart, 45);
  assert.equal(LIFE.oldAgeSpan, 40);
  assert.equal(LIFE.founderAgeMin, 14);
  assert.equal(LIFE.founderAgeMax, 31);
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

/** n adults of one civ in hex h, all fed (women and men alternate, so every hex has fathers). */
function adults(people, h, n, age, civ = 0) {
  addAdults(people, h, civ, Math.ceil(n / 2), Math.floor(n / 2), age);
}

test('RULES.md "A year" 5 Births: only women of 15 to 49 have children; the age factor table gives the chance (6 × factor × 5%)', () => {
  const map = plains();
  // 50 hexes × 25 women = 1250 chances; each hex also has 25 men to father.
  const table = [[15, 0.45], [19, 0.45], [20, 0.95], [24, 0.95], [25, 1], [29, 1], [30, 0.93], [34, 0.93],
    [35, 0.8], [39, 0.8], [40, 0.45], [44, 0.45], [45, 0.08], [49, 0.08]];
  for (const [age, factor] of table) {
    const people = new People(16);
    for (let h = 0; h < 50; h++) {
      addAdults(people, h, 0, 25, 0, age);
      addAdults(people, h, 0, 0, 25, 25);
    }
    const s = scratch(map, people);
    const n = births(people, map, new Rng(`age${age}`), s.pop, s.parents, () => {});
    const p = Math.min(1, 6 * factor * 0.05);
    const want = 1250 * p * 1.015; // twins add 1.5%
    const sd = Math.sqrt(1250 * p * (1 - p)) * 1.2;
    assert.ok(Math.abs(n - want) < 5 * sd + 3, `age ${age}: ${n} births, expected about ${Math.round(want)}`);
  }
  for (const age of [0, 14, 50, 51, 85]) {
    const people = new People(16);
    for (let h = 0; h < 50; h++) { addAdults(people, h, 0, 25, 0, age); addAdults(people, h, 0, 0, 25, 25); }
    const s = scratch(map, people);
    assert.equal(births(people, map, new Rng(`out${age}`), s.pop, s.parents, () => {}), 0, `age ${age}`);
  }
});

test('RULES.md "A year" 5 Births: men never give birth, whatever their age', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) addAdults(people, h, 0, 0, 50, 27);
  const s = scratch(map, people);
  assert.equal(births(people, map, new Rng('men'), s.pop, s.parents, () => {}), 0);
});

test('RULES.md "A year" 5 Births: fertility and metabolism scale the yearly chance by 6; the civ bonus adds before the ×6', () => {
  assert.equal(LIFE.birthScale, 6);
  assert.equal(fertileFactor(14), 0);
  assert.equal(fertileFactor(15), 0.45);
  assert.equal(fertileFactor(49), 0.08);
  assert.equal(fertileFactor(50), 0);
  assert.ok(Math.abs(womanBirthChance(25, 0.5, 0.5) - 0.3) < 1e-12);
  assert.ok(Math.abs(womanBirthChance(25, 0.5, 0.5, 0.005) - 0.33) < 1e-12);
  assert.ok(Math.abs(womanBirthChance(15, 1, 0.5) - 6 * 0.45 * 0.075) < 1e-12);
  assert.ok(Math.abs(womanBirthChance(45, 0, 0.5, 0.02) - 6 * 0.08 * 0.045) < 1e-12);
  assert.equal(womanBirthChance(50, 1, 1, 1), 0);
});

test('RULES.md "A year" 5 Births: only women who ate this year have children', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) adults(people, h, 50, 25);
  for (let i = 0; i < people.high; i++) people.hunger[i] = 1;
  const s = scratch(map, people);
  assert.equal(births(people, map, new Rng('hungry'), s.pop, s.parents, () => {}), 0);
});

test('RULES.md "A year" 5 Births: no births in a hex with people (all civs) >= room; one below still has them', () => {
  const map = plains(); // capacity 60
  const trial = (n) => {
    let total = 0;
    for (let t = 0; t < 40; t++) {
      const people = new People(16);
      // n people: women of civ 0 and men of both civs, so the count is exact and a father exists.
      const w = Math.floor(n / 2);
      const m0 = Math.ceil(n / 4);
      addAdults(people, HEX, 0, w, m0, 25);
      addAdults(people, HEX, 1, 0, n - w - m0, 25);
      const s = scratch(map, people);
      total += births(people, map, new Rng(`cap${n}-${t}`), s.pop, s.parents, () => {});
    }
    return total;
  };
  assert.equal(trial(61), 0);
  assert.equal(trial(60), 0);
  assert.ok(trial(59) > 0, 'at 59 of 60 births happen');
  assert.ok(trial(2) > 0);
});

test('RULES.md "A year" 5 Births: births are decided against the head count before any child is added', () => {
  const map = plains();
  const people = new People(256);
  adults(people, HEX, 59, 25);
  const before = people.count;
  const s = scratch(map, people);
  let n = 0;
  for (let t = 0; t < 200 && n < 2; t++) n = births(people, map, new Rng(`multi${t}`), s.pop, s.parents, () => {});
  assert.ok(n >= 2, 'several mothers in one hex can all give birth even when that goes over capacity');
  assert.ok(people.count - before >= 2, 'children were added');
});

test('RULES.md "A year" 5 Births: a father must be a man of her civ aged 16+ in her hex or a neighbouring hex', () => {
  const map = plains();
  const NEIGH = map.neighbours[HEX * 6]; // one hex next to HEX
  const axH = indexToAxial(HEX, map.cols);
  let far = -1;
  for (let i = 0; i < map.count && far < 0; i++) { const a = indexToAxial(i, map.cols); if (distance(axH.q, axH.r, a.q, a.r) === 2) far = i; }
  const run = (setup) => {
    let total = 0;
    for (let t = 0; t < 30; t++) {
      const people = new People(64);
      setup(people);
      const s = scratch(map, people);
      total += births(people, map, new Rng(`father${t}`), s.pop, s.parents, () => {});
    }
    return total;
  };
  const women = (p) => addAdults(p, HEX, 0, 10, 0, 25);
  assert.equal(run((p) => women(p)), 0, 'no man at all');
  assert.equal(run((p) => { women(p); addAdults(p, HEX, 1, 0, 5, 25); }), 0, 'men of another civ do not count');
  assert.equal(run((p) => { women(p); addAdults(p, HEX, 0, 0, 5, 15); }), 0, 'a man of 15 is too young');
  assert.ok(run((p) => { women(p); addAdults(p, HEX, 0, 0, 1, 16); }) > 0, 'one man of 16 is enough for ten women');
  assert.ok(run((p) => { women(p); addAdults(p, NEIGH, 0, 0, 1, 30); }) > 0, 'a man in a neighbouring hex works');
  assert.equal(run((p) => { women(p); addAdults(p, far, 0, 0, 5, 30); }), 0, 'two hexes away is too far');
  assert.equal(run((p) => { women(p); addAdults(p, NEIGH, 1, 0, 5, 30); }), 0, 'a neighbour man of another civ does not count');
});

test('RULES.md "A year" 5 Births: the father is from her own hex when it has a man, else a neighbouring hex', () => {
  const map = plains();
  map.foodCap.fill(1e6);
  const NEIGH = map.neighbours[HEX * 6];
  const people = new People(512);
  addAdults(people, HEX, 0, 30, 0, 25);
  const own = addAdults(people, HEX, 0, 0, 1, 30);
  addAdults(people, NEIGH, 0, 0, 4, 30);
  const s = scratch(map, people);
  const ownId = people.id[own];
  let seen = 0;
  const kids = [];
  births(people, map, new Rng('own'), s.pop, s.parents, (c) => kids.push(c));
  for (const c of kids) { assert.equal(people.father[c], ownId); seen++; }
  assert.ok(seen > 0);
  // With no man at home, each of the neighbours' men is chosen.
  const p2 = new People(512);
  addAdults(p2, HEX, 0, 40, 0, 25);
  const n2 = addAdults(p2, NEIGH, 0, 0, 4, 30);
  const ids = new Set();
  for (let t = 0; t < 5; t++) {
    const kids2 = [];
    const s2 = scratch(map, p2);
    births(p2, map, new Rng(`pick${t}`), s2.pop, s2.parents, (c) => kids2.push(c));
    for (const c of kids2) ids.add(p2.father[c]);
    for (let i = 0; i < p2.high; i++) if (p2.alive[i] && p2.female[i]) p2.rest[i] = 0;
  }
  for (let k = 0; k < 4; k++) assert.ok(ids.has(p2.id[n2 + k]), `neighbour man ${k} is a father sometimes`);
});

test('RULES.md "A year" 5 Births: a mother rests the year after a birth (none last year or this year)', () => {
  const map = plains();
  const people = new People(512);
  addAdults(people, HEX, 0, 20, 20, 25);
  const s = scratch(map, people);
  // Make every woman give birth in "year 0" by a bonus covering the whole chance, no mortality of interest.
  const bonus = Float64Array.of(1);
  const bornBy = (year) => {
    const kids = [];
    births(people, map, new Rng(`rest${year}`), s.pop, s.parents, (c) => kids.push(c), null, 0, bonus);
    return kids;
  };
  // Room: lift the capacity so the growing hex never blocks.
  map.foodCap[HEX] = 1e6;
  const first = bornBy(0);
  const mothers0 = new Set(first.map((c) => people.parent[c]));
  assert.ok(mothers0.size >= 15, 'nearly every woman had a child');
  const second = bornBy(1);
  const mothers1 = new Set(second.map((c) => people.parent[c]));
  for (const id of mothers1) assert.ok(!mothers0.has(id), 'nobody who just gave birth has another child the next year');
  const third = bornBy(2);
  const again = new Set(third.map((c) => people.parent[c]));
  assert.ok([...again].some((id) => mothers0.has(id)), 'two years after, the first mothers can have a child again');
  assert.equal(LIFE.birthRest, 1);
});

test('RULES.md "A year" 5 Births: 1.5% of births are twins and 48.8% of children are girls (seeded sample)', () => {
  const map = plains();
  map.foodCap.fill(1e6);
  let events = 0; let kids = 0; let girls = 0;
  for (let t = 0; t < 4; t++) {
    const people = new People(40000);
    for (let h = 0; h < 90; h++) addAdults(people, h, 0, 100, 100, 25);
    const s = scratch(map, people);
    const parentsSeen = new Map();
    const n = births(people, map, new Rng(`mix${t}`), s.pop, s.parents, (c) => {
      parentsSeen.set(people.parent[c], (parentsSeen.get(people.parent[c]) ?? 0) + 1);
      if (people.female[c]) girls++;
    }, null, 0, Float64Array.of(1));
    kids += n;
    events += parentsSeen.size;
  }
  assert.ok(kids > 30000, `${kids} children`);
  const twinShare = (kids - events) / events;
  assert.ok(twinShare > 0.01 && twinShare < 0.02, `twin share ${twinShare}`);
  const girlShare = girls / kids;
  assert.ok(girlShare > 0.47 && girlShare < 0.505, `girl share ${girlShare}`);
  assert.equal(LIFE.girlShare, 0.488);
  assert.equal(LIFE.twinChance, 0.015);
});

test('RULES.md "A year" 5 Births: the child is age 0, health 100, hunger 0, in the mother\'s hex and civ, with both parents recorded', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) addAdults(people, h, h % 3, 20, 20, 30);
  const snap = new Map(); // id -> [female, civ, hex, age, gen]
  for (let i = 0; i < people.high; i++) snap.set(people.id[i], [people.female[i], people.civ[i], people.hex[i], people.age[i]]);
  const s = scratch(map, people);
  const high = people.high;
  const kids = [];
  const n = births(people, map, new Rng('kid'), s.pop, s.parents, (c) => kids.push(c));
  assert.ok(n > 0);
  assert.equal(kids.length, n);
  for (const c of kids) {
    const mother = snap.get(people.parent[c]);
    const father = snap.get(people.father[c]);
    assert.ok(mother && father, 'both parents recorded');
    assert.equal(mother[0], 1, 'the mother is a woman');
    assert.equal(father[0], 0, 'the father is a man');
    assert.ok(father[3] >= 16);
    assert.equal(people.civ[c], mother[1]);
    assert.equal(father[1], mother[1], 'father of the mother\'s civ');
    assert.equal(people.hex[c], mother[2]);
    assert.deepEqual([people.age[c], people.health[c], people.hunger[c]], [0, 100, 0]);
    assert.equal(people.rest[c] + people.kids[c], 0);
    assert.equal(people.alive[c], 1);
    assert.ok(c >= 0 && c < people.high && people.high >= high);
  }
});

test('RULES.md "Traits" generation: a child is one more than the higher of its parents\' generations', () => {
  const map = plains();
  const people = new People(64);
  const w = people.add(HEX, 0, 25, 100, 0, 3, 0, 1);
  people.add(HEX, 0, 25, 100, 0, 7, 1, 0);
  const s = scratch(map, people);
  const kids = [];
  for (let t = 0; t < 40 && !kids.length; t++) {
    people.rest[w] = 0;
    if (!people.alive[w]) break;
    births(people, map, new Rng(`gen${t}`), s.pop, s.parents, (c) => kids.push(c), null, 0, Float64Array.of(1));
  }
  assert.ok(kids.length > 0);
  for (const c of kids) assert.equal(people.gen[c], 8);
});

test('RULES.md "A year" 5 Births: the mother\'s children borne count goes up by 1, or 2 for twins', () => {
  const map = plains();
  map.foodCap.fill(1e6);
  const people = new People(4096);
  for (let h = 0; h < 90; h++) addAdults(people, h, 0, 20, 20, 25);
  const s = scratch(map, people);
  const kids = [];
  births(people, map, new Rng('kids'), s.pop, s.parents, (c) => kids.push(c), null, 0, Float64Array.of(1));
  const per = new Map();
  for (const c of kids) per.set(people.parent[c], (per.get(people.parent[c]) ?? 0) + 1);
  let twins = 0;
  for (let i = 0; i < people.high; i++) {
    if (!people.alive[i] || !people.female[i]) continue;
    const got = per.get(people.id[i]) ?? 0;
    assert.equal(people.kids[i], got);
    if (got === 2) twins++;
  }
  assert.ok(twins > 0 && twins < 100);
});

test('RULES.md "A year" 5 Childbirth: the mother dies in 1% of births, after her children are added', () => {
  assert.equal(LIFE.childbirthDeath, 0.01);
  const map = plains();
  map.foodCap.fill(1e6);
  const people = new People(40000);
  for (let h = 0; h < 90; h++) addAdults(people, h, 0, 100, 100, 25);
  const women = [];
  for (let i = 0; i < people.high; i++) if (people.female[i]) women.push(people.id[i]);
  const s = scratch(map, people);
  const kids = [];
  const deadMothers = [];
  const ids = new Set();
  const n = births(people, map, new Rng('childbirth'), s.pop, s.parents, (c) => { kids.push(c); ids.add(people.parent[c]); },
    null, 0, Float64Array.of(1), null, (slot, cause) => {
      assert.equal(cause, DEATH_CHILDBIRTH);
      assert.equal(people.female[slot], 1);
      assert.ok(people.kids[slot] >= 1, 'the children are already counted when she dies');
      assert.equal(people.hunger[slot], 0);
      deadMothers.push(people.id[slot]);
    });
  assert.ok(n > 8000);
  const events = ids.size;
  const share = deadMothers.length / events;
  assert.ok(share > 0.005 && share < 0.016, `${deadMothers.length} of ${events} births (${share})`);
  // Children of the dead mothers live on, and the mothers are gone.
  const aliveIds = new Set();
  for (let i = 0; i < people.high; i++) if (people.alive[i]) aliveIds.add(people.id[i]);
  for (const id of deadMothers) assert.ok(!aliveIds.has(id));
  for (const c of kids) assert.equal(people.alive[c], 1);
  assert.equal(people.count, 18000 + n - deadMothers.length);
  assert.ok(women.length === 9000);
});

test('RULES.md "A year" 5 Childbirth: a mother\'s slot is not reused by a child of the same step', () => {
  const map = plains();
  const people = new People(16);
  for (let h = 0; h < 50; h++) addAdults(people, h, 0, 20, 20, 25);
  const s = scratch(map, people);
  const high = people.high;
  const dead = [];
  const kids = [];
  births(people, map, new Rng('slots'), s.pop, s.parents, (c) => kids.push(c), null, 0, Float64Array.of(1), null, (slot) => dead.push(slot));
  // The step started with no free slot, so every child went above the old high mark.
  for (const c of kids) assert.ok(c >= high, `child ${c} took a slot above ${high}`);
});

test('RULES.md "A year" 4: childhood deaths are 20% at age 1, 3% at 2 to 5, 0.5% at 6 to 15, and none at 0 or from 16', () => {
  assert.equal(LIFE.infantDeath, 0.2);
  assert.equal(LIFE.smallChildDeath, 0.03);
  assert.equal(LIFE.childDeath, 0.005);
  const expect = { 0: 0, 1: 0.2, 2: 0.03, 3: 0.03, 5: 0.03, 6: 0.005, 10: 0.005, 15: 0.005, 16: 0 };
  for (const [age, p] of Object.entries(expect)) assert.equal(childDeathChance(Number(age)), p, `age ${age}`);
  const run = (age, n) => {
    const people = new People(n);
    for (let k = 0; k < n; k++) people.add(0, 0, age, 100, 0, 1, 0, k % 2);
    let dead = 0;
    deaths(people, new Rng(`child${age}`), (slot, cause) => { assert.equal(cause, DEATH_CHILDHOOD); dead++; });
    return dead;
  };
  const within = (got, n, p) => assert.ok(Math.abs(got - n * p) < 5 * Math.sqrt(n * p * (1 - p)) + 1, `${got} of ${n} at ${p}`);
  assert.equal(run(0, 2000), 0, 'newborns do not die of childhood in their birth year');
  within(run(1, 10000), 10000, 0.2);
  within(run(2, 10000), 10000, 0.03);
  within(run(5, 10000), 10000, 0.03);
  within(run(6, 20000), 20000, 0.005);
  within(run(15, 20000), 20000, 0.005);
  assert.equal(run(16, 5000), 0, 'a 16-year-old has no childhood death (and is far from old age)');
});

test('RULES.md "A year" 4: a child at health 0 dies of starvation, not childhood', () => {
  const people = new People(16);
  const c = people.add(0, 0, 1, 0, 0, 1, 0, 0);
  const causes = [];
  deaths(people, new Rng('starve'), (slot, cause) => causes.push([slot, cause]));
  assert.deepEqual(causes, [[c, DEATH_STARVATION]]);
});

test('RULES.md "A year" 4: about 1 in 3 never reaches 16 (33%)', () => {
  const survive = 0.8 * 0.97 ** 4 * 0.995 ** 10;
  assert.ok(Math.abs(1 - survive - 0.33) < 0.005);
  const n = 20000;
  const people = new People(n);
  for (let k = 0; k < n; k++) people.add(0, 0, 0, 100, 0);
  const rng = new Rng('lives');
  let dead = 0;
  for (let year = 0; year < 16; year++) {
    deaths(people, rng, () => { dead++; });
    for (let i = 0; i < people.high; i++) if (people.alive[i]) people.age[i]++;
  }
  assert.ok(Math.abs(dead / n - 0.33) < 0.02, `${dead / n}`);
});

test('RULES.md "A year" 5 Births: a seeded two-civ run shows births by women only and the sexes both ways', () => {
  const sim = new Simulation({ seed: 'sexes', size: 12, civCount: 2, startPop: 20 });
  sim.tick(30);
  const p = sim.people;
  const byId = new Map();
  for (let i = 0; i < p.high; i++) if (p.alive[i]) byId.set(p.id[i], i);
  let women = 0; let men = 0; let withMother = 0;
  for (let i = 0; i < p.high; i++) {
    if (!p.alive[i]) continue;
    if (p.female[i]) women++; else men++;
    if (p.gen[i] > 1) {
      withMother++;
      assert.ok(p.father[i] > 0, 'father recorded (founder men have ids above 0)');
    }
  }
  assert.ok(women > 5 && men > 5);
  assert.ok(withMother > 10);
  assert.equal(sim.stats().civs.reduce((a, c) => a + c.men + c.women, 0), women + men);
});

test('births take the slots freed by deaths; high does not grow (the mother who dies is removed after the children are added)', () => {
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

test('RULES.md "Civilisations and people": founders are half women, age 14-31, health 100, hunger 0, no parents, on their start hex', () => {
  const people = new People(16);
  found(people, [12, 40, 12], 200, new Rng('found'));
  assert.equal(people.count, 600);
  const ages = new Set();
  for (let i = 0; i < 600; i++) {
    const c = Math.floor(i / 200);
    assert.equal(people.civ[i], c);
    assert.equal(people.hex[i], [12, 40, 12][c]);
    assert.deepEqual([people.health[i], people.hunger[i], people.parent[i], people.father[i]], [100, 0, 0, 0]);
    assert.ok(people.age[i] >= 14 && people.age[i] <= 31);
    assert.equal(people.female[i], (i % 200) % 2 === 0 ? 1 : 0, 'founders 1, 3, 5 … of a civ are women');
    assert.equal(people.rest[i] + people.kids[i], 0);
    ages.add(people.age[i]);
  }
  assert.ok(ages.has(14) && ages.has(31), 'both ends of the age range are used');
  assert.equal(ages.size, 18);
});

test('RULES.md "Civilisations and people": with an odd number of founders the extra one is a woman', () => {
  for (const [n, women] of [[4, 2], [5, 3], [7, 4], [21, 11], [200, 100]]) {
    const people = new People(16);
    found(people, [12], n, new Rng('odd'));
    let w = 0;
    for (let i = 0; i < people.high; i++) w += people.female[i];
    assert.equal(w, women, `${n} founders`);
  }
  const two = new People(16);
  found(two, [1, 2], [5, 6], new Rng('two'));
  const per = [0, 0];
  for (let i = 0; i < two.high; i++) per[two.civ[i]] += two.female[i];
  assert.deepEqual(per, [3, 3], 'the pattern restarts with each civ');
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
