import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION, buildReach, migrate } from '../../src/sim/migration.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { generateMap } from '../../src/sim/mapgen.js';
import { normalizeParams } from '../../src/sim/params.js';
import { Simulation } from '../../src/sim/simulation.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS, FOREST, MOUNTAIN, COAST, DESERT, DEEP_WATER, HILLS, TUNDRA } from '../../src/sim/terrain.js';
import { makeMap, scratch } from './helpers.js';

const C = 55;
const reachOf = (reach, h) => [...reach.targets.slice(reach.offsets[h], reach.offsets[h + 1])];
const nb = (map, h) => [...map.neighbours.slice(h * 6, h * 6 + 6)].filter((v) => v >= 0);
const dist = (map, a, b) => { const p = indexToAxial(a, map.cols); const q = indexToAxial(b, map.cols); return distance(p.q, p.r, q.q, q.r); };

test('RULES.md "Migration" numbers', () => {
  assert.equal(MIGRATION.movePoints, 3);
  assert.equal(MIGRATION.crowdedShare, 0.8);
  assert.equal(MIGRATION.hungryChance, 0.5);
  assert.equal(MIGRATION.crowdedChance, 0.2);
});

test('RULES.md "Migration" reach: a mountain neighbour (cost 3) is reachable, two forest steps (cost 4) are not', () => {
  const [n1, n2] = nb(makeMap(10, 10, () => PLAINS), C);
  const m = nb(makeMap(10, 10, () => PLAINS), n2).find((v) => dist(makeMap(10, 10, () => PLAINS), C, v) === 2);
  const land = new Map([[C, PLAINS], [n1, MOUNTAIN], [n2, FOREST], [m, FOREST]]);
  const map = makeMap(10, 10, (i) => land.get(i) ?? DEEP_WATER);
  const r = reachOf(buildReach(map), C);
  assert.ok(r.includes(n1), 'mountain, cost 3');
  assert.ok(r.includes(n2), 'forest, cost 2');
  assert.ok(!r.includes(m), 'forest then forest, cost 4');
  assert.ok(!r.includes(C), 'not itself');
});

test('RULES.md "Migration" reach: costs 1, 1.5 and 2 add up to at most 3', () => {
  const probe = makeMap(10, 10, () => PLAINS);
  const [n1] = nb(probe, C);
  const far = (from, exclude) => nb(probe, from).find((v) => dist(probe, C, v) === 2 && !exclude.includes(v) && !nb(probe, C).includes(v));
  const check = (t1, t2, reachable) => {
    const n2 = far(n1, []);
    const map = makeMap(10, 10, (i) => (i === C ? PLAINS : i === n1 ? t1 : i === n2 ? t2 : DEEP_WATER));
    assert.equal(reachOf(buildReach(map), C).includes(n2), reachable, `${t1} then ${t2}`);
  };
  check(DESERT, DESERT, true); // 1.5 + 1.5 = 3
  check(FOREST, COAST, true); // 2 + 1 = 3
  check(COAST, FOREST, true); // 1 + 2 = 3
  check(PLAINS, MOUNTAIN, false); // 1 + 3 = 4
  check(DESERT, FOREST, false); // 1.5 + 2 = 3.5
  check(HILLS, HILLS, false); // 4
  check(TUNDRA, TUNDRA, true); // 3
});

test('RULES.md "Migration" reach: three coast steps are reachable, four are not; water cannot be crossed', () => {
  const row = makeMap(10, 10, (i) => (i >= 50 && i <= 59 ? COAST : DEEP_WATER)); // one row of land
  const r = reachOf(buildReach(row), 52);
  assert.deepEqual(r, [49, 50, 51, 53, 54, 55].filter((v) => v >= 50), 'cols 0..5 around col 2, minus itself, within 3 steps');
  const split = makeMap(10, 10, (i) => (i >= 50 && i <= 59 && i !== 54 ? COAST : DEEP_WATER));
  assert.deepEqual(reachOf(buildReach(split), 52), [50, 51, 53], 'the water hex blocks the way east');
  assert.deepEqual(reachOf(buildReach(split), 55), [56, 57, 58], 'and from the other side');
});

test('reach never includes water or itself, is within 3 steps, in index order, on generated maps', () => {
  for (const seed of ['pangaea', 'islands', 'peaks']) {
    const map = generateMap(normalizeParams({ seed, size: 24, water: 0.4 }));
    const reach = buildReach(map);
    assert.equal(reach.offsets.length, map.count + 1);
    for (let h = 0; h < map.count; h++) {
      const r = reachOf(reach, h);
      if (map.terrain[h] === DEEP_WATER) { assert.deepEqual(r, []); continue; }
      let prev = -1;
      for (const v of r) {
        assert.notEqual(map.terrain[v], DEEP_WATER);
        assert.notEqual(v, h);
        assert.ok(v > prev, 'ascending, no duplicates');
        assert.ok(dist(map, h, v) <= 3);
        prev = v;
      }
      // Every land neighbour costs at most 3, so all of them are in reach.
      for (const v of nb(map, h)) if (map.terrain[v] !== DEEP_WATER) assert.ok(r.includes(v), `neighbour ${v} of ${h}`);
    }
  }
});

