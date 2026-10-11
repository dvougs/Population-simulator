// RULES.md "Statistics" > Records and History log (T-026/T-027), on hand-built people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { People } from '../../src/sim/people.js';
import { Records, FAMINE, CHRONICLE, MILESTONES, chronicle } from '../../src/sim/records.js';
import { DEATH_STARVATION, DEATH_OLD_AGE } from '../../src/sim/life.js';
import { Simulation } from '../../src/sim/simulation.js';

/** n founders for each civ (ids 1.., founder index = order added), registered with Records. */
function world(civs, perCiv, ages = () => 20) {
  const people = new People(64);
  const rec = new Records(civs, civs * perCiv);
  let f = 0;
  for (let c = 0; c < civs; c++) for (let k = 0; k < perCiv; k++) people.add(0, c, ages(c, k), 100, 0, 1, f++);
  rec.founders(people);
  return { people, rec };
}
const born = (w, parentSlot, year, civ = w.people.civ[parentSlot]) => {
  const p = w.people;
  const s = p.add(0, civ, 0, 100, p.id[parentSlot], p.gen[parentSlot] + 1, p.founder[parentSlot]);
  w.rec.birth(s, p, year);
  return s;
};
const die = (w, slot, cause, year) => { w.rec.death(slot, w.people, cause, year); w.people.remove(slot); };

test('RULES.md Records: constants (famine 1% and 5 deaths, milestones 100/500/1000, chronicle 12 lines, big famine 10%, 3 kept)', () => {
  assert.equal(FAMINE.minShare, 0.01);
  assert.equal(FAMINE.minDeaths, 5);
  assert.deepEqual([...MILESTONES], [100, 500, 1000]);
  assert.deepEqual({ ...CHRONICLE }, { lines: 12, famineShare: 0.1, famines: 3 });
});

test('oldest person ever: a dead record, beaten only by a strictly older living person', () => {
  const w = world(2, 2, (c, k) => 10 + k); // ids 1..4, ages 10, 11, 10, 11
  w.people.age[1] = 70; w.people.age[3] = 60;
  die(w, 1, DEATH_OLD_AGE, 40);
  let d = w.rec.data(w.people, 50);
  assert.deepEqual(d.oldestEver, { id: 2, civ: 0, age: 70, alive: false, diedYear: 40 });
  w.people.age[2] = 70; // alive tie with the dead record: the dead one reached it first
  d = w.rec.data(w.people, 50);
  assert.equal(d.oldestEver.id, 2);
  assert.equal(d.oldestEver.alive, false);
  assert.deepEqual(d.oldestAlive, { id: 3, civ: 1, age: 70 }, 'oldest alive');
  w.people.age[2] = 71;
  d = w.rec.data(w.people, 50);
  assert.deepEqual(d.oldestEver, { id: 3, civ: 1, age: 71, alive: true, diedYear: null });
});

test('oldest on a tie among the dead: whoever died (reached it) first; among the living, the lowest id', () => {
  const w = world(1, 4);
  w.people.age[0] = 80; w.people.age[1] = 80;
  die(w, 1, DEATH_OLD_AGE, 5);
  die(w, 0, DEATH_OLD_AGE, 9);
  assert.equal(w.rec.data(w.people, 10).oldestEver.id, 2);
  const v = world(1, 3);
  v.people.age[2] = 50; v.people.age[1] = 50; v.people.age[0] = 49;
  assert.equal(v.rec.data(v.people, 1).oldestAlive.id, 2, 'lowest id on a tie');
});

test('oldest: none dead gives the oldest alive; nobody alive gives null alive', () => {
  const w = world(1, 2);
  const d = w.rec.data(w.people, 0);
  assert.equal(d.oldestEver.alive, true);
  die(w, 0, DEATH_OLD_AGE, 3); die(w, 1, DEATH_OLD_AGE, 4);
  const e = w.rec.data(w.people, 4);
  assert.equal(e.oldestAlive, null);
  assert.equal(e.oldestEver.alive, false);
});

