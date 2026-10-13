// RULES.md "Civ types" and "Migration" (by civ type) (T-022, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CIV_TYPES, CIV_TYPE_NAMES, TYPE_RULES, defaultCivType, civTypeText,
} from '../../src/sim/civTypes.js';
import { peopleTraits } from '../../src/sim/peoples.js';
import { MIGRATION, migrationRules, buildReach, migrate } from '../../src/sim/migration.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS } from '../../src/sim/terrain.js';
import { makeMap, scratch } from './helpers.js';

const C = 55;
const dist = (a, b) => { const p = indexToAxial(a, 10); const q = indexToAxial(b, 10); return distance(p.q, p.r, q.q, q.r); };

test('RULES.md "Civ types": five types in the default order, which repeats', () => {
  assert.deepEqual(CIV_TYPES, ['expansionist', 'aggressive', 'cooperative', 'isolationist', 'nomadic']);
  assert.deepEqual(Object.values(CIV_TYPE_NAMES), ['Expansionist', 'Aggressive', 'Cooperative', 'Isolationist', 'Nomadic']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(defaultCivType),
    ['expansionist', 'aggressive', 'cooperative', 'isolationist', 'nomadic', 'expansionist', 'aggressive', 'cooperative']);
});

test('RULES.md "Civ types": the type table numbers', () => {
  assert.deepEqual({ ...TYPE_RULES.expansionist }, { crowdedShare: 0.3 });
  assert.deepEqual({ ...TYPE_RULES.aggressive }, { alwaysFights: true });
  assert.deepEqual({ ...TYPE_RULES.cooperative }, { neverStartsFights: true, switchAwayFactor: 0.5 });
  assert.deepEqual({ ...TYPE_RULES.isolationist }, { fedKeepsApart: true });
  assert.deepEqual({ ...TYPE_RULES.nomadic }, { movePoints: 5, setOutFactor: 2 });
});

test('RULES.md "Civ types": the setup screen text is the type\'s sentence (starting traits come from the people)', () => {
  assert.equal(civTypeText('expansionist'),
    'Moves on early: its people set out once their hex holds 30% of its food capacity, long before it is crowded at 50%.');
  assert.equal(civTypeText('aggressive'), 'Declares war on any civ it borders.');
  assert.equal(civTypeText('cooperative'), 'Never declares war and only fights for its own land, and its people leave it for another civ half as often as others do.');
  assert.equal(civTypeText('isolationist'), 'Keeps to itself: when its hex is crowded, its people only move to land with no other civ in or next to it.');
  assert.equal(civTypeText('nomadic'), 'Wanders far: 5 movement points a year instead of 3, and sets out twice as often.');
});

test('RULES.md "Migration" by civ type: the per-civ migration table', () => {
  assert.equal(MIGRATION.movePoints, 3);
  assert.equal(MIGRATION.crowdedShare, 0.5);
  assert.equal(MIGRATION.hungryChance, 0.5);
  assert.equal(MIGRATION.crowdedChance, 0.2);
  const map = makeMap(10, 10, () => PLAINS);
  const rules = migrationRules(CIV_TYPES.concat('nonsense'), map, buildReach(map));
  //                          hungry  fed+crowded  crowded above  movement points (0: one hex a year)
  const want = {
    expansionist: [0.5, 0.2, 0.3, 0],
    aggressive: [0.5, 0.2, 0.5, 0],
    cooperative: [0.5, 0.2, 0.5, 0],
    isolationist: [0.5, 0.2, 0.5, 0], // a fed one sets out as usual, but only towards land apart from other civs
    nomadic: [1, 0.4, 0.5, 5],
    nonsense: [0.5, 0.2, 0.5, 0],
  };
  CIV_TYPES.concat('nonsense').forEach((t, c) => {
    assert.deepEqual([rules.hungryChance[c], rules.crowdedChance[c], rules.crowdedShare[c], rules.movePoints[c]], want[t], t);
  });
});

/** A crowd of n people of civ 0 (type `type`) in the middle hex of an all-plains map, with fed or hungry state. */
function crowd(type, n, { hunger = 0 } = {}) {
  const map = makeMap(10, 10, () => PLAINS);
  const people = new People(Math.max(16, n));
  for (let k = 0; k < n; k++) { const i = people.add(C, 0, 25, 50, 0); people.hunger[i] = hunger; }
  const reach = buildReach(map);
  const rules = migrationRules([type], map, reach);
  return { map, people, reach, rules, s: scratch(map, people), held: new Uint8Array(map.count) };
}
function moveShare(type, n, opts, trials = 60) {
  const w = crowd(type, n, opts);
  let moved = 0;
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < w.people.high; i++) w.people.hex[i] = C;
    moved += migrate(w.people, w.map, w.reach, new Rng(`${type}${n}${t}`), w.s.pop, w.s.spare, w.s.dest, w.held, w.rules);
  }
  return moved / (trials * n);
}
const near = (got, want, tol = 0.04) => assert.ok(Math.abs(got - want) <= tol, `${got} vs ${want}`);

