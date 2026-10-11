// RULES.md "Civ types" and "Migration" (by civ type) (T-022, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CIV_TYPES, CIV_TYPE_NAMES, TYPE_RULES, defaultCivType, civTypeText,
} from '../../src/sim/civTypes.js';
import { CIV_TYPE_TRAITS } from '../../src/sim/traits.js';
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
  assert.deepEqual({ ...TYPE_RULES.expansionist }, { crowdedShare: 0.5 });
  assert.deepEqual({ ...TYPE_RULES.aggressive }, { alwaysFights: true });
  assert.deepEqual({ ...TYPE_RULES.cooperative }, { neverStartsFights: true, switchAwayFactor: 0.5 });
  assert.deepEqual({ ...TYPE_RULES.isolationist }, { fedNeverSetsOut: true });
  assert.deepEqual({ ...TYPE_RULES.nomadic }, { movePoints: 5, setOutFactor: 2 });
});

test('RULES.md "Civ types": the setup screen text is the type\'s sentence, then "Starts with" its traits and "other traits 0.5"', () => {
  assert.equal(civTypeText('expansionist'),
    'Moves on early: its people set out once their hex is half full, long before it is crowded. Starts with fertility 0.58; other traits 0.5.');
  assert.equal(civTypeText('aggressive'), 'Always fights any civ it shares a hex with. Starts with aggression 0.7, strength 0.65; other traits 0.5.');
  assert.equal(civTypeText('cooperative'),
    'Never starts a fight, and its people leave it for another civ half as often as others do. Starts with cooperation 0.7; other traits 0.5.');
  assert.equal(civTypeText('isolationist'),
    'Stays home: its people only set out when they go hungry, never because the hex is crowded. Starts with life expectancy 0.6; other traits 0.5.');
  assert.equal(civTypeText('nomadic'),
    'Wanders far: 5 movement points a year instead of 3, and sets out twice as often. Starts with metabolism 0.45, heat tolerance 0.6, cold tolerance 0.6; other traits 0.5.');
  assert.deepEqual(Object.keys(CIV_TYPE_TRAITS.aggressive), ['aggression', 'strength']);
});

