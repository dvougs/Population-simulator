// RULES.md "Migration" (one hex a year, "Where civs expand") and "Start hexes" with chosen starting positions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION, buildStepReach, migrate, migrationRules } from '../../src/sim/migration.js';
import { pickStarts } from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation, startHexes } from '../../src/sim/simulation.js';
import { generateMap } from '../../src/sim/mapgen.js';
import { normalizeParams } from '../../src/sim/params.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS, COAST, DEEP_WATER } from '../../src/sim/terrain.js';
import { WOOD, MATERIAL_COUNT } from '../../src/sim/materials.js';
import { makeMap, scratch } from './helpers.js';

const C = 55;
const list = (r, h) => [...r.targets.slice(r.offsets[h], r.offsets[h + 1])];
const nbOf = (map, h) => [...map.neighbours.slice(h * 6, h * 6 + 6)];

test('RULES.md "Migration" numbers for where civs expand', () => {
  assert.equal(MIGRATION.materialWeight, 3);
  assert.equal(MIGRATION.avoidWeight, 0.25);
  assert.equal(MIGRATION.pushWeight, 2);
  assert.equal(MIGRATION.contiguityPerHex, 0.2);
  assert.equal(MIGRATION.ownCivWeight, 2);
});

test('RULES.md "Reach": one hex a year, whatever the terrain; water blocks; with boats, land one water hex away', () => {
  const plains = makeMap(10, 10, () => PLAINS);
  const step = buildStepReach(plains);
  assert.deepEqual(list(step, C), nbOf(plains, C).sort((a, b) => a - b));
  const [w] = nbOf(plains, C);
  const wet = makeMap(10, 10, (i) => (i === w ? DEEP_WATER : PLAINS));
  assert.equal(list(buildStepReach(wet), C).length, 5, 'the water neighbour is not in reach');
  const boat = list(buildStepReach(wet, true), C);
  const across = nbOf(wet, w).filter((v) => v >= 0 && v !== C && wet.terrain[v] !== DEEP_WATER);
  for (const v of across) assert.ok(boat.includes(v), `${v} across the water`);
  assert.ok(!boat.includes(w) && !boat.includes(C), 'never water, never itself');
  assert.deepEqual(boat, [...boat].sort((a, b) => a - b), 'in index order');
  assert.deepEqual(list(buildStepReach(wet), w), [], 'water hexes have no reach');
});

/** C with two opposite coast neighbours A and B (and optionally D, A's far neighbour) as the only land. movers: civ per hungry mover in C. */
function opposite({ movers, residents = [], withD = false, civs = 2 }) {
  const probe = makeMap(10, 10, () => PLAINS);
  const n = nbOf(probe, C);
  const A = n[0];
  const B = n[3];
  const D = nbOf(probe, A)[0];
  const land = new Set([C, A, B, ...(withD ? [D] : [])]);
  const map = makeMap(10, 10, (i) => (i === C ? PLAINS : land.has(i) ? COAST : DEEP_WATER));
  const people = new People(movers.length + residents.length + 16);
  for (const [h, c] of residents) people.add(h === 'A' ? A : h === 'B' ? B : D, c, 25, 100, 0);
  for (const c of movers) { const p = people.add(C, c, 25, 50, 0); people.hunger[p] = 1; }
  map.food.fill(0);
  const types = Array(civs).fill('expansionist');
  const rules = migrationRules(types, map, null);
  rules.want = new Uint16Array(civs);
  return { map, people, rules, s: scratch(map, people), held: new Uint8Array(civs * map.count), A, B, D };
}
const run = (w, seed) => migrate(w.people, w.map, null, new Rng(seed), w.s.pop, w.s.spare, w.s.dest, w.held, w.rules);
function share(w) {
  let a = 0; let b = 0;
  for (let i = 0; i < w.people.high; i++) {
    if (w.people.hunger[i] === 0) continue;
    if (w.people.hex[i] === w.A) a++; else if (w.people.hex[i] === w.B) b++;
  }
  assert.ok(a + b > 5000, `${a + b} moved`);
  return a / (a + b);
}
const near = (got, want, eps = 0.02) => assert.ok(Math.abs(got - want) <= eps, `${got.toFixed(3)} vs ${want.toFixed(3)}`);
const movers = (n = 20000, c = 0) => new Array(n).fill(c);