test('longest family line: highest generation, the first person born into it, founder at the head', () => {
  const w = world(2, 2); // founders ids 1,2 (civ 0), 3,4 (civ 1)
  assert.equal(w.rec.data(w.people, 0).longestLine.generations, 1);
  const a = born(w, 0, 1);          // gen 2, line of founder id 1
  const b = born(w, 2, 2);          // gen 2, founder id 3: same generation, later
  const c = born(w, a, 5);          // gen 3
  const d2 = born(w, b, 6);         // gen 3 later: does not replace
  const e = born(w, c, 9);          // gen 4
  const line = w.rec.data(w.people, 9).longestLine;
  assert.equal(line.generations, 4);
  assert.equal(line.personId, w.people.id[e]);
  assert.equal(line.founderId, 1);
  assert.equal(line.civ, 0);
  assert.equal(line.year, 9);
  assert.notEqual(d2, e);
  const first = world(1, 1);
  const none = first.rec.data(first.people, 0).longestLine;
  assert.equal(none.generations, 1);
  assert.equal(none.founderId, 1);
});

test('most descendants: per founder, ties to the lower founder id, null if nobody was born', () => {
  const w = world(2, 2);
  assert.equal(w.rec.data(w.people, 0).mostDescendants, null);
  const a = born(w, 0, 1);
  born(w, a, 2); born(w, a, 2);           // founder 1 line: 3
  born(w, 3, 3); born(w, 3, 3); born(w, 3, 3); // founder 4 line: 3
  let m = w.rec.data(w.people, 3).mostDescendants;
  assert.deepEqual(m, { id: 1, civ: 0, descendants: 3 }, 'tie goes to the lower founder id');
  born(w, 3, 4);
  m = w.rec.data(w.people, 4).mostDescendants;
  assert.deepEqual(m, { id: 4, civ: 1, descendants: 4 });
  // Counts the dead too.
  die(w, 3, DEATH_OLD_AGE, 5);
  assert.equal(w.rec.data(w.people, 5).mostDescendants.descendants, 4);
});

/** Run a year: starvation deaths per civ, then close with the given end-of-year populations. */
function year(w, y, starved, pop) {
  starved.forEach((n, c) => { for (let i = 0; i < n; i++) w.rec.death(c, w.people, DEATH_STARVATION, y); });
  w.rec.endYear(y, Int32Array.from(pop));
}
const famineW = () => { const w = world(2, 1); w.rec.lastPop.set([100, 100]); return w; };

const famines = (w, y) => w.rec.data(w.people, y).events.filter((e) => e.type === 'famine');
/** Famine years (worstFamine) include small ones; the log keeps only big ones. */
const spell = (w, y) => w.rec.data(w.people, y).worstFamine;

test('RULES.md Statistics, famine year: starvation deaths at least 1% of last year\'s people and at least 5', () => {
  let w = famineW();
  year(w, 1, [4, 0], [96, 100]); // 4% but under 5
  assert.equal(spell(w, 1), null);
  w = famineW(); w.rec.lastPop.set([400, 100]);
  year(w, 1, [4, 0], [396, 100]); // exactly 1% but only 4 deaths
  assert.equal(spell(w, 1), null);
  w = famineW(); w.rec.lastPop.set([501, 100]);
  year(w, 1, [5, 0], [496, 100]); // 5 deaths but just under 1%
  assert.equal(spell(w, 1), null);
  w = famineW(); w.rec.lastPop.set([500, 100]);
  year(w, 1, [5, 0], [495, 100]); // exactly 1% and exactly 5
  assert.deepEqual(spell(w, 1), { civ: 0, startYear: 1, endYear: 1, deaths: 5, ongoing: true });
  assert.equal(famines(w, 1).length, 0, '5 of 500 is 1%: not a big famine, so not in the log');
  w = famineW(); w.rec.lastPop.set([400, 100]);
  year(w, 1, [5, 0], [395, 100]);
  assert.equal(spell(w, 1).deaths, 5);
});

test('RULES.md big famines: deaths at least 10% of the civ\'s people at the start of the famine, exactly on the boundary', () => {
  const run = (pop, deaths) => {
    const w = famineW(); w.rec.lastPop.set([pop, 100]);
    year(w, 1, [deaths, 0], [pop - deaths, 100]);
    year(w, 2, [0, 0], [pop - deaths, 100]); // ends it
    return famines(w, 2);
  };
  assert.equal(run(100, 9).length, 0, '9 of 100 is under 10%');
  const ev = run(100, 10);
  assert.equal(ev.length, 1, 'exactly 10%');
  assert.deepEqual(ev[0], { type: 'famine', civ: 0, year: 1, endYear: 1, deaths: 10, startPop: 100, ongoing: false });
  assert.equal(run(101, 10).length, 0, '10 of 101 is just under');
  assert.equal(run(50, 5).length, 1, '5 of 50 is exactly 10%');
  // The share is of the people at the start of the first year, over the whole spell.
  const w = famineW(); w.rec.lastPop.set([100, 100]);
  year(w, 1, [6, 0], [94, 100]);
  year(w, 2, [5, 0], [89, 100]);   // 11 of 100 together
  year(w, 3, [0, 0], [89, 100]);
  assert.deepEqual(famines(w, 3).map((e) => [e.year, e.endYear, e.deaths, e.startPop]), [[1, 2, 11, 100]]);
});