/** A hungry crowd in hex C with open coast neighbours. */
function setup(nPeople, { hunger = 1, targetFood = null, civs = 1 } = {}) {
  const map = makeMap(10, 10, (i) => (i === C || nb(makeMap(10, 10, () => 0), C).includes(i) ? (i === C ? PLAINS : COAST) : DEEP_WATER));
  const people = new People(Math.max(16, nPeople));
  for (let k = 0; k < nPeople; k++) { const p = people.add(C, k % civs, 25, 50, 0); people.hunger[p] = hunger; }
  if (targetFood) for (const [h, f] of Object.entries(targetFood)) map.food[h] = f;
  const reach = buildReach(map);
  return { map, people, reach, s: scratch(map, people), targets: nb(map, C) };
}

test('RULES.md "Migration": a hungry person sets out with chance 50%', () => {
  const { map, people, reach, s, targets } = setup(4000, { targetFood: { 55: 0 } });
  const moved = migrate(people, map, reach, new Rng('hungry'), s.pop, s.spare, s.dest);
  assert.ok(moved > 1850 && moved < 2150, `${moved} of 4000`);
  let at = 0;
  for (let i = 0; i < people.high; i++) if (people.hex[i] !== C) { at++; assert.ok(targets.includes(people.hex[i])); }
  assert.equal(at, moved);
});

test('RULES.md "Migration": a fed person in an uncrowded hex stays', () => {
  const { map, people, reach, s } = setup(48, { hunger: 0 }); // 48 is exactly 80% of 60: not crowded
  for (let t = 0; t < 30; t++) assert.equal(migrate(people, map, reach, new Rng(`calm${t}`), s.pop, s.spare, s.dest), 0);
});

test('RULES.md "Migration": a fed person in a crowded hex (more than 80% of capacity) sets out with chance 20%', () => {
  const { map, people, reach, s } = setup(49, { hunger: 0 });
  map.food[C] = 60;
  let moved = 0;
  const trials = 200;
  for (let t = 0; t < trials; t++) {
    // Reset positions each trial.
    for (let i = 0; i < people.high; i++) people.hex[i] = C;
    moved += migrate(people, map, reach, new Rng(`crowd${t}`), s.pop, s.spare, s.dest);
  }
  const share = moved / (trials * 49);
  assert.ok(share > 0.17 && share < 0.23, `share ${share}`);
});

test('RULES.md "Migration": with no hex that has spare food above their own, they stay', () => {
  // Own spare = min(60, 0 + 30) - 10 = 20; neighbours (coast, cap 50) at food 0: min(50, 25) - 0 = 25 > 20, so lower the neighbours' people instead.
  const { map, people, reach, s, targets } = setup(10, { targetFood: { 55: 60 } });
  // Own spare 60 - 10 = 50; neighbours' spare 50 (full coast), which is not above 50.
  assert.equal(migrate(people, map, reach, new Rng('none'), s.pop, s.spare, s.dest), 0);
  // And with neighbours' spare at 25 (food 0) it is lower still.
  for (const t of targets) map.food[t] = 0;
  assert.equal(migrate(people, map, reach, new Rng('none2'), s.pop, s.spare, s.dest), 0);
});

test('RULES.md "Migration": spare food counts regrowth (food + 50% capacity, capped) minus the people there now', () => {
  // Own: food 0 -> 30, minus 10 people = 20. Target coast with food 0: 25 - 0 = 25 > 20 -> eligible.
  const a = setup(1000, { targetFood: { 55: 0 } });
  for (const t of a.targets) a.map.food[t] = 0;
  const own = 30 - 1000; // negative: everyone wants to go
  assert.ok(own < 25);
  assert.ok(migrate(a.people, a.map, a.reach, new Rng('s1'), a.s.pop, a.s.spare, a.s.dest) > 300);
  assert.equal(a.s.spare[C], own);
  assert.equal(a.s.spare[a.targets[0]], 25);
  // Boundary: target spare equal to own spare is not enough.
  const b = setup(5, { targetFood: { 55: 0 } }); // own: 30 - 5 = 25
  for (const t of b.targets) b.map.food[t] = 0; // 25 - 0 = 25
  assert.equal(migrate(b.people, b.map, b.reach, new Rng('s2'), b.s.pop, b.s.spare, b.s.dest), 0, 'equal spare: stay');
  b.map.food[b.targets[0]] = 2; // 26 > 25
  let moved = 0;
  for (let t = 0; t < 20; t++) { for (let i = 0; i < b.people.high; i++) b.people.hex[i] = C; moved += migrate(b.people, b.map, b.reach, new Rng(`s3${t}`), b.s.pop, b.s.spare, b.s.dest); }
  assert.ok(moved > 0);
});