test('RULES.md "Where civs expand": a hex with a deposit the next level needs counts x 3', () => {
  const w = opposite({ movers: movers() });
  w.map.deposits[w.A] = 1 << WOOD;
  w.rules.want[0] = 1 << WOOD;
  run(w, 'mat');
  near(share(w), 3 / 4);
  // Not needed (the stockpile covers it): no pull.
  const v = opposite({ movers: movers() });
  v.map.deposits[v.A] = 1 << WOOD;
  run(v, 'nomat');
  near(share(v), 1 / 2);
});

test('RULES.md "Where civs expand": threats it does not beat x 0.25, threats it beats x 2', () => {
  // A holds one person of civ 1: its spare is 24 against B's 25. Both hexes touch C, held by the movers (x 1.2 each).
  const make = (hostile, beats) => {
    const w = opposite({ movers: movers(), residents: [['A', 1]] });
    w.rules.hostile[0] = hostile ? 1 << 1 : 0;
    w.rules.beats[0] = beats ? 1 << 1 : 0;
    run(w, `t${hostile}${beats}`);
    return share(w);
  };
  near(make(false, false), 24 / 49);
  near(make(true, false), (24 * 0.25) / (24 * 0.25 + 25));
  near(make(true, true), 48 / 73);
});

test('RULES.md "Where civs expand": each neighbour already held by the civ adds 20%', () => {
  // D, beyond A, holds a resident of civ 0: A touches C and D (x 1.4), B only C (x 1.2).
  const w = opposite({ movers: movers(), residents: [['D', 0]], withD: true });
  run(w, 'contig');
  near(share(w), 1.4 / 2.6, 0.012);
});

test('without expansion priorities (no rules.want) the weights are the plain spare food, x 2 for the own civ', () => {
  const w = opposite({ movers: movers(), residents: [['D', 0]], withD: true });
  w.rules.want = null;
  run(w, 'plain');
  near(share(w), 1 / 2);
});

test('RULES.md "Where civs expand": threats and who beats them, as the Simulation works them out', () => {
  const sim = new Simulation({ seed: 'threats', civCount: 3, civTypes: ['cooperative', 'aggressive', 'expansionist'] });
  // People counts come from the year's start; a civ with nobody threatens nobody.
  sim.levels.civPop.set([10, 10, 10]);
  sim.expansionPriorities();
  const r = sim.migrationRules;
  assert.equal(r.hostile[0], 1 << 1, 'the Aggressive civ threatens civ 0');
  assert.equal(r.beats[0], 0, 'a Cooperative civ never pushes');
  assert.equal(r.hostile[2], 1 << 1);
  assert.equal(r.hostile[1], 0, 'nobody threatens the Aggressive civ yet');
  assert.equal(r.beats[2], 0, 'same size: not stronger');
  sim.levels.civPop[2] = 11;
  sim.expansionPriorities();
  assert.equal(r.beats[2], 1 << 1, 'more people: stronger');
  sim.levels.civPop[2] = 10;
  // The Aggressive civ beats every threat; a lost fight makes civ 2 one.
  sim.contact.lostTo[1 * 3 + 2] = sim.tickCount;
  sim.expansionPriorities();
  assert.equal(r.hostile[1], 1 << 2);
  assert.equal(r.beats[1], 1 << 2, 'Aggressive: beats it');
  // A fight lost longer ago than revengeYears no longer counts.
  sim.contact.lostTo[2 * 3 + 0] = sim.tickCount - 21;
  sim.expansionPriorities();
  assert.equal(r.hostile[2], 1 << 1);
  sim.contact.lostTo[2 * 3 + 0] = sim.tickCount - 20;
  sim.expansionPriorities();
  assert.equal(r.hostile[2], (1 << 1) | 1);
  // A Kingdom threatens civs that are not Kingdoms and beats them.
  sim.levels.level[2] = 5;
  sim.expansionPriorities();
  assert.ok(r.hostile[0] & (1 << 2));
  assert.equal(r.beats[2] & (1 << 1), 1 << 1, 'the Kingdom beats the Aggressive civ');
  assert.equal(r.hostile[2] & (1 << 0), 1, 'still a threat to the Kingdom...');
  assert.equal(r.beats[2] & 1, 1, '...which beats it');
  // Wanted materials: the first three for level 2, none past Kingdom.
  assert.equal(r.want[0], 0b111);
  assert.equal(r.want[2], 0);
  // All of a civ's stores together count, not just its capital's.
  const st = sim.levels.settlements;
  st.holder[7] = 0;
  st.store[7 * MATERIAL_COUNT] = 79.99;
  st.totals(sim.levels.held);
  sim.expansionPriorities();
  assert.equal(r.want[0], 0b111, 'a hundredth short of the 80 wood: still wanted');
  st.store[7 * MATERIAL_COUNT] = 80;
  st.totals(sim.levels.held);
  sim.expansionPriorities();
  assert.equal(r.want[0], 0b110, 'a material its stores cover is no longer wanted');
});