test('RULES.md "Migration" by type: hungry people set out 50% (Nomadic 100%)', () => {
  for (const t of ['expansionist', 'aggressive', 'cooperative', 'isolationist']) near(moveShare(t, 40, { hunger: 1 }), 0.5, 0.045);
  assert.equal(moveShare('nomadic', 40, { hunger: 1 }), 1, 'every hungry nomad sets out');
});

test('RULES.md "Migration" by type: fed people in a crowded hex set out 20% (Nomadic 40%, Isolationist 20% but only apart from other civs)', () => {
  // 49 of 60 is more than 50% for everyone.
  for (const t of ['expansionist', 'aggressive', 'cooperative']) near(moveShare(t, 49), 0.2, 0.035);
  near(moveShare('nomadic', 49), 0.4, 0.04);
  near(moveShare('isolationist', 49), 0.2, 0.035);
  near(moveShare('isolationist', 59), 0.2, 0.035);
  assert.equal(moveShare('isolationist', 30), 0, 'not crowded at exactly 50%');
});

/** Civ 0 (Isolationist) crowd of n in C and one person of civ 1 in `other`; where the movers of civ 0 end up, counted per hex. */
function apartRun(n, other, hunger, trials = 40) {
  const map = makeMap(10, 10, () => PLAINS);
  const people = new People(n + 1);
  for (let k = 0; k < n; k++) { const i = people.add(C, 0, 25, 50, 0); people.hunger[i] = hunger; }
  people.add(other, 1, 25, 50, 0);
  const reach = buildReach(map);
  const rules = migrationRules(['isolationist', 'aggressive'], map, reach);
  const s = scratch(map, people);
  const held = new Uint8Array(map.count * 2);
  const ends = new Map();
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < n; i++) people.hex[i] = C;
    people.hex[n] = other;
    migrate(people, map, reach, new Rng(`apart${n}${hunger}${t}`), s.pop, s.spare, s.dest, held, rules);
    for (let i = 0; i < n; i++) if (people.hex[i] !== C) ends.set(people.hex[i], (ends.get(people.hex[i]) ?? 0) + 1);
  }
  return { map, ends };
}

test('RULES.md "Migration" by type: a fed Isolationist never enters a hex with, or next to, another civ\'s people; a hungry one may', () => {
  const other = C + 1; // a neighbour of C
  const { map, ends } = apartRun(49, other, 0);
  const banned = new Set([other, ...map.neighbours.slice(other * 6, other * 6 + 6)]);
  banned.delete(C);
  const nearC = [...map.neighbours.slice(C * 6, C * 6 + 6)];
  assert.ok(nearC.some((h) => banned.has(h)) && nearC.some((h) => !banned.has(h)), 'the scene bans some targets and not others');
  let moved = 0;
  for (const [h, k] of ends) { moved += k; assert.ok(!banned.has(h), `fed mover entered ${h}`); }
  assert.ok(moved > 100, `fed Isolationists still move to the free land: ${moved}`);
  const hungry = apartRun(40, other, 1);
  let into = 0;
  for (const [h, k] of hungry.ends) if (banned.has(h)) into += k;
  assert.ok(into > 0, 'hungry Isolationists go anywhere');
  // Another civ far away changes nothing: all six neighbours are open.
  assert.equal(apartRun(49, 0, 0).ends.size, 6);
});

test('RULES.md "Migration" by type: other types ignore other civs\' people when fed (only Isolationist keeps apart)', () => {
  const map = makeMap(10, 10, () => PLAINS);
  const rules = migrationRules(CIV_TYPES, map, buildReach(map));
  assert.deepEqual([...rules.keepApart], [0, 0, 0, 1, 0]);
});

test('RULES.md "Migration" by type: crowded means above 50% of capacity, above 30% for Expansionist (boundaries)', () => {
  // Capacity 60: 50% is 30 people, 30% is 18.
  for (const t of ['aggressive', 'cooperative', 'nomadic']) {
    assert.equal(moveShare(t, 30), 0, `${t} at exactly 50%`);
    assert.ok(moveShare(t, 31) > 0, `${t} above 50%`);
    assert.equal(moveShare(t, 19), 0, `${t} at 19`);
  }
  assert.equal(moveShare('expansionist', 18), 0, 'exactly 30% is not crowded');
  near(moveShare('expansionist', 19), 0.2, 0.06);
  near(moveShare('expansionist', 30), 0.2, 0.05);
  near(moveShare('expansionist', 31), 0.2, 0.05);
});

