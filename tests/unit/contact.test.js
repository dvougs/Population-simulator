// RULES.md "Contact": switching civ in shared hexes with no battle this year (T-023, T-030). Fighting is war.js
// (see war.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Contact, CONTACT } from '../../src/sim/contact.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { PLAINS, DEEP_WATER } from '../../src/sim/terrain.js';
import { STRENGTH, AGGRESSION, COOPERATION } from '../../src/sim/traits.js';
import { makeMap } from './helpers.js';

const SIZE = 5;
const HEX = 12; // the middle of a 5 x 5 map; its neighbours are 6, 7, 11, 13, 16, 17 (row 2 is even)

/**
 * groups: [hex, civ, n, { agg, str, coop, hunger }]. Everything else is plain: age 25, other traits 0.5, fed (hunger 0).
 */
function scene(types, groups, { terrain = PLAINS } = {}) {
  const map = makeMap(SIZE, SIZE, () => terrain);
  const people = new People(16384);
  for (const [hex, civ, n, t = {}] of groups) {
    for (let k = 0; k < n; k++) {
      const i = people.add(hex, civ, 25, 100, 0);
      people.hunger[i] = t.hunger ?? 0;
      people.traits[AGGRESSION][i] = t.agg ?? 0.5;
      people.traits[STRENGTH][i] = t.str ?? 0.5;
      people.traits[COOPERATION][i] = t.coop ?? 0.5;
    }
  }
  const contact = new Contact(map, types);
  return { map, people, contact, types, civs: types.length };
}
/** One year of contact; fought: hexes where a battle was fought this year (1), as War.fought. */
function run(w, { seed = 'c', fought = null } = {}) {
  const out = { switches: [], n: 0 };
  out.n = w.contact.year(w.people, w.map, fought, new Rng(`${seed}s`), (from, to) => out.switches.push([from, to]));
  return out;
}
const aliveOf = (w, civ, hex = null) => {
  let n = 0;
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i] && w.people.civ[i] === civ && (hex === null || w.people.hex[i] === hex)) n++;
  return n;
};
const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} vs ${want}`);

test('RULES.md "Contact": the numbers', () => {
  assert.equal(CONTACT.switchPerCooperation, 0.02);
  assert.deepEqual(Object.keys(CONTACT), ['switchPerCooperation'], 'fighting moved to war.js');
});

test('Contact never fights or kills: a shared hex between Aggressive civs only switches', () => {
  const w = scene(['aggressive', 'aggressive'], [[HEX, 0, 200, { agg: 1 }], [HEX, 1, 200, { agg: 1, str: 0 }]]);
  const r = run(w);
  assert.equal(aliveOf(w, 0) + aliveOf(w, 1), 400, 'nobody died');
  assert.equal(r.n, r.switches.length);
});

test('Switching civ: in shared hexes, yearly chance 2% × cooperation (1% at 0.5)', () => {
  const rate = (coop, types = ['expansionist', 'expansionist'], n = 3000) => {
    const w = scene(types, [[HEX, 0, n, { coop, agg: 0 }], [HEX, 1, n, { coop: 0, agg: 0 }]]);
    const r = run(w, { seed: `sw${coop}` });
    assert.ok(r.switches.every(([f, t]) => f === 0 && t === 1), 'civ 1 has coop 0 so only civ 0 switches, to the other civ');
    return r.switches.length / n;
  };
  near(rate(0.5), 0.01, 0.004);
  near(rate(1), 0.02, 0.005);
  near(rate(0.25), 0.005, 0.003);
  assert.equal(rate(0), 0);
});

test('Switching civ: people of a Cooperative civ switch away half as often (x 0.5)', () => {
  const n = 6000;
  const w = scene(['cooperative', 'expansionist'], [[HEX, 0, n, { coop: 1 }], [HEX, 1, 4, { coop: 0 }]]);
  const r = run(w, { seed: 'half' });
  near(r.switches.length / n, 0.01, 0.003);
  const make = () => scene(['expansionist', 'expansionist'], [[HEX, 0, n, { coop: 1, agg: 0 }], [HEX, 1, 4, { coop: 0, agg: 0 }]]);
  const plain = run(make(), { seed: 'half' });
  near(plain.switches.length / n, 0.02, 0.004);
});

test('Switching civ: a switcher joins another civ there in proportion to its people, keeping hex, age, health and traits', () => {
  const w = scene(['expansionist', 'expansionist', 'expansionist'], [[HEX, 0, 4000, { coop: 1, agg: 0 }], [HEX, 1, 3, { coop: 0, agg: 0 }], [HEX, 2, 1, { coop: 0, agg: 0 }]]);
  const before = w.people.age.slice(0, 5);
  const r = run(w, { seed: 'prop' });
  const to = [0, 0, 0];
  for (const [f, t] of r.switches) { assert.equal(f, 0); to[t]++; }
  assert.equal(to[0], 0, 'never back to its own civ');
  near(to[1] / (to[1] + to[2]), 0.75, 0.12);
  assert.ok(to[1] + to[2] > 40);
  assert.equal(aliveOf(w, 0) + to[1] + to[2], 4000, 'nobody died or left');
  assert.deepEqual([...w.people.age.slice(0, 5)], [...before]);
  for (let i = 0; i < 4000; i++) assert.equal(w.people.hex[i], HEX);
});

test('Switching civ: not in a hex with a battle this year, and not in a hex with one civ', () => {
  const make = () => scene(['expansionist', 'expansionist'], [[HEX, 0, 2000, { coop: 1 }], [HEX, 1, 2000, { coop: 1 }]]);
  assert.ok(run(make()).switches.length > 20, 'control: switches without a battle');
  const fought = new Uint8Array(25);
  fought[HEX] = 1;
  assert.equal(run(make(), { fought }).switches.length, 0);
  const alone = scene(['expansionist', 'expansionist'], [[HEX, 0, 2000, { coop: 1 }], [6, 1, 2000, { coop: 1 }]]);
  assert.equal(run(alone).switches.length, 0);
  // A battle in one hex does not stop switching in another shared hex.
  const two = scene(['expansionist', 'expansionist', 'expansionist', 'expansionist'],
    [[HEX, 0, 1000, { coop: 1 }], [HEX, 1, 1000, { coop: 1 }], [18, 2, 1000, { coop: 1 }], [18, 3, 1000, { coop: 1 }]]);
  const rt = run(two, { fought });
  assert.ok(rt.switches.length > 20 && rt.switches.every(([f, t]) => f >= 2 && t >= 2), 'only the battle-free shared hex switches');
});

test('Switching civ: a single civ, or no people, switch nobody (and a water hex is never shared)', () => {
  const w = scene(['expansionist', 'expansionist'], [[HEX, 0, 100, { coop: 1 }]]);
  assert.equal(run(w).switches.length, 0);
  assert.equal(scene(['expansionist'], []).contact.year(new People(4), makeMap(SIZE, SIZE, () => DEEP_WATER), null, new Rng('x'), () => {}), 0);
});

test('a seeded crowded run: the population identity holds with war deaths and switches', () => {
  const startPop = 40;
  let sawWar = false; let sawSwitch = false;
  for (const seed of ['war1', 'war2', 'war3']) {
    const sim = new Simulation({
      seed, size: 10, civCount: 4, startPop, water: 0.5, civTypes: ['aggressive', 'expansionist', 'cooperative', 'nomadic'],
    });
    sim.tick(250);
    for (const c of sim.stats().civs) {
      const deaths = c.deaths.oldAge + c.deaths.starvation + c.deaths.war;
      assert.equal(startPop + c.births - deaths + c.switchesIn - c.switchesOut, c.pop, `${seed} civ ${c.id}`);
      if (c.deaths.war > 0) sawWar = true;
      if (c.switchesIn > 0) sawSwitch = true;
    }
    const p = sim.people;
    let alive = 0;
    for (const c of sim.stats().civs) alive += c.pop;
    assert.equal(alive, p.count);
    const fights = sim.stats().civs.reduce((a, c) => a + c.fights, 0);
    const won = sim.stats().civs.reduce((a, c) => a + c.fightsWon, 0);
    assert.equal(fights, 2 * won, 'every fight has two sides and one winner');
  }
  assert.ok(sawWar, 'the seeded runs had war deaths');
  assert.ok(sawSwitch, 'and civ switching');
});

test('a seeded run with fights: same params and seed give the same state hash and wars', () => {
  const run1 = () => {
    const sim = new Simulation({ seed: 'warhash', size: 10, civCount: 4, water: 0.5, civTypes: ['aggressive', 'aggressive', 'cooperative', 'nomadic'] });
    sim.tick(300);
    return [sim.hash(), JSON.stringify(sim.report().records.wars), JSON.stringify(sim.report().records.chronicle)];
  };
  const [a, wa, ca] = run1();
  const [b, wb, cb] = run1();
  assert.equal(a, b);
  assert.equal(wa, wb);
  assert.equal(ca, cb);
  assert.ok(JSON.parse(wa).length > 0, 'wars were recorded');
});

test('RULES.md Wars: in seeded runs the per-pair kills add up to each civ\'s war deaths and the fights to each civ\'s fight count', () => {
  let sawWar = false;
  for (const seed of ['war1', 'war2', 'war3']) {
    const sim = new Simulation({ seed, size: 10, civCount: 4, startPop: 40, water: 0.5, civTypes: ['aggressive', 'expansionist', 'cooperative', 'nomadic'] });
    sim.tick(250);
    const civs = sim.stats().civs;
    const wars = sim.report().records.wars;
    const killedBy = new Array(civs.length).fill(0);   // people of civ c killed, by the other side of each war
    const fights = new Array(civs.length).fill(0);
    const won = new Array(civs.length).fill(0);
    for (const w of wars) {
      const [a, b] = w.civs;
      assert.ok(a < b);
      assert.ok(w.firstYear <= w.lastYear);
      assert.equal(w.won[0] + w.won[1], w.fights, `${seed}: every fight has a winner`);
      killedBy[b] += w.killed[0]; killedBy[a] += w.killed[1];
      fights[a] += w.fights; fights[b] += w.fights;
      won[a] += w.won[0]; won[b] += w.won[1];
    }
    for (const c of civs) {
      assert.equal(killedBy[c.id], c.deaths.war, `${seed} civ ${c.id} war deaths`);
      assert.equal(fights[c.id], c.fights, `${seed} civ ${c.id} fights`);
      assert.equal(won[c.id], c.fightsWon, `${seed} civ ${c.id} fights won`);
      if (c.deaths.war > 0) sawWar = true;
    }
    for (let i = 1; i < wars.length; i++) {
      const t = (w) => w.killed[0] + w.killed[1];
      assert.ok(t(wars[i - 1]) >= t(wars[i]), 'deadliest first');
    }
  }
  assert.ok(sawWar);
});