test('RULES.md "Start hexes": chosen starts are used when land and not taken; the rest keep 3 steps from them', () => {
  const map = makeMap(12, 12, (i) => (i % 12 === 0 ? DEEP_WATER : PLAINS));
  const auto = pickStarts(map, 3, new Rng('s'));
  assert.deepEqual(pickStarts(map, 3, new Rng('s'), []), auto, 'no choices: the same as before');
  assert.deepEqual(pickStarts(map, 3, new Rng('s'), [-1, -1, -1]), auto);
  const chosen = pickStarts(map, 3, new Rng('s'), [-1, 40, -1]);
  assert.equal(chosen[1], 40);
  const ax = (i) => indexToAxial(i, map.cols);
  for (const c of [0, 2]) assert.ok(distance(ax(chosen[c]).q, ax(chosen[c]).r, ax(40).q, ax(40).r) >= 3, `civ ${c} keeps away from the chosen start`);
  assert.equal(pickStarts(map, 2, new Rng('s'), [25, -1])[0], 25);
  assert.notEqual(pickStarts(map, 2, new Rng('s'), [12, -1])[0], 12, 'water: placed automatically');
  const dup = pickStarts(map, 2, new Rng('s'), [40, 40]);
  assert.equal(dup[0], 40);
  assert.notEqual(dup[1], 40, 'the same hex again: placed automatically');
  assert.notEqual(pickStarts(map, 1, new Rng('s'), [999])[0], 999, 'off the map');
});

test('startHexes gives the starts a new game uses, chosen or not', () => {
  for (const params of [{ seed: 'sh1' }, { seed: 'sh2', size: 30, civCount: 6 }, { seed: 'sh3', civCount: 3, starts: [-1, 33, -1] }]) {
    const p = normalizeParams(params);
    const sim = new Simulation(p);
    assert.deepEqual(startHexes(p, generateMap(p)), sim.starts, JSON.stringify(params));
  }
  const p = normalizeParams({ seed: 'sh4', civCount: 2 });
  const map = generateMap(p);
  let land = -1;
  for (let i = 0; i < map.count; i++) if (map.terrain[i] !== DEEP_WATER) { land = i; break; }
  const sim = new Simulation({ ...p, starts: [land, -1] });
  assert.equal(sim.starts[0], land);
  for (let i = 0; i < sim.people.high; i++) if (sim.people.alive[i] && sim.people.civ[i] === 0) assert.equal(sim.people.hex[i], land);
});

test('a 50 x 50 map (the largest) runs, and bigger sizes are capped to it', () => {
  const sim = new Simulation({ seed: 'huge', size: 100, civCount: 8 });
  assert.equal(sim.map.count, 2500);
  sim.tick(5);
  assert.equal(sim.tickCount, 5);
  assert.ok(sim.stats().totalPop > 0);
});