test('RULES.md "Migration" by type: Nomadic people have 5 movement points, the others move one hex', () => {
  const far = (type) => {
    const w = crowd(type, 49, { hunger: 1 });
    // Make every hex far from the crowd attractive and the near ones not: only distant hexes have spare food.
    for (let h = 0; h < w.map.count; h++) { if (dist(C, h) < 4) w.map.foodCap[h] = 0; w.map.food[h] = w.map.foodCap[h]; }
    let max = 0;
    for (let t = 0; t < 30; t++) {
      for (let i = 0; i < w.people.high; i++) w.people.hex[i] = C;
      migrate(w.people, w.map, w.reach, new Rng(`far${type}${t}`), w.s.pop, w.s.spare, w.s.dest, w.held, w.rules);
      for (let i = 0; i < w.people.high; i++) max = Math.max(max, dist(C, w.people.hex[i]));
    }
    return max;
  };
  assert.equal(far('aggressive'), 0, 'no neighbour has spare food, so nobody can move');
  assert.ok(far('nomadic') >= 4 && far('nomadic') <= 5, 'a Nomadic person reaches hexes 4 and 5 steps away');
  const map = makeMap(10, 10, () => PLAINS);
  const rules = migrationRules(['aggressive', 'nomadic'], map, buildReach(map));
  const count = (c) => rules.reach[c].offsets[C + 1] - rules.reach[c].offsets[C];
  const within = (r) => { let n = 0; for (let h = 0; h < 100; h++) if (h !== C && dist(C, h) <= r) n++; return n; };
  assert.equal(count(0), 6, 'usual: the six neighbours');
  assert.deepEqual([...rules.reach[0].targets.slice(rules.reach[0].offsets[C], rules.reach[0].offsets[C + 1])],
    [...map.neighbours.slice(C * 6, C * 6 + 6)].sort((a, b) => a - b));
  assert.equal(count(1), within(5), 'Nomadic: every plains hex within 5 steps');
});

test('a Simulation builds its migration and contact rules from params.civTypes', () => {
  const types = ['nomadic', 'isolationist', 'expansionist', 'aggressive'];
  const sim = new Simulation({ seed: 'types', civCount: 4, civTypes: types });
  assert.deepEqual(sim.civTypes, types);
  assert.deepEqual([...sim.migrationRules.movePoints], [5, 0, 0, 0]);
  assert.deepEqual([...sim.migrationRules.crowdedChance], [0.4, 0.2, 0.2, 0.2]);
  assert.deepEqual(sim.stats().civs.map((c) => c.type), types);
  assert.deepEqual(sim.stats().civs.map((c) => c.typeName), ['Nomadic', 'Isolationist', 'Expansionist', 'Aggressive']);
  // Padded to the civ count: a missing type takes the default for that number.
  const padded = new Simulation({ seed: 'types', civCount: 5, civTypes: ['nomadic'] });
  assert.deepEqual(padded.civTypes, ['nomadic', 'aggressive', 'cooperative', 'isolationist', 'nomadic']);
});

test('founders of each civ start at their people\'s traits, whatever the type (civ averages at year 0)', () => {
  const ids = ['romans', 'assyrians', 'babylonians', 'egyptians', 'mongols'];
  // Civ 5 is Mongols with the Cooperative type: the traits stay the Mongols'.
  const sim = new Simulation({ seed: 'foundtypes', civCount: 5, startPop: 200, civs: ids.map((people) => ({ people })),
    civTypes: ['expansionist', 'aggressive', 'cooperative', 'isolationist', 'cooperative'] });
  const s = sim.stats().civs;
  s.forEach((c, k) => {
    for (const [t, v] of Object.entries(peopleTraits(ids[k]))) assert.ok(Math.abs(c.startTraits[t] - v) < 0.02, `${ids[k]} ${t}`);
  });
  assert.equal(s[4].type, 'cooperative');
});

test('same params and seed give the same state hash with every civ type', () => {
  const run = () => { const s = new Simulation({ seed: 'typed', size: 14, civCount: 5, civTypes: CIV_TYPES, startPop: 30 }); s.tick(250); return s.hash(); };
  assert.equal(run(), run());
});