test('RULES.md "Migration" by civ type: the per-civ migration table', () => {
  assert.equal(MIGRATION.movePoints, 3);
  assert.equal(MIGRATION.crowdedShare, 0.8);
  assert.equal(MIGRATION.hungryChance, 0.5);
  assert.equal(MIGRATION.crowdedChance, 0.2);
  const map = makeMap(10, 10, () => PLAINS);
  const rules = migrationRules(CIV_TYPES.concat('nonsense'), map, buildReach(map));
  //                          hungry  fed+crowded  crowded above  movement points
  const want = {
    expansionist: [0.5, 0.2, 0.5, 3],
    aggressive: [0.5, 0.2, 0.8, 3],
    cooperative: [0.5, 0.2, 0.8, 3],
    isolationist: [0.5, 0, 0.8, 3],
    nomadic: [1, 0.4, 0.8, 5],
    nonsense: [0.5, 0.2, 0.8, 3],
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

test('RULES.md "Migration" by type: fed people in a crowded hex set out 20% (Nomadic 40%, Isolationist never)', () => {
  // 49 of 60 is more than 80% for everyone.
  for (const t of ['expansionist', 'aggressive', 'cooperative']) near(moveShare(t, 49), 0.2, 0.035);
  near(moveShare('nomadic', 49), 0.4, 0.04);
  assert.equal(moveShare('isolationist', 49), 0, 'a fed Isolationist never sets out');
  assert.equal(moveShare('isolationist', 59), 0);
});

test('RULES.md "Migration" by type: crowded means above 80% of capacity, above 50% for Expansionist (boundaries)', () => {
  // Capacity 60: 80% is 48 people, 50% is 30.
  for (const t of ['aggressive', 'cooperative', 'nomadic']) {
    assert.equal(moveShare(t, 48), 0, `${t} at exactly 80%`);
    assert.ok(moveShare(t, 49) > 0, `${t} above 80%`);
    assert.equal(moveShare(t, 31), 0, `${t} at 31`);
  }
  assert.equal(moveShare('expansionist', 30), 0, 'exactly 50% is not crowded');
  near(moveShare('expansionist', 31), 0.2, 0.05);
  near(moveShare('expansionist', 48), 0.2, 0.04);
  near(moveShare('expansionist', 49), 0.2, 0.035);
});

test('RULES.md "Migration" by type: Nomadic people have 5 movement points, the others 3', () => {
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
  assert.equal(far('aggressive'), 0, 'no hex within 3 steps has spare food, so nobody can move');
  assert.ok(far('nomadic') >= 4 && far('nomadic') <= 5, 'a Nomadic person reaches hexes 4 and 5 steps away');
  const map = makeMap(10, 10, () => PLAINS);
  const rules = migrationRules(['aggressive', 'nomadic'], map, buildReach(map));
  const count = (c) => rules.reach[c].offsets[C + 1] - rules.reach[c].offsets[C];
  const within = (r) => { let n = 0; for (let h = 0; h < 100; h++) if (h !== C && dist(C, h) <= r) n++; return n; };
  assert.equal(count(0), within(3), 'usual: every plains hex within 3 steps');
  assert.equal(count(1), within(5), 'Nomadic: every plains hex within 5 steps');
  assert.equal(within(3), 36);
});

test('a Simulation builds its migration and contact rules from params.civTypes', () => {
  const types = ['nomadic', 'isolationist', 'expansionist', 'aggressive'];
  const sim = new Simulation({ seed: 'types', civCount: 4, civTypes: types });
  assert.deepEqual(sim.civTypes, types);
  assert.deepEqual([...sim.migrationRules.movePoints], [5, 3, 3, 3]);
  assert.deepEqual([...sim.migrationRules.crowdedChance], [0.4, 0, 0.2, 0.2]);
  assert.deepEqual(sim.stats().civs.map((c) => c.type), types);
  assert.deepEqual(sim.stats().civs.map((c) => c.typeName), ['Nomadic', 'Isolationist', 'Expansionist', 'Aggressive']);
  // Padded to the civ count: a missing type takes the default for that number.
  const padded = new Simulation({ seed: 'types', civCount: 5, civTypes: ['nomadic'] });
  assert.deepEqual(padded.civTypes, ['nomadic', 'aggressive', 'cooperative', 'isolationist', 'nomadic']);
});

test('founders of each civ start at their type\'s traits (civ averages at year 0)', () => {
  const sim = new Simulation({ seed: 'foundtypes', civCount: 5, startPop: 200, civTypes: CIV_TYPES });
  const s = sim.stats().civs;
  const mean = (c, k) => c.startTraits[k];
  assert.ok(Math.abs(mean(s[0], 'fertility') - 0.58) < 0.02);
  assert.ok(Math.abs(mean(s[1], 'aggression') - 0.7) < 0.02);
  assert.ok(Math.abs(mean(s[1], 'strength') - 0.65) < 0.02);
  assert.ok(Math.abs(mean(s[2], 'cooperation') - 0.7) < 0.02);
  assert.ok(Math.abs(mean(s[3], 'lifeExpectancy') - 0.6) < 0.02);
  assert.ok(Math.abs(mean(s[4], 'metabolism') - 0.45) < 0.02);
  assert.ok(Math.abs(mean(s[4], 'heatTolerance') - 0.6) < 0.02);
  assert.ok(Math.abs(mean(s[4], 'coldTolerance') - 0.6) < 0.02);
  assert.ok(Math.abs(mean(s[0], 'aggression') - 0.5) < 0.02, 'other traits 0.5');
});

test('same params and seed give the same state hash with every civ type', () => {
  const run = () => { const s = new Simulation({ seed: 'typed', size: 14, civCount: 5, civTypes: CIV_TYPES, startPop: 30 }); s.tick(250); return s.hash(); };
  assert.equal(run(), run());
});
