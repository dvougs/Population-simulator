import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION, buildReach, migrate, migrationRules } from '../../src/sim/migration.js';
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
  assert.equal(MIGRATION.crowdedShare, 0.5);
  assert.equal(MIGRATION.hungryChance, 0.5);
  assert.equal(MIGRATION.crowdedChance, 0.2);
  assert.equal(MIGRATION.ownCivWeight, 2);
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
  const { map, people, reach, s } = setup(30, { hunger: 0 }); // 30 is exactly 50% of 60: not crowded
  for (let t = 0; t < 30; t++) assert.equal(migrate(people, map, reach, new Rng(`calm${t}`), s.pop, s.spare, s.dest), 0);
});

test('RULES.md "Migration": a fed person in a crowded hex (more than 50% of capacity) sets out with chance 20%', () => {
  const { map, people, reach, s } = setup(31, { hunger: 0 });
  map.food[C] = 60;
  let moved = 0;
  const trials = 200;
  for (let t = 0; t < trials; t++) {
    // Reset positions each trial.
    for (let i = 0; i < people.high; i++) people.hex[i] = C;
    moved += migrate(people, map, reach, new Rng(`crowd${t}`), s.pop, s.spare, s.dest);
  }
  const share = moved / (trials * 31);
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

/**
 * Hex C (plains) with exactly two coast neighbours A and B as the only other land.
 * movers: hungry people of the given civs in C; residents: [hex, civ] pairs of fed people.
 */
function twoTargets({ movers, residents = [] }) {
  const probe = makeMap(10, 10, () => PLAINS);
  const [A, B] = nb(probe, C);
  const map = makeMap(10, 10, (i) => (i === C ? PLAINS : i === A || i === B ? COAST : DEEP_WATER));
  const people = new People(movers.length + residents.length + 16);
  for (const [h, c] of residents) people.add(h, c, 25, 100, 0); // fed, uncrowded: they stay
  for (const c of movers) { const p = people.add(C, c, 25, 50, 0); people.hunger[p] = 1; }
  map.food[C] = 0; // own spare = 30 - movers: below anything A or B offers
  map.food[A] = 0;
  map.food[B] = 0;
  return { map, people, reach: buildReach(map), s: scratch(map, people), A, B };
}

/** Share of the movers from C (people of civ `c`, or all) who went to A. */
function shareToA({ map, people, A, B }, c = -1) {
  let a = 0; let b = 0;
  for (let i = 0; i < people.high; i++) {
    if (c >= 0 && people.civ[i] !== c) continue;
    if (people.hunger[i] === 0) continue; // residents
    if (people.hex[i] === A) a++;
    else if (people.hex[i] === B) b++;
  }
  return { a, b, share: a / Math.max(1, a + b) };
}

const civHeld = (map, civs) => new Uint8Array(civs * map.count);

test('RULES.md "Migration": a hex holding the mover\'s own civ weighs ×2 against an equal hex held by another civ', () => {
  // A and B each hold one resident, so both have spare 25 - 1 = 24.
  const w = twoTargets({ movers: new Array(4000).fill(0), residents: [[nb(makeMap(10, 10, () => PLAINS), C)[0], 0], [nb(makeMap(10, 10, () => PLAINS), C)[1], 1]] });
  migrate(w.people, w.map, w.reach, new Rng('own-vs-other'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 2));
  assert.equal(w.s.spare[w.A], 24);
  assert.equal(w.s.spare[w.B], 24);
  const r = shareToA(w);
  assert.ok(r.a + r.b > 1800, `${r.a + r.b} moved`);
  assert.ok(Math.abs(r.share - 2 / 3) < 0.04, `own-civ share ${r.share}, expected 2/3`);
});

test('RULES.md "Migration": a hex holding the mover\'s own civ weighs ×2 against an equal empty hex', () => {
  // A holds one civ-0 resident (spare 24); B is empty, with its capacity lowered so its spare is also 24.
  const [A0] = nb(makeMap(10, 10, () => PLAINS), C);
  const w = twoTargets({ movers: new Array(4000).fill(0), residents: [[A0, 0]] });
  w.map.food[w.B] = 0;
  w.map.foodCap[w.B] = 48; // spare = min(48, 0 + 24) - 0 = 24
  migrate(w.people, w.map, w.reach, new Rng('own-vs-empty'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 1));
  assert.equal(w.s.spare[w.A], 24);
  assert.equal(w.s.spare[w.B], 24);
  const r = shareToA(w);
  assert.ok(Math.abs(r.share - 2 / 3) < 0.04, `own-civ share ${r.share}, expected 2/3`);
});

test('RULES.md "Migration": hexes held only by other civs are not doubled', () => {
  const [A0, B0] = nb(makeMap(10, 10, () => PLAINS), C);
  const w = twoTargets({ movers: new Array(4000).fill(0), residents: [[A0, 1], [B0, 2]] });
  migrate(w.people, w.map, w.reach, new Rng('others'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 3));
  const r = shareToA(w);
  assert.ok(Math.abs(r.share - 1 / 2) < 0.04, `share ${r.share}, expected 1/2`);
  // Both held by the mover's civ: both doubled, still 1/2.
  const v = twoTargets({ movers: new Array(4000).fill(0), residents: [[A0, 0], [B0, 0]] });
  migrate(v.people, v.map, v.reach, new Rng('both-own'), v.s.pop, v.s.spare, v.s.dest, civHeld(v.map, 1));
  assert.ok(Math.abs(shareToA(v).share - 1 / 2) < 0.04);
});

test('RULES.md "Migration": each mover doubles the hexes of their own civ, not someone else\'s', () => {
  const [A0, B0] = nb(makeMap(10, 10, () => PLAINS), C);
  const movers = Array.from({ length: 6000 }, (_, k) => k % 2); // civ 0 and civ 1 interleaved
  const w = twoTargets({ movers, residents: [[A0, 0], [B0, 1]] });
  migrate(w.people, w.map, w.reach, new Rng('mixed'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 2));
  const c0 = shareToA(w, 0).share;
  const c1 = shareToA(w, 1).share;
  assert.ok(Math.abs(c0 - 2 / 3) < 0.04, `civ 0 to its own hex A: ${c0}`);
  assert.ok(Math.abs(c1 - 1 / 3) < 0.04, `civ 1 to A (B is its own): ${c1}`);
});

test('RULES.md "Migration": doubling does not change which hexes qualify (spare above 0 and above own)', () => {
  const [A0, B0] = nb(makeMap(10, 10, () => PLAINS), C);
  // Own spare: min(60, 0 + 30) - 4 = 26. A: food 2 -> 27 - 1 resident = 26, equal, so not eligible even doubled.
  const w = twoTargets({ movers: [0, 0, 0, 0], residents: [[A0, 0]] });
  w.map.food[w.A] = 2;
  w.map.food[w.B] = 0;
  w.map.foodCap[w.B] = 10; // B: min(10, 5) - 0 = 5, below own
  for (let t = 0; t < 30; t++) {
    assert.equal(migrate(w.people, w.map, w.reach, new Rng(`eq${t}`), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 1)), 0);
  }
  assert.equal(w.s.spare[C], 26);
  assert.equal(w.s.spare[w.A], 26);
  // Spare 0 own-civ hex with negative own spare: weight 0 × 2 is still nothing.
  const z = twoTargets({ movers: new Array(100).fill(0), residents: [...new Array(25).fill([A0, 0]), ...new Array(30).fill([B0, 1])] });
  for (let t = 0; t < 10; t++) {
    assert.equal(migrate(z.people, z.map, z.reach, new Rng(`zero${t}`), z.s.pop, z.s.spare, z.s.dest, civHeld(z.map, 2)), 0);
  }
  assert.equal(z.s.spare[z.A], 0);
  assert.equal(z.s.spare[z.B], -5);
});

test('migrate without the held scratch (7 arguments) gives the same moves as with it', () => {
  const [A0, B0] = nb(makeMap(10, 10, () => PLAINS), C);
  const make = () => twoTargets({ movers: Array.from({ length: 500 }, (_, k) => k % 3), residents: [[A0, 0], [B0, 2]] });
  const a = make(); const b = make();
  const ma = migrate(a.people, a.map, a.reach, new Rng('args'), a.s.pop, a.s.spare, a.s.dest);
  const mb = migrate(b.people, b.map, b.reach, new Rng('args'), b.s.pop, b.s.spare, b.s.dest, civHeld(b.map, 3));
  assert.equal(ma, mb);
  assert.deepEqual(a.people.hex, b.people.hex);
});

test('own-civ weighting is order-independent: shuffling pool slots keeps the same split', () => {
  const [A0, B0] = nb(makeMap(10, 10, () => PLAINS), C);
  const run = (order) => {
    const entries = order([
      ...Array.from({ length: 3000 }, (_, k) => ({ mover: true, civ: k % 2 })),
      { mover: false, hex: A0, civ: 0 }, { mover: false, hex: B0, civ: 1 },
    ]);
    const w = twoTargets({ movers: [] });
    const people = new People(entries.length + 16);
    for (const e of entries) {
      if (e.mover) { const p = people.add(C, e.civ, 25, 50, 0); people.hunger[p] = 1; }
      else people.add(e.hex, e.civ, 25, 100, 0);
    }
    const s = scratch(w.map, people);
    migrate(people, w.map, w.reach, new Rng('order-civ'), s.pop, s.spare, s.dest, civHeld(w.map, 2));
    const v = { ...w, people };
    return [shareToA(v, 0).share, shareToA(v, 1).share];
  };
  const sorted = run((a) => a);
  const reversed = run((a) => a.slice().reverse());
  const rng = new Rng('shuffle-civ');
  const shuffled = run((a) => { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  for (const r of [sorted, reversed, shuffled]) {
    assert.ok(Math.abs(r[0] - 2 / 3) < 0.05, `civ 0: ${r[0]}`);
    assert.ok(Math.abs(r[1] - 1 / 3) < 0.05, `civ 1: ${r[1]}`);
  }
});

test('seeded runs: with several civs, migrants never enter water and the Simulation passes a civ-sized held scratch', () => {
  for (const seed of ['wet', 'crowd', 'isles']) {
    const sim = new Simulation({ seed, size: 18, water: 0.5, civCount: 8, startPop: 80 });
    assert.equal(sim.civHeld.length, 8 * sim.map.count);
    for (let year = 0; year < 80; year++) {
      sim.tick(1);
      for (let i = 0; i < sim.people.high; i++) if (sim.people.alive[i]) assert.notEqual(sim.map.terrain[sim.people.hex[i]], DEEP_WATER);
    }
  }
});

test('RULES.md "Kingdoms are closed": nobody of another civ migrates into a hex a Kingdom encloses; its own people may', () => {
  const w = twoTargets({ movers: [...new Array(400).fill(0), ...new Array(400).fill(1), ...new Array(400).fill(2)] });
  const rules = migrationRules(['expansionist', 'aggressive', 'cooperative'], w.map, w.reach);
  rules.inside = new Int8Array(w.map.count).fill(-1);
  rules.inside[w.A] = 1; // civ 1 is the Kingdom enclosing A
  migrate(w.people, w.map, w.reach, new Rng('closed'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 3), rules);
  const r0 = shareToA(w, 0);
  const r1 = shareToA(w, 1);
  const r2 = shareToA(w, 2);
  assert.equal(r0.a, 0, 'civ 0 never enters A');
  assert.equal(r2.a, 0, 'nor does civ 2');
  assert.ok(r0.b > 100 && r2.b > 100, 'they still go to B');
  assert.ok(r1.a > 50 && r1.b > 50, `the Kingdom's own people use both (${r1.a}, ${r1.b})`);
  // Without an enclosure, everyone uses both.
  const v = twoTargets({ movers: new Array(400).fill(0) });
  const open = migrationRules(['expansionist'], v.map, v.reach);
  open.inside = new Int8Array(v.map.count).fill(-1);
  migrate(v.people, v.map, v.reach, new Rng('open'), v.s.pop, v.s.spare, v.s.dest, civHeld(v.map, 1), open);
  assert.ok(shareToA(v, 0).a > 50);
});

test('RULES.md "Migration" Borders at peace: nobody moves into a hex held by a civ in a truce or at peace with them; war, no relation and its own holder do not close it', () => {
  const trial = (relation) => {
    const w = twoTargets({ movers: [...new Array(300).fill(0), ...new Array(300).fill(1), ...new Array(300).fill(2)] });
    const rules = migrationRules(['expansionist', 'expansionist', 'expansionist'], w.map, w.reach);
    rules.holder = new Int8Array(w.map.count).fill(-1);
    rules.holder[w.A] = 1; // civ 1 holds A
    rules.rel = new Uint8Array(9);
    rules.rel[0 * 3 + 1] = relation; // civ 0 and civ 1; civ 2 has no relation with civ 1
    migrate(w.people, w.map, w.reach, new Rng('borders'), w.s.pop, w.s.spare, w.s.dest, civHeld(w.map, 3), rules);
    return [shareToA(w, 0).a, shareToA(w, 1).a, shareToA(w, 2).a];
  };
  for (const [name, rel] of [['truce', 2], ['peace', 3]]) {
    const [a0, a1, a2] = trial(rel);
    assert.equal(a0, 0, `civ 0 never enters A in a ${name}`);
    assert.ok(a1 > 30, 'the holder itself does');
    assert.ok(a2 > 30, 'a civ with no relation does');
  }
  assert.ok(trial(1)[0] > 30, 'at war it does');
  assert.ok(trial(0)[0] > 30, 'no relation: it does');
});