test('RULES.md big famines: only the 3 deadliest are kept; a tie goes to the one that ended first', () => {
  const w = world(4, 1);
  w.rec.lastPop.set([1000, 1000, 1000, 1000]);
  const y = (n, starved) => year(w, n, starved, [1000, 1000, 1000, 1000]);
  y(1, [200, 0, 0, 0]); y(2, [0, 0, 0, 0]);   // civ 0: 200, ended year 1
  y(3, [0, 200, 0, 0]); y(4, [0, 0, 0, 0]);   // civ 1: 200, ended year 3: tie, behind civ 0
  y(5, [0, 0, 300, 0]); y(6, [0, 0, 0, 0]);   // civ 2: 300
  let f = w.rec.data(w.people, 6).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => [e.civ, e.deaths]), [[0, 200], [1, 200], [2, 300]]);
  y(7, [0, 0, 0, 150]); y(8, [0, 0, 0, 0]);   // 150: fourth, drops out
  f = w.rec.data(w.people, 8).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => e.civ), [0, 1, 2]);
  y(9, [0, 0, 0, 200]); y(10, [0, 0, 0, 0]);   // 200 ties civ 0 and 1, ended later: out
  f = w.rec.data(w.people, 10).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => e.civ), [0, 1, 2]);
  y(11, [0, 0, 0, 201]); y(12, [0, 0, 0, 0]);  // 201 beats the tied pair: civ 1 (later ender) is pushed out
  f = w.rec.data(w.people, 12).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => [e.civ, e.deaths]), [[0, 200], [2, 300], [3, 201]]);
  assert.equal(w.rec.data(w.people, 12).worstFamine.deaths, 300);
});

test('RULES.md big famines: an ongoing famine counts up to the last year and needs strictly more deaths to pass an ended one', () => {
  const w = world(2, 1);
  w.rec.lastPop.set([1000, 1000]);
  year(w, 1, [0, 100], [1000, 900]);
  year(w, 2, [100, 0], [900, 900]); // civ 1 ended (100); civ 0 ongoing with 100
  let f = w.rec.data(w.people, 2).events.filter((e) => e.type === 'famine');
  assert.equal(f.length, 2, 'both fit in the 3 slots');
  const w2 = world(4, 1);
  w2.rec.lastPop.set([1000, 1000, 1000, 1000]);
  const y = (n, s) => year(w2, n, s, [1000, 1000, 1000, 1000]);
  y(1, [100, 0, 0, 0]); y(2, [0, 100, 0, 0]); y(3, [0, 0, 100, 0]); y(4, [0, 0, 0, 100]); // 1-3 ended, 4 ongoing
  f = w2.rec.data(w2.people, 4).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => e.civ), [0, 1, 2], 'an ongoing tie loses');
  y(5, [0, 0, 0, 10]);              // 110 now (a famine year needs 1% of 1000): strictly more, takes the lead; civ 2 (ended last of the ties) drops out
  f = w2.rec.data(w2.people, 5).events.filter((e) => e.type === 'famine');
  assert.deepEqual(f.map((e) => [e.civ, e.deaths, e.ongoing]), [[0, 100, false], [1, 100, false], [3, 110, true]]);
});

test('consecutive famine years merge into one famine; a quiet year ends it', () => {
  const w = famineW();
  year(w, 1, [10, 0], [90, 100]);
  year(w, 2, [8, 0], [82, 100]);
  year(w, 3, [0, 0], [82, 100]);       // ends it
  year(w, 4, [9, 0], [73, 100]);       // a second one
  year(w, 5, [0, 0], [73, 100]);
  const d = w.rec.data(w.people, 5);
  assert.deepEqual(d.events.filter((e) => e.type === 'famine').map((e) => [e.civ, e.year, e.endYear, e.deaths]), [[0, 1, 2, 18], [0, 4, 4, 9]]);
  assert.deepEqual(d.worstFamine, { civ: 0, startYear: 1, endYear: 2, deaths: 18, ongoing: false });
  assert.equal(d.events.every((e) => !e.ongoing), true);
});

