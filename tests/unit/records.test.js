// RULES.md "Statistics" > Records and History log (T-026/T-027), on hand-built people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { People } from '../../src/sim/people.js';
import { Records, FAMINE, EVENT_CAP, MILESTONES, PEAK_DECLINE_YEARS } from '../../src/sim/records.js';
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

test('RULES.md Records: constants (famine 1% and 5 deaths, 2048 events, milestones 100/500/1000, peak after 50 years)', () => {
  assert.equal(FAMINE.minShare, 0.01);
  assert.equal(FAMINE.minDeaths, 5);
  assert.equal(EVENT_CAP, 2048);
  assert.deepEqual([...MILESTONES], [100, 500, 1000]);
  assert.equal(PEAK_DECLINE_YEARS, 50);
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

test('RULES.md Statistics, famine year: starvation deaths at least 1% of last year\'s people and at least 5', () => {
  let w = famineW();
  year(w, 1, [4, 0], [96, 100]); // 4% but under 5
  assert.equal(famines(w, 1).length, 0);
  w = famineW(); w.rec.lastPop.set([400, 100]);
  year(w, 1, [4, 0], [396, 100]); // exactly 1% but only 4 deaths
  assert.equal(famines(w, 1).length, 0);
  w = famineW(); w.rec.lastPop.set([501, 100]);
  year(w, 1, [5, 0], [496, 100]); // 5 deaths but just under 1%
  assert.equal(famines(w, 1).length, 0);
  w = famineW(); w.rec.lastPop.set([500, 100]);
  year(w, 1, [5, 0], [495, 100]); // exactly 1% and exactly 5
  const ev = famines(w, 1);
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0], { type: 'famine', civ: 0, year: 1, endYear: 1, deaths: 5, ongoing: true });
  // 2% of the people used to be needed: 5 deaths of 400 (1.25%) is now a famine.
  w = famineW(); w.rec.lastPop.set([400, 100]);
  year(w, 1, [5, 0], [395, 100]);
  assert.equal(famines(w, 1).length, 1);
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

test('event cap: later famines are dropped and counted, extinctions are always kept', () => {
  const w = world(2, 1);
  w.rec.lastPop.set([100, 100]);
  // Fill the log with one-year famines for civ 0, one every other year.
  let y = 0;
  while (w.rec.evCount < EVENT_CAP - 2 - 1) {
    year(w, ++y, [10, 0], [100, 100]);
    year(w, ++y, [0, 0], [100, 100]);
  }
  assert.equal(w.rec.evCount, EVENT_CAP - 3);
  year(w, ++y, [10, 0], [100, 100]); year(w, ++y, [0, 0], [100, 100]); // 2046 events
  year(w, ++y, [10, 0], [100, 100]); year(w, ++y, [0, 0], [100, 100]); // would be 2047: kept room for 2 extinctions only
  assert.equal(w.rec.evCount, EVENT_CAP - 2, 'famines stop at the cap minus one slot per civ');
  assert.ok(w.rec.evDropped >= 1);
  year(w, ++y, [100, 100], [0, 0]);
  const d = w.rec.data(w.people, y);
  assert.equal(d.events.filter((e) => e.type === 'extinction').length, 2);
  assert.ok(d.eventsDropped >= 1);
  assert.ok(d.events.length <= EVENT_CAP);
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
  assert.equal(rec.events.length <= 2048, true);
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

test('RULES.md peak: logged after 50 years in a row below it, with the peak and its first year; moves to a later higher peak', () => {
  const rec = new Records(1, 1);
  rec.endYear(0, Int32Array.of(10));
  rec.endYear(1, Int32Array.of(50));
  rec.endYear(2, Int32Array.of(50));         // equal: still the peak, first reached in year 1
  for (let y = 3; y < 3 + 49; y++) rec.endYear(y, Int32Array.of(40)); // 49 years below
  assert.equal(ofType(rec, 'peak').length, 0, '49 years is not enough');
  rec.endYear(52, Int32Array.of(40));        // the 50th year below
  let pk = ofType(rec, 'peak');
  assert.equal(pk.length, 1);
  assert.deepEqual([pk[0].civ, pk[0].people, pk[0].year, pk[0].declineYear], [0, 50, 1, 3]);
  // A year back at the peak's level... then below again: counts restart; a new higher peak replaces the entry.
  rec.endYear(53, Int32Array.of(60));
  for (let y = 54; y < 54 + 50; y++) rec.endYear(y, Int32Array.of(55));
  pk = ofType(rec, 'peak');
  assert.equal(pk.length, 1, 'one entry per civ');
  assert.deepEqual([pk[0].people, pk[0].year, pk[0].declineYear], [60, 53, 54]);
});

test('RULES.md peak: a rise back to the peak before 50 years resets the count', () => {
  const rec = new Records(1, 1);
  rec.endYear(0, Int32Array.of(50));
  for (let y = 1; y <= 30; y++) rec.endYear(y, Int32Array.of(20));
  rec.endYear(31, Int32Array.of(50));        // back at the peak
  for (let y = 32; y <= 80; y++) rec.endYear(y, Int32Array.of(20)); // 49 years
  assert.equal(ofType(rec, 'peak').length, 0);
  rec.endYear(81, Int32Array.of(20));
  assert.equal(ofType(rec, 'peak').length, 1);
});

test('RULES.md most hexes: one per civ that held any, at the first year it held that many, added at report time', () => {
  const rec = new Records(2, 2);
  const run = (y, hexes) => rec.endYear(y, Int32Array.of(5, 5), Int32Array.from(hexes));
  run(0, [1, 0]); run(1, [3, 2]); run(2, [5, 2]); run(3, [5, 1]); run(4, [2, 4]);
  const ev = ofType(rec, 'mostHexes').map((e) => [e.civ, e.hexes, e.year]);
  assert.deepEqual(ev, [[0, 5, 2], [1, 4, 4]]);
  assert.equal(rec.evCount, 0, 'not stored in the log');
  const none = new Records(1, 1);
  none.endYear(0, Int32Array.of(0), Int32Array.of(0));
  assert.equal(ofType(none, 'mostHexes').length, 0);
});

test('RULES.md history log order in one year: famines, contacts, fights, milestones, peaks, most hexes, extinctions, then civ', () => {
  const rec = new Records(2, 2, 3);
  rec.lastPop.set([200, 200]);
  for (let i = 0; i < 20; i++) rec.starve[0]++;
  rec.fight(5, 4, 1, 0, 0, 1, 7);
  rec.endYear(5, Int32Array.of(150, 100), Int32Array.of(2, 2), Int32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3]));
  const types = rec.data({ high: 0 }, 5).events.map((e) => e.type);
  assert.deepEqual(types, ['famine', 'contact', 'fight', 'milestone', 'milestone', 'mostHexes', 'mostHexes']);
});

test('RULES.md history log: the cap drops famines and fights but keeps first contacts, milestones, peaks and extinctions', () => {
  const civs = 3;
  const rec = new Records(civs, civs, 4);
  const need = (civs * (civs - 1)) / 2 + 5 * civs;
  assert.equal(rec.room(), need, 'room for one contact per pair and 3 milestones, a peak and an extinction per civ');
  // Fill the log with fights up to the cap.
  for (let i = 0; rec.evCount < EVENT_CAP - civs; i++) rec.fight(i, 0, 0, 1, 0, 0, 1);
  const before = rec.evCount;
  rec.fight(9999, 0, 0, 1, 0, 0, 1);
  assert.equal(rec.evCount, before, 'a fight past the cap is dropped');
  assert.equal(rec.evDropped, 1);
  // Everything that can happen only a few times still goes in.
  yearHex(rec, 1, [[600, 600, 600]]);                      // 3 contacts, 3 × (100, 500) milestones
  yearHex(rec, 2, [[1100, 1100, 1100]]);                   // 1,000 milestones
  for (let y = 3; y < 3 + 50; y++) yearHex(rec, y, [[100, 100, 100]]); // peaks
  rec.starve.fill(0);
  rec.endYear(60, Int32Array.of(0, 0, 0));                 // extinctions (lastPop is set by famines())
  const d = rec.data({ high: 0 }, 60);
  const count = (t) => d.events.filter((e) => e.type === t).length;
  assert.deepEqual([count('contact'), count('milestone'), count('peak')], [3, 9, 3]);
  assert.equal(count('extinction'), 3);
  assert.ok(rec.evCount <= EVENT_CAP + rec.room());
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