test('RULES.md "Migration": the target is picked in proportion to spare food', () => {
  const { map, people, reach, s, targets } = setup(6000, { targetFood: { 55: 0 } });
  for (const t of targets) map.food[t] = 0; // spare 25 each: they all beat own (30 - 6000)
  map.food[targets[0]] = 50; // spare 50
  migrate(people, map, reach, new Rng('weights'), s.pop, s.spare, s.dest);
  const counts = new Map();
  let moved = 0;
  for (let i = 0; i < people.high; i++) if (people.hex[i] !== C) { moved++; counts.set(people.hex[i], (counts.get(people.hex[i]) ?? 0) + 1); }
  const total = 50 + 25 * (targets.length - 1);
  assert.ok(counts.get(targets[0]) / moved > 50 / total - 0.04 && counts.get(targets[0]) / moved < 50 / total + 0.04, `${counts.get(targets[0]) / moved} vs ${50 / total}`);
  for (const t of targets.slice(1)) assert.ok(Math.abs(counts.get(t) / moved - 25 / total) < 0.04);
});

test('RULES.md "Migration": everyone chooses against the same counts, taken before anyone moves', () => {
  // One target with spare 100 and own spare very negative. If movers saw the target filling up, later
  // movers would find its spare dropping; the snapshot must stay fixed.
  const { map, people, reach, s, targets } = setup(300, { targetFood: { 55: 0 } });
  for (const t of targets.slice(1)) map.food[t] = 0;
  map.food[targets[0]] = 50;
  migrate(people, map, reach, new Rng('snap'), s.pop, s.spare, s.dest);
  assert.equal(s.spare[targets[0]], 50, 'spare is the pre-move snapshot');
  assert.equal(s.pop[C], 300);
  assert.equal(s.pop[targets[0]], 0);
});

/** Destinations of 3000 hungry people, with their slots listed in a given order. */
function destinations(order) {
  const { map, people, reach, s, targets } = setup(0, {});
  people.hex.fill(0);
  const n = 3000;
  const ids = order(Array.from({ length: n }, (_, k) => k));
  for (const k of ids) { const p = people.add(C, 0, 25, 50, 0); people.hunger[p] = 1; people.parent[p] = k; }
  Object.assign(s, scratch(map, people));
  map.food[C] = 0;
  for (const t of targets) map.food[t] = 0;
  map.food[targets[0]] = 50;
  migrate(people, map, reach, new Rng('order'), s.pop, s.spare, s.dest);
  const share = new Map();
  let moved = 0;
  for (let i = 0; i < people.high; i++) if (people.hex[i] !== C) { moved++; share.set(people.hex[i], (share.get(people.hex[i]) ?? 0) + 1); }
  return { moved: moved / n, share: targets.map((t) => (share.get(t) ?? 0) / Math.max(1, moved)) };
}

test('migration is order-independent: shuffling people across pool slots gives the same distribution', () => {
  const sorted = destinations((a) => a);
  const reversed = destinations((a) => a.slice().reverse());
  const rng = new Rng('shuffle');
  const shuffled = destinations((a) => { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  for (const d of [reversed, shuffled]) {
    assert.ok(Math.abs(d.moved - sorted.moved) < 0.05, `moved ${d.moved} vs ${sorted.moved}`);
    d.share.forEach((v, k) => assert.ok(Math.abs(v - sorted.share[k]) < 0.05, `target ${k}: ${v} vs ${sorted.share[k]}`));
  }
});

test('migration changes only the hex of people who moved; everything else is untouched', () => {
  const { map, people, reach, s } = setup(200, { targetFood: { 55: 0 } });
  const before = { age: people.age.slice(), health: people.health.slice(), civ: people.civ.slice(), alive: people.alive.slice(), id: people.id.slice() };
  migrate(people, map, reach, new Rng('only'), s.pop, s.spare, s.dest);
  for (const k of Object.keys(before)) assert.deepEqual(people[k], before[k], k);
});

test('in a running sim, migration never lands on water and never leaves the mover reach', () => {
  const sim = new Simulation({ seed: 'wet', size: 20, water: 0.5, civCount: 8, startPop: 60 });
  const { people, map } = sim;
  for (let year = 0; year < 60; year++) {
    sim.tick(1);
    for (let i = 0; i < people.high; i++) if (people.alive[i]) assert.notEqual(map.terrain[people.hex[i]], DEEP_WATER);
    // Re-run migration on the current state: every move must be one reach hop.
    const hexes = people.hex.slice();
    const rng = new Rng(`m${year}`);
    migrate(people, map, sim.reach, rng, sim.hexPop, sim.spare, sim.dest);
    for (let i = 0; i < people.high; i++) {
      if (!people.alive[i] || people.hex[i] === hexes[i]) continue;
      assert.ok(reachOf(sim.reach, hexes[i]).includes(people.hex[i]), `person ${i}: ${hexes[i]} -> ${people.hex[i]}`);
      assert.notEqual(map.terrain[people.hex[i]], DEEP_WATER);
    }
    people.hex.set(hexes); // keep the run itself unchanged by the probe
  }
});