test('a famine still going at report time counts up to the last year', () => {
  const w = famineW();
  year(w, 1, [10, 0], [90, 100]);
  year(w, 2, [20, 0], [70, 100]);
  const d = w.rec.data(w.people, 2);
  assert.deepEqual(d.worstFamine, { civ: 0, startYear: 1, endYear: 2, deaths: 30, ongoing: true });
  const f = d.events.find((e) => e.type === 'famine');
  assert.equal(f.ongoing, true);
  assert.equal(f.endYear, 2);
});

test('worst famine: most deaths; on a tie the one that ended first (an ongoing tie loses)', () => {
  const w = famineW();
  year(w, 1, [0, 10], [100, 90]);
  year(w, 2, [10, 0], [90, 90]);   // civ 1 ended year 1 (closed in year 2), civ 0 ongoing
  year(w, 3, [0, 0], [90, 90]);    // civ 0 closes, ended year 2
  let d = w.rec.data(w.people, 3);
  assert.equal(d.worstFamine.civ, 1, 'ended first');
  const v = famineW();
  year(v, 1, [0, 10], [100, 90]);
  year(v, 2, [10, 0], [90, 90]);
  d = v.rec.data(v.people, 2);       // civ 0 still ongoing with 10 = tie
  assert.equal(d.worstFamine.civ, 1);
  assert.equal(d.worstFamine.ongoing, false);
  year(v, 3, [11, 0], [79, 90]);     // now strictly more
  d = v.rec.data(v.people, 3);
  assert.equal(d.worstFamine.civ, 0);
  assert.equal(d.worstFamine.deaths, 21);
});

test('extinction is logged in its year and closes an open famine; events sort by year, famine first, then civ', () => {
  const w = famineW();
  year(w, 1, [10, 0], [90, 100]);
  year(w, 2, [90, 100], [0, 0]);
  const ev = w.rec.data(w.people, 2).events;
  assert.deepEqual(ev.filter((e) => e.type === 'famine' || e.type === 'extinction').map((e) => [e.type, e.civ, e.year]),
    [['famine', 0, 1], ['famine', 1, 2], ['extinction', 0, 2], ['extinction', 1, 2]]);
  assert.equal(w.rec.data(w.people, 2).worstFamine.deaths, 100);
});

test('seeded run: records come out consistent with the statistics', () => {
  const sim = new Simulation({ seed: 'rec', size: 12, civCount: 3, startPop: 20 });
  sim.tick(300);
  const r = sim.report();
  const rec = r.records;
  assert.ok(rec.oldestEver.age >= rec.oldestAlive.age);
  const stat = sim.civStats.summary();
  // A person can die in the year they turn their final age, which the yearly civ stats never see alive.
  assert.ok(rec.oldestEver.age >= Math.max(...stat.map((c) => c.oldestAge)));
  assert.ok(rec.longestLine.generations >= 2);
  assert.ok(rec.mostDescendants.descendants >= rec.longestLine.generations - 1);
  assert.ok(rec.events.length <= new Records(3, 60).room(), 'the log never needs more than its fixed room');
  const again = new Simulation({ seed: 'rec', size: 12, civCount: 3, startPop: 20 });
  again.tick(300);
  assert.deepEqual(again.report().records, rec);
});

// ---- T-039: first contact, milestones, peaks, most hexes (RULES.md "Statistics", History log) ----

/** Close a year with explicit people per hex: perHex[hex] = array of people per civ. */
function yearHex(rec, y, perHex, hexes = null) {
  const civs = rec.civs;
  const flat = new Int32Array(perHex.length * civs);
  const pop = new Int32Array(civs);
  perHex.forEach((row, h) => row.forEach((n, c) => { flat[h * civs + c] = n; pop[c] += n; }));
  rec.endYear(y, pop, hexes ? Int32Array.from(hexes) : null, flat);
}
const ofType = (rec, type, people = { year: 0 }) => rec.data(people, 99).events.filter((e) => e.type === type);

