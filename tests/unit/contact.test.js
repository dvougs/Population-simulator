// RULES.md "Contact": fights and switching civ, on hand-built hexes (T-023, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Contact, CONTACT } from '../../src/sim/contact.js';
import { DEATH_WAR } from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, DEEP_WATER } from '../../src/sim/terrain.js';
import { STRENGTH, AGGRESSION, COOPERATION } from '../../src/sim/traits.js';
import { makeMap } from './helpers.js';

const SIZE = 5;
const HEX = 12; // the middle of a 5 × 5 map; its neighbours are 6, 7, 11, 13, 17, 18 (row 2 is even)

/**
 * groups: [hex, civ, n, { agg, str, coop, hunger }]. Everything else is plain: age 25, other traits 0.5, fed (hunger 0).
 * Capacity and food default to plenty, so crowding and hunger do not trigger unless a test sets them.
 */
function scene(types, groups, { terrain = PLAINS, cap = 1e6, food = cap } = {}) {
  const map = makeMap(SIZE, SIZE, () => terrain);
  map.foodCap.fill(cap);
  map.food.fill(food);
  const people = new People(512);
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
/** People per civ per hex now: also what "the end of last year" was unless a test passes its own. */
function counts(w) {
  const a = new Int32Array(w.map.count * w.civs);
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i]) a[w.people.hex[i] * w.civs + w.people.civ[i]]++;
  return a;
}
function run(w, { year = 100, seed = 'c', lastPop = null } = {}) {
  const out = { deaths: [], fights: [], switches: [], n: 0 };
  const last = lastPop ?? counts(w);
  out.n = w.contact.year(w.people, w.map, last, year, new Rng(`${seed}w`), new Rng(`${seed}s`),
    (slot, cause) => out.deaths.push({ civ: w.people.civ[slot], hex: w.people.hex[slot], cause }),
    (hex, attacker, defender, holder, winner, deaths) => out.fights.push({ hex, attacker, defender, holder, winner, deaths }),
    (from, to) => out.switches.push([from, to]));
  return out;
}
const aliveOf = (w, civ, hex = null) => {
  let n = 0;
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i] && w.people.civ[i] === civ && (hex === null || w.people.hex[i] === hex)) n++;
  return n;
};
const fightRate = (make, trials = 300) => {
  let fights = 0;
  for (let t = 0; t < trials; t++) fights += run(make(), { seed: `r${t}` }).n;
  return fights / trials;
};
const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} vs ${want}`);

test('RULES.md "Contact": the numbers', () => {
  assert.equal(CONTACT.hungerAggression, 0.5);
  assert.equal(CONTACT.crowdAggression, 0.4);
  assert.equal(CONTACT.numbersRatio, 3);
  assert.equal(CONTACT.numbersAggression, 0.45);
  assert.equal(CONTACT.revengeYears, 20);
  assert.equal(CONTACT.loserDeathPct, 20);
  assert.equal(CONTACT.winnerDeathPct, 5);
  assert.equal(CONTACT.switchPerCooperation, 0.02);
});

test('(a) Aggressive: always attacks any civ it shares a hex with, whatever its aggression; the other side is the defender', () => {
  for (let t = 0; t < 40; t++) {
    const w = scene(['aggressive', 'expansionist'], [[HEX, 0, 6, { agg: 0 }], [HEX, 1, 6, { agg: 1 }]]);
    const r = run(w, { seed: `a${t}` });
    assert.equal(r.n, 1);
    assert.equal(r.fights[0].attacker, 0);
    assert.equal(r.fights[0].defender, 1);
    assert.equal(r.fights[0].hex, HEX);
  }
});

test('Cooperative never starts a fight, even at aggression 1, hungry, crowded and outnumbering; it can still be attacked', () => {
  const make = () => scene(['cooperative', 'expansionist'], [[HEX, 0, 30, { agg: 1, hunger: 1 }], [HEX, 1, 3, { agg: 0 }]], { cap: 33, food: 0 });
  for (let t = 0; t < 60; t++) assert.equal(run(make(), { seed: `n${t}` }).n, 0);
  const attacked = scene(['cooperative', 'aggressive'], [[HEX, 0, 8, { agg: 1 }], [HEX, 1, 8, { agg: 0 }]]);
  const r = run(attacked);
  assert.equal(r.n, 1);
  assert.deepEqual([r.fights[0].attacker, r.fights[0].defender], [1, 0]);
  // Cooperative civs revenge never fires either.
  const revenge = scene(['cooperative', 'expansionist'], [[HEX, 0, 8, { agg: 1 }], [HEX, 1, 8, { agg: 0 }]]);
  revenge.contact.lostTo[0 * 2 + 1] = 99;
  assert.equal(run(revenge).n, 0);
});

test('civs sharing no hex never fight; a single civ alone in a hex never does', () => {
  const w = scene(['aggressive', 'aggressive'], [[HEX, 0, 10], [6, 1, 10]]);
  assert.equal(run(w).n, 0);
  assert.deepEqual(w.contact.fightWinner.every((v) => v === -1), true);
});

test('(b) Hunger: someone in the hex went hungry this year and average aggression above 0.5; chance = the average aggression', () => {
  // 10 + 10 people; `hungry` of civ 1's people went hungry this year. The hex's food does not matter.
  const mk = (agg, hungry, food = 1e6) => () => scene(['expansionist', 'expansionist'],
    [[HEX, 0, 10, { agg }], [HEX, 1, 10 - hungry, { agg: 0 }], [HEX, 1, hungry, { agg: 0, hunger: 1 }]], { cap: 1e6, food });
  assert.equal(fightRate(mk(0.5, 5), 60), 0, 'aggression exactly 0.5 does not qualify');
  assert.equal(fightRate(mk(0.6, 0, 0), 60), 0, 'nobody hungry: an empty larder after the year is not hunger');
  near(fightRate(mk(0.6, 1)), 0.6, 0.08);
  near(fightRate(mk(0.9, 10)), 0.9, 0.06);
  near(fightRate(mk(0.51, 3)), 0.51, 0.08);
});

test('(c) Crowding: more people than 50% of the food capacity (crowded, as in Migration) and average aggression above 0.4', () => {
  // Capacity 40, nobody hungry: 10 + 11 is crowded, 10 + 10 (exactly 50%) is not.
  const mk = (agg, b) => () => scene(['expansionist', 'expansionist'], [[HEX, 0, 10, { agg }], [HEX, 1, b, { agg: 0 }]], { cap: 40, food: 40 });
  assert.equal(fightRate(mk(0.4 - 0.01, 11), 60), 0, 'aggression below 0.4');
  assert.equal(fightRate(mk(0.9, 10), 60), 0, '20 people on capacity 40');
  near(fightRate(mk(0.7, 11)), 0.7, 0.08);
  near(fightRate(mk(0.41, 11)), 0.41, 0.08);
});

test('(d) Numbers: at least 3 times as many people as the other civ and average aggression above 0.45', () => {
  const mk = (agg, a, b) => () => scene(['expansionist', 'expansionist'], [[HEX, 0, a, { agg }], [HEX, 1, b, { agg: 0 }]]);
  assert.equal(fightRate(mk(0.7, 5, 2), 60), 0, '5 v 2 is not 3 times');
  assert.equal(fightRate(mk(0.44, 6, 2), 60), 0, 'aggression below 0.45');
  assert.equal(fightRate(mk(0.7, 2, 6), 60), 0, 'the bigger civ has no aggression, the smaller one is outnumbered');
  near(fightRate(mk(0.7, 6, 2)), 0.7, 0.08);
  near(fightRate(mk(0.46, 9, 3)), 0.46, 0.08);
  const r = run(mk(1, 6, 2)(), { seed: 'who' });
  assert.deepEqual([r.fights[0]?.attacker, r.fights[0]?.defender], [0, 1]);
});

test('(e) Revenge: a loss to that civ within the last 20 years (20 or fewer), with chance = average aggression, no threshold', () => {
  const mk = (lost, agg = 0.7) => () => {
    const w = scene(['expansionist', 'expansionist'], [[HEX, 0, 5, { agg }], [HEX, 1, 5, { agg: 0 }]]);
    w.contact.lostTo[0 * 2 + 1] = lost; // civ 0 lost to civ 1 in this year
    return w;
  };
  assert.equal(fightRate(mk(100 - 21), 60), 0, '21 years ago is too long');
  assert.equal(fightRate(mk(-1000000), 60), 0, 'never lost');
  near(fightRate(mk(100 - 20)), 0.7, 0.08);
  near(fightRate(mk(99)), 0.7, 0.08);
  near(fightRate(mk(99, 0.2)), 0.2, 0.07);
  // The revenge is only against the civ it lost to.
  const w = scene(['expansionist', 'expansionist', 'expansionist'], [[HEX, 0, 5, { agg: 1 }], [HEX, 2, 5, { agg: 0 }]]);
  w.contact.lostTo[0 * 3 + 1] = 99;
  assert.equal(run(w).n, 0);
});

test('a fight records the loser\'s loss, so the loser takes revenge next year', () => {
  const w = scene(['aggressive', 'expansionist'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0, agg: 0.3 }]]);
  const r = run(w, { year: 40 });
  assert.equal(r.fights[0].winner, 0);
  assert.equal(w.contact.lostTo[1 * 2 + 0], 40);
  assert.equal(w.contact.lostTo[0 * 2 + 1] < 0, true);
  assert.equal(w.contact.fightWinner[HEX], 0);
});

test('one roll per pair however many triggers hold: hungry and crowded and outnumbering still fights with chance = aggression', () => {
  const mk = () => scene(['expansionist', 'expansionist'], [[HEX, 0, 30, { agg: 0.6 }], [HEX, 1, 2, { agg: 0 }]], { cap: 32, food: 0 });
  near(fightRate(mk), 0.6, 0.08);
});

test('at most one fight per hex a year: with three civs, the pair with the most people', () => {
  const w = scene(['aggressive', 'aggressive', 'aggressive'], [[HEX, 0, 3], [HEX, 1, 10], [HEX, 2, 6]]);
  const r = run(w);
  assert.equal(r.n, 1);
  assert.equal(r.fights.length, 1);
  assert.deepEqual([r.fights[0].attacker, r.fights[0].defender].sort(), [1, 2], 'between civs 1 and 2, civ 0 is not involved');
  assert.equal(aliveOf(w, 0), 3, 'the third civ loses nobody');
  // A tie in size goes to the lower civ numbers.
  const t = scene(['aggressive', 'aggressive', 'aggressive'], [[HEX, 0, 5], [HEX, 1, 5], [HEX, 2, 5]]);
  const rt = run(t);
  assert.deepEqual([rt.fights[0].attacker, rt.fights[0].defender].sort(), [0, 1]);
  // The next largest: 7 v 4 v 4 pairs civ 0 with civ 1.
  const u = scene(['aggressive', 'aggressive', 'aggressive'], [[HEX, 0, 7], [HEX, 1, 4], [HEX, 2, 4]]);
  const ru = run(scene(['aggressive', 'aggressive', 'aggressive'], [[HEX, 0, 7], [HEX, 1, 4], [HEX, 2, 4]]));
  assert.deepEqual([ru.fights[0].attacker, ru.fights[0].defender].sort(), [0, 1]);
});

test('different hexes each have their own fight in the same year', () => {
  const w = scene(['aggressive', 'expansionist'], [[HEX, 0, 6], [HEX, 1, 6], [6, 0, 6], [6, 1, 6], [18, 0, 3]]);
  const r = run(w);
  assert.equal(r.n, 2);
  assert.deepEqual(r.fights.map((f) => f.hex).sort((a, b) => a - b), [6, HEX]);
});

test('the hex holder: the civ with more people at the end of last year; a tie goes to more now, then the lower civ number', () => {
  const holderOf = (types, groups, lastPop) => {
    const w = scene(types, groups);
    const last = new Int32Array(w.map.count * w.civs);
    for (const [civ, n] of Object.entries(lastPop)) last[HEX * w.civs + Number(civ)] = n;
    return run(w, { lastPop: last }).fights[0];
  };
  const two = ['aggressive', 'aggressive'];
  // Civ 1 had more people last year (just arrived: civ 0 had none), so civ 1 holds it though civ 0 has more now.
  let f = holderOf(two, [[HEX, 0, 8], [HEX, 1, 5]], { 1: 6 });
  assert.equal(f.holder, 1);
  assert.equal(f.attacker, 0, 'both would attack: the one that did not hold the hex attacks');
  assert.equal(f.defender, 1);
  f = holderOf(two, [[HEX, 0, 8], [HEX, 1, 5]], { 0: 3, 1: 4 });
  assert.equal(f.holder, 1);
  // Equal last year: more people now, then the lower number.
  f = holderOf(two, [[HEX, 0, 8], [HEX, 1, 5]], { 0: 4, 1: 4 });
  assert.equal(f.holder, 0);
  f = holderOf(two, [[HEX, 0, 5], [HEX, 1, 8]], { 0: 0, 1: 0 });
  assert.equal(f.holder, 1);
  f = holderOf(two, [[HEX, 0, 5], [HEX, 1, 5]], {});
  assert.equal(f.holder, 0);
  assert.equal(f.attacker, 1, 'the attacker is the one that did not hold it');
});

test('the holder may be the attacker, and the defender the newcomer', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 8], [HEX, 1, 5]]);
  const last = new Int32Array(w.map.count * 2);
  last[HEX * 2] = 8; last[HEX * 2 + 1] = 0;
  const f = run(w, { lastPop: last }).fights[0];
  assert.deepEqual([f.attacker, f.defender, f.holder], [0, 1, 0]);
  const v = scene(['aggressive', 'cooperative'], [[HEX, 0, 8], [HEX, 1, 5]]);
  const last2 = new Int32Array(v.map.count * 2);
  last2[HEX * 2 + 1] = 9;
  const g = run(v, { lastPop: last2 }).fights[0];
  assert.deepEqual([g.attacker, g.defender, g.holder], [0, 1, 1], 'a Cooperative holder is attacked');
});

/** Aggressive civ 0 (attacker, by being the non-holder) against civ 1 holding the hex; who wins? */
function winnerWith(terrain, holderN, holderStr, attackerN, attackerStr) {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, attackerN, { str: attackerStr }], [HEX, 1, holderN, { str: holderStr }]], { terrain });
  const last = new Int32Array(w.map.count * 2);
  last[HEX * 2 + 1] = holderN; // civ 1 held the hex
  const r = run(w, { lastPop: last });
  assert.equal(r.fights[0].holder, 1);
  return r.fights[0].winner;
}

test('Strength: the sum of the people\'s strength; the side with more wins; on equal strength the holder wins', () => {
  assert.equal(winnerWith(PLAINS, 10, 0.5, 10, 0.5), 1, 'equal strength: the holder');
  assert.equal(winnerWith(PLAINS, 10, 0.5, 11, 0.5), 0, 'more people (more strength) wins');
  assert.equal(winnerWith(PLAINS, 10, 0.5, 10, 0.51), 0, 'stronger people win');
  assert.equal(winnerWith(PLAINS, 20, 0.2, 10, 0.5), 0, '5.0 v 4.0');
  assert.equal(winnerWith(PLAINS, 20, 0.5, 10, 0.5), 1);
});

test('Defence bonus: the holder\'s strength × (1 + terrain bonus): forest +25%, hills +50%, mountain +100%, plains and desert 0', () => {
  // The holder has 20 people of strength 0.5 (10.0); the attacker has n people of strength 0.5.
  assert.equal(winnerWith(FOREST, 20, 0.5, 24, 0.5), 1, '12 v 12.5');
  assert.equal(winnerWith(FOREST, 20, 0.5, 25, 0.5), 1, '12.5 v 12.5 ties to the holder');
  assert.equal(winnerWith(FOREST, 20, 0.5, 26, 0.5), 0, '13 v 12.5');
  assert.equal(winnerWith(HILLS, 20, 0.5, 29, 0.5), 1, '14.5 v 15');
  assert.equal(winnerWith(HILLS, 20, 0.5, 30, 0.5), 1, '15 v 15 ties to the holder');
  assert.equal(winnerWith(HILLS, 20, 0.5, 31, 0.5), 0, '15.5 v 15');
  assert.equal(winnerWith(MOUNTAIN, 20, 0.5, 39, 0.5), 1, '19.5 v 20');
  assert.equal(winnerWith(MOUNTAIN, 20, 0.5, 40, 0.5), 1, '20 v 20');
  assert.equal(winnerWith(MOUNTAIN, 20, 0.5, 41, 0.5), 0, '20.5 v 20');
  assert.equal(winnerWith(PLAINS, 20, 0.5, 21, 0.5), 0, 'no bonus on plains');
  assert.equal(winnerWith(DESERT, 20, 0.5, 21, 0.5), 0, 'no bonus in the desert');
});

test('the holder gets the defence bonus even when it is the attacker', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 20, { str: 0.5 }], [HEX, 1, 24, { str: 0.5 }]], { terrain: HILLS });
  const last = new Int32Array(w.map.count * 2);
  last[HEX * 2] = 30; // civ 0 held it (and attacks)
  const r = run(w, { lastPop: last }).fights[0];
  assert.deepEqual([r.attacker, r.holder, r.winner], [0, 0, 0], '10 × 1.5 = 15 v 12');
});

/** Fight where civ 0 (strength 1) beats civ 1 (strength 0): returns { loserDeaths, winnerDeaths, fight }. */
function casualties(winnerN, loserN) {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, winnerN, { str: 1 }], [HEX, 1, loserN, { str: 0 }]]);
  const r = run(w);
  assert.equal(r.fights[0].winner, 0);
  const lost = r.deaths.filter((d) => d.civ === 1).length;
  const won = r.deaths.filter((d) => d.civ === 0).length;
  assert.ok(r.deaths.every((d) => d.cause === DEATH_WAR && d.hex === HEX));
  assert.equal(aliveOf(w, 1) + lost, loserN);
  assert.equal(aliveOf(w, 0) + won, winnerN);
  assert.equal(r.fights[0].deaths, lost + won, 'the fight reports the deaths of both sides together');
  return { lost, won };
}

test('Result: the loser loses ceil(20%) of its people there (at least 1)', () => {
  const lost = (n) => casualties(10, n).lost;
  assert.deepEqual([1, 2, 4, 5, 6, 9, 10, 11, 19, 20, 21, 50].map(lost), [1, 1, 1, 1, 2, 2, 2, 3, 4, 4, 5, 10]);
});

test('Result: the winner loses floor(5%) of its people there (19 loses nobody, 20 loses 1, 39 loses 1, 40 loses 2)', () => {
  const won = (n) => casualties(n, 10).won;
  assert.deepEqual([1, 5, 19, 20, 21, 39, 40, 99, 100, 119, 120].map(won), [0, 0, 0, 1, 1, 1, 2, 4, 5, 5, 6]);
});

test('war deaths are picked at random among the side\'s people (every slot can die)', () => {
  const diedSlots = new Set();
  for (let t = 0; t < 60; t++) {
    const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 5, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
    const r = run(w, { seed: `pick${t}` });
    assert.equal(r.deaths.length, 2);
    for (let i = 5; i < 15; i++) if (!w.people.alive[i]) diedSlots.add(i);
  }
  assert.equal(diedSlots.size, 10);
});

/** The five hexes around HEX (12) in a 5 × 5 odd-r map: row 2 is even, so its neighbours are 11, 13, 6, 7, 16, 17. */
const NB = [11, 13, 6, 7, 16, 17];

test('Result: losers flee together to the neighbouring land hex without the winner that has the most food left over', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  assert.deepEqual([...w.map.neighbours.slice(HEX * 6, HEX * 6 + 6)].sort((a, b) => a - b), [6, 7, 11, 13, 16, 17]);
  w.map.food.fill(10);
  w.map.food[16] = 30; // the best
  w.map.food[7] = 25;
  // A person of civ 1 already in hex 16 makes its leftover food 29: still the best.
  w.people.add(16, 1, 25, 100, 0);
  run(w);
  const where = new Set();
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i] && w.people.civ[i] === 1 && i < 20) where.add(w.people.hex[i]);
  assert.deepEqual([...where], [16], 'all the survivors went to the same hex');
  assert.equal(aliveOf(w, 1, 16), 8 + 1);
  assert.equal(aliveOf(w, 1, HEX), 0);
  assert.equal(aliveOf(w, 0, HEX), 10 - 0, 'the winner stays');
});

test('flight counts food left over (food minus people), not food; ties go to the lower index', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  w.map.food.fill(10);
  w.map.food[16] = 30;
  for (let k = 0; k < 25; k++) w.people.add(16, 1, 25, 100, 0); // 30 - 25 = 5 left over
  w.map.food[7] = 12;
  run(w);
  assert.equal(aliveOf(w, 1, 7), 8, '12 left over beats 5 and 10');
  const tie = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  tie.map.food.fill(10); // all six neighbours tie: the lowest index, 6
  run(tie);
  assert.equal(aliveOf(tie, 1, 6), 8);
});

test('flight skips a neighbour holding the winner even when it has more spare food', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  w.map.food.fill(10);
  w.map.food[7] = 500; // best, but the winner lives there
  for (let k = 0; k < 3; k++) w.people.add(7, 0, 25, 100, 0);
  w.map.food[13] = 20;
  run(w);
  assert.equal(aliveOf(w, 1, 7), 0);
  assert.equal(aliveOf(w, 1, 13), 8, 'the best hex without the winner');
});

test('flight: with the winner in every land neighbour, the best of all of them; with no land neighbour, stay', () => {
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  w.map.food.fill(10);
  w.map.food[17] = 100;
  for (const h of NB) w.people.add(h, 0, 25, 100, 0);
  run(w);
  assert.equal(aliveOf(w, 1, 17), 8);
  // Water neighbours do not count; no land neighbour at all: the losers stay.
  const island = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  for (const h of NB) island.map.terrain[h] = DEEP_WATER;
  run(island);
  assert.equal(aliveOf(island, 1, HEX), 8);
  // Only one land neighbour, which holds the winner: they flee there anyway.
  const one = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }], [13, 0, 2]]);
  for (const h of NB) if (h !== 13) one.map.terrain[h] = DEEP_WATER;
  run(one);
  assert.equal(aliveOf(one, 1, 13), 8);
});

test('flight: the winner\'s own people in the fight hex stay, and a third civ in the hex is not involved', () => {
  const w = scene(['aggressive', 'cooperative', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }], [HEX, 2, 4]]);
  const r = run(w);
  assert.equal(r.n, 1);
  assert.equal(aliveOf(w, 2, HEX), 4);
  assert.equal(aliveOf(w, 0, HEX), 10);
});

test('Switching civ: only in shared hexes with no fight, yearly chance 2% × cooperation (1% at 0.5)', () => {
  const rate = (coop, types = ['expansionist', 'expansionist'], n = 3000) => {
    const w = scene(types, [[HEX, 0, n, { coop, agg: 0 }], [HEX, 1, n, { coop: 0, agg: 0 }]]);
    const r = run(w, { seed: `sw${coop}` });
    assert.equal(r.n, 0, 'no fight');
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
  assert.equal(r.n, 0);
  near(r.switches.length / n, 0.01, 0.003);
  const make = () => scene(['expansionist', 'expansionist'], [[HEX, 0, n, { coop: 1, agg: 0 }], [HEX, 1, 4, { coop: 0, agg: 0 }]]);
  const plain = run(make(), { seed: 'half' });
  assert.equal(plain.n, 0);
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

test('Switching civ: not in a hex with a fight, and not in a hex with one civ', () => {
  const fight = scene(['aggressive', 'expansionist'], [[HEX, 0, 2000, { coop: 1 }], [HEX, 1, 2000, { coop: 1 }]]);
  const r = run(fight);
  assert.equal(r.n, 1);
  assert.equal(r.switches.length, 0);
  const alone = scene(['expansionist', 'expansionist'], [[HEX, 0, 2000, { coop: 1 }], [6, 1, 2000, { coop: 1 }]]);
  assert.equal(run(alone).switches.length, 0);
  // A fight in one hex does not stop switching in another shared hex.
  const two = scene(['aggressive', 'expansionist', 'expansionist', 'expansionist'],
    [[HEX, 0, 1000, { coop: 1 }], [HEX, 1, 1000, { coop: 1 }], [18, 2, 1000, { coop: 1, agg: 0 }], [18, 3, 1000, { coop: 1, agg: 0 }]]);
  const rt = run(two);
  assert.equal(rt.n, 1);
  assert.equal(rt.fights[0].hex, HEX);
  assert.ok(rt.switches.length > 20 && rt.switches.every(([f, t]) => f >= 2 && t >= 2), 'only the fight-free shared hex switches');
});

test('fightWinner is reset every year: it holds this year\'s winners only', () => {
  const w = scene(['aggressive', 'expansionist'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  run(w);
  assert.equal(w.contact.fightWinner[HEX], 0);
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i] && w.people.civ[i] === 1) w.people.hex[i] = 0;
  run(w, { year: 101 });
  assert.ok(w.contact.fightWinner.every((v) => v === -1));
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

test('RULES.md "Strength": a Kingdom has × 3 strength against a civ that is not a Kingdom, either side; two Kingdoms fight as usual', () => {
  // Civ 0 (Aggressive, always attacks) has strength 10; civ 1 has 10 people of strength 0.4: 4, or 12 as a Kingdom.
  const fight = (levels, holderLast = null) => {
    const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0.4 }]]);
    w.contact.level = Uint8Array.from(levels);
    const last = counts(w);
    if (holderLast !== null) last[HEX * 2 + holderLast] += 1;
    return run(w, { lastPop: last }).fights[0].winner;
  };
  assert.equal(fight([1, 1]), 0, 'no Kingdom: 10 beats 4');
  assert.equal(fight([4, 5]), 1, 'civ 1 a Kingdom: 12 beats 10');
  assert.equal(fight([4, 5], 1), 1, 'as the holder too');
  assert.equal(fight([5, 5]), 0, 'two Kingdoms: 10 beats 4');
  // The Kingdom as the weaker attacker: 10 × 0.4 × 3 = 12 beats 10.
  const w = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 0.4 }], [HEX, 1, 10, { str: 1 }]]);
  w.contact.level = Uint8Array.of(5, 2);
  assert.equal(run(w).fights[0].winner, 0);
  // Exactly × 3 on top of the defence bonus: civ 1 holds hills (+50%) as a Kingdom: 4 × 1.5 × 3 = 18 v 17.5 and 18.5.
  const hold = (str0) => {
    const v = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: str0 }], [HEX, 1, 10, { str: 0.4 }]], { terrain: HILLS });
    v.contact.level = Uint8Array.of(1, 5);
    const last = counts(v); last[HEX * 2 + 1] += 1;
    return run(v, { lastPop: last }).fights[0].winner;
  };
  assert.equal(hold(1.75), 1);
  assert.equal(hold(1.85), 0);
});

test('RULES.md "Fights": losers never flee into a hex enclosed by a Kingdom other than their own civ', () => {
  const w = scene(['aggressive', 'cooperative', 'expansionist'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  w.map.food.fill(10);
  w.map.food[16] = 30; // the best refuge, but civ 2's Kingdom encloses it
  w.map.food[7] = 25;
  w.contact.inside = new Int8Array(w.map.count).fill(-1);
  w.contact.inside[16] = 2;
  run(w);
  assert.equal(aliveOf(w, 1, 16), 0);
  assert.equal(aliveOf(w, 1, 7), 8, 'the next best');
  // A hex enclosed by the losers' own Kingdom is a refuge as usual.
  const own = scene(['aggressive', 'cooperative'], [[HEX, 0, 10, { str: 1 }], [HEX, 1, 10, { str: 0 }]]);
  own.map.food.fill(10);
  own.map.food[16] = 30;
  own.contact.inside = new Int8Array(own.map.count).fill(-1);
  own.contact.inside[16] = 1;
  run(own);
  assert.equal(aliveOf(own, 1, 16), 8);
});