test('RULES.md first contact: once per pair, in the first year they share a hex, at the lowest shared hex', () => {
  const rec = new Records(3, 3, 5);
  yearHex(rec, 1, [[5, 0, 0], [0, 5, 0], [0, 0, 5]]);
  assert.equal(ofType(rec, 'contact').length, 0, 'nobody shares');
  yearHex(rec, 2, [[5, 0, 0], [0, 5, 0], [0, 0, 5], [0, 3, 3]]);
  let ev = ofType(rec, 'contact');
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].civ, ev[0].other, ev[0].year, ev[0].hex, ev[0].col, ev[0].row], [1, 2, 2, 3, 3, 0]);
  // Again next year, and in another hex: still just one for the pair.
  yearHex(rec, 3, [[5, 0, 0], [0, 5, 0], [0, 3, 3], [0, 3, 3]]);
  assert.equal(ofType(rec, 'contact').length, 1);
  // A hex with all three: the pairs not yet met get theirs, the lowest shared hex first.
  yearHex(rec, 4, [[0, 0, 0], [4, 4, 4], [0, 0, 0], [0, 0, 0], [0, 0, 0], [4, 4, 0]]);
  ev = ofType(rec, 'contact');
  assert.deepEqual(ev.map((e) => [e.civ, e.other, e.year, e.hex]), [[1, 2, 2, 3], [0, 1, 4, 1], [0, 2, 4, 1]]);
  // All pairs met: nothing more, ever.
  yearHex(rec, 5, [[1, 1, 1]]);
  assert.equal(ofType(rec, 'contact').length, 3);
  assert.equal(rec.unmet, 0);
});

test('RULES.md first contact: a pair that shares a hex in the same year as another pair, and civs listed lower first', () => {
  const rec = new Records(2, 2, 4);
  yearHex(rec, 7, [[0, 0], [0, 0], [3, 1]]);
  const [e] = ofType(rec, 'contact');
  assert.deepEqual([e.civ, e.other, e.year, e.col, e.row], [0, 1, 7, 2, 0]);
});

test('RULES.md milestones: 100, 500 and 1,000 people, each once per civ, in the first year it has at least that many', () => {
  const rec = new Records(2, 2);
  const pops = [[99, 10], [100, 10], [100, 600], [499, 1000], [500, 1000], [1500, 50], [90, 1000], [100, 1000], [1000, 1000]];
  pops.forEach((p, y) => rec.endYear(y, Int32Array.from(p)));
  const ms = ofType(rec, 'milestone').map((e) => [e.civ, e.people, e.year]);
  assert.deepEqual(ms.sort((a, b) => a[0] - b[0] || a[1] - b[1]), [
    [0, 100, 1], [0, 500, 4], [0, 1000, 5],
    [1, 100, 2], [1, 500, 2], [1, 1000, 3],
  ]);
  // A jump over several thresholds in one year logs each of them.
  const r2 = new Records(1, 1);
  r2.endYear(0, Int32Array.of(5));
  r2.endYear(1, Int32Array.of(1200));
  assert.deepEqual(ofType(r2, 'milestone').map((e) => e.people), [100, 500, 1000]);
  // Dropping below and returning does not log again.
  r2.endYear(2, Int32Array.of(10));
  r2.endYear(3, Int32Array.of(2000));
  assert.equal(ofType(r2, 'milestone').length, 3);
});

test('RULES.md Wars: fight attribution per side (wins, kills) whoever attacked, reported with the lower civ first', () => {
  const rec = new Records(3, 3);
  assert.deepEqual(rec.wars(), []);
  // Civ 2 attacks civ 0 and wins: killed 4 of civ 0's people, lost 1 of its own.
  rec.fight(10, 2, 0, 2, 4, 1);
  // Civ 0 attacks civ 2 and wins: killed 2, lost 3.
  rec.fight(12, 0, 2, 0, 2, 3);
  // Civ 2 attacks civ 0 and loses: winner is civ 0, killed 5, lost 0.
  rec.fight(15, 2, 0, 0, 5, 0);
  const [w] = rec.wars();
  assert.deepEqual(w, { civs: [0, 2], firstYear: 10, lastYear: 15, fights: 3, won: [2, 1], killed: [2 + 5 + 1, 4 + 3 + 0] });
  assert.equal(rec.wars().length, 1);
});

test('RULES.md Wars: first and last year, and per-pair separation', () => {
  const rec = new Records(3, 3);
  rec.fight(7, 1, 0, 1, 1, 1);
  rec.fight(0, 1, 2, 2, 0, 0);       // year 0 is a valid first year
  rec.fight(9, 2, 1, 1, 2, 0);
  const wars = rec.wars();
  const p01 = wars.find((x) => x.civs.join() === '0,1');
  const p12 = wars.find((x) => x.civs.join() === '1,2');
  assert.deepEqual(p01, { civs: [0, 1], firstYear: 7, lastYear: 7, fights: 1, won: [0, 1], killed: [1, 1] });
  assert.deepEqual(p12, { civs: [1, 2], firstYear: 0, lastYear: 9, fights: 2, won: [1, 1], killed: [2, 0] });
});

test('RULES.md Wars: deadliest first (kills on both sides together), ties by lower first then lower second civ', () => {
  const rec = new Records(4, 4);
  rec.fight(1, 2, 3, 2, 1, 1);   // 2-3: 2
  rec.fight(1, 0, 3, 0, 1, 1);   // 0-3: 2
  rec.fight(1, 0, 1, 0, 3, 0);   // 0-1: 3
  rec.fight(1, 1, 2, 1, 1, 1);   // 1-2: 2
  rec.fight(1, 0, 2, 0, 0, 0);   // 0-2: 0, still a war
  assert.deepEqual(rec.wars().map((x) => x.civs.join('-')), ['0-1', '0-3', '1-2', '2-3', '0-2']);
  assert.deepEqual(rec.data({ high: 0 }, 1).wars, rec.wars(), 'part of the records data');
});

test('RULES.md level-ups: each level 2 to 5 logged once per civ, never level 1, not again after falling back', () => {
  const rec = new Records(2, 2);
  rec.level(0, 1, 0);                      // starting level: nothing
  rec.level(0, 2, 10); rec.level(0, 3, 20);
  rec.level(0, 2, 30);                     // fell back then climbed
  rec.level(0, 3, 35);
  rec.level(0, 4, 40); rec.level(0, 5, 50);
  rec.level(0, 5, 60);
  rec.level(1, 2, 12);
  const ev = ofType(rec, 'level').map((e) => [e.civ, e.level, e.year]);
  assert.deepEqual(ev, [[0, 2, 10], [1, 2, 12], [0, 3, 20], [0, 4, 40], [0, 5, 50]]);
  assert.ok(rec.evCount <= rec.room());
});

test('level-ups come from the simulation with the year they happened', () => {
  const sim = new Simulation({ seed: 'lv', size: 12, civCount: 3, startPop: 40 });
  sim.tick(300);
  const ev = sim.report().records.events.filter((e) => e.type === 'level');
  assert.ok(ev.length > 0, 'a 300-year run reaches level 2');
  const seen = new Set();
  for (const e of ev) {
    assert.ok(e.level >= 2 && e.level <= 5);
    assert.ok(e.year >= 1 && e.year <= 300, `year ${e.year}`);
    assert.ok(!seen.has(`${e.civ}:${e.level}`));
    seen.add(`${e.civ}:${e.level}`);
  }
});

const ev = (type, civ, year, extra = {}) => ({ type, civ, year, ...extra });

test('RULES.md chronicle: at most 12 lines; fewer events are all kept', () => {
  const few = [ev('milestone', 0, 5, { people: 100 }), ev('extinction', 1, 3)];
  assert.deepEqual(chronicle(few).map((e) => e.type), ['extinction', 'milestone']);
  const many = [];
  for (let y = 1; y <= 30; y++) many.push(ev('milestone', y % 3, y, { people: 100 }));
  assert.equal(chronicle(many).length, 12);
  const exactly = many.slice(0, 12);
  assert.equal(chronicle(exactly).length, 12);
  assert.equal(chronicle(many.slice(0, 13)).length, 12);
});

test('RULES.md chronicle: kept by importance (extinctions, level-ups higher first, contacts, milestones bigger first, famines deadlier first)', () => {
  const all = [
    ev('famine', 0, 1, { deaths: 50, endYear: 1 }), ev('famine', 1, 2, { deaths: 90, endYear: 2 }),
    ev('milestone', 0, 3, { people: 100 }), ev('milestone', 0, 4, { people: 500 }),
    ev('contact', 0, 5, { other: 1 }), ev('contact', 0, 6, { other: 2 }),
    ev('level', 0, 7, { level: 2 }), ev('level', 0, 8, { level: 3 }), ev('level', 1, 9, { level: 2 }),
    ev('extinction', 2, 10), ev('extinction', 1, 11),
  ];
  const keys = (n) => chronicle(all, n).map((e) => `${e.type}@${e.year}`).sort();
  assert.deepEqual(keys(2), ['extinction@10', 'extinction@11']);
  assert.deepEqual(keys(4), ['extinction@10', 'extinction@11', 'level@7', 'level@8'], 'level 3 first, then the earlier level 2');
  assert.deepEqual(keys(5), ['extinction@10', 'extinction@11', 'level@7', 'level@8', 'level@9']);
  assert.deepEqual(keys(6).filter((k) => k.startsWith('contact')), ['contact@5']);
  assert.deepEqual(keys(7).filter((k) => k.startsWith('contact')), ['contact@5', 'contact@6']);
  assert.deepEqual(keys(8).filter((k) => k.startsWith('milestone')), ['milestone@4'], 'the 500 before the 100');
  assert.deepEqual(keys(9).filter((k) => k.startsWith('milestone')), ['milestone@3', 'milestone@4']);
  assert.deepEqual(keys(10).filter((k) => k.startsWith('famine')), ['famine@2'], 'the deadlier famine');
  assert.equal(keys(11).length, 11);
  assert.equal(keys(12).length, 11);
});

test('RULES.md chronicle: within a kind earlier first then lower civ; famines of equal deaths by year', () => {
  const evs = [
    ev('contact', 2, 5, { other: 3 }), ev('contact', 1, 5, { other: 3 }), ev('contact', 0, 4, { other: 1 }),
  ];
  assert.deepEqual(chronicle(evs, 2).map((e) => [e.civ, e.year]), [[0, 4], [1, 5]]);
  const fam = [ev('famine', 0, 9, { deaths: 30, endYear: 9 }), ev('famine', 1, 3, { deaths: 30, endYear: 3 }), ev('famine', 2, 6, { deaths: 31, endYear: 6 })];
  assert.deepEqual(chronicle(fam, 2).map((e) => e.civ), [1, 2]);
});

test('RULES.md chronicle: shown oldest first; same year famines, level-ups, contacts, milestones, extinctions, then civ', () => {
  const evs = [
    ev('extinction', 0, 5), ev('milestone', 0, 5, { people: 100 }), ev('contact', 0, 5, { other: 1 }),
    ev('level', 1, 5, { level: 2 }), ev('level', 0, 5, { level: 2 }), ev('famine', 0, 5, { deaths: 9, endYear: 5 }),
    ev('level', 0, 2, { level: 2 }),
  ];
  const out = chronicle(evs.slice().reverse());
  assert.deepEqual(out.map((e) => `${e.type}:${e.civ}@${e.year}`),
    ['level:0@2', 'famine:0@5', 'level:0@5', 'level:1@5', 'contact:0@5', 'milestone:0@5', 'extinction:0@5']);
  // Does not change its input.
  const copy = evs.slice();
  chronicle(copy);
  assert.deepEqual(copy, evs);
});

test('RULES.md chronicle: the report holds 12 lines, oldest first, out of a longer log', () => {
  const rec = new Records(3, 3, 3);
  for (let c = 0; c < 3; c++) for (let l = 2; l <= 5; l++) rec.level(c, l, l * 10 + c); // 12 level-ups
  rec.endYear(60, Int32Array.of(1200, 1200, 1200));                                      // 9 milestones
  const d = rec.data({ high: 0 }, 70);
  assert.equal(d.events.length, 21);
  assert.equal(d.chronicle.length, 12);
  assert.equal(d.chronicle.every((e) => e.type === 'level'), true, 'level-ups outrank milestones');
  for (let i = 1; i < 12; i++) assert.ok(d.chronicle[i - 1].year <= d.chronicle[i].year);
});

test('seeded run: the log holds one first contact per pair at most, milestones once, and is deterministic', () => {
  const run = () => {
    const sim = new Simulation({ seed: 'hist', size: 12, civCount: 3, startPop: 40, mutation: 0.03 });
    sim.tick(400);
    return sim.report().records.events;
  };
  const ev = run();
  assert.deepEqual(run(), ev);
  const pairs = ev.filter((e) => e.type === 'contact').map((e) => `${e.civ}-${e.other}`);
  assert.equal(new Set(pairs).size, pairs.length);
  const ms = ev.filter((e) => e.type === 'milestone').map((e) => `${e.civ}:${e.people}`);
  assert.equal(new Set(ms).size, ms.length);
  for (const e of ev.filter((x) => x.type === 'contact')) assert.ok(e.civ < e.other);
});
