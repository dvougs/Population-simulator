// RULES.md "Statistics" > Records and History log (T-026/T-027), on hand-built people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { People } from '../../src/sim/people.js';
import { Records, FAMINE, EVENT_CAP } from '../../src/sim/records.js';
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

test('RULES.md Records: constants (famine 2% and 5 deaths, 2048 events)', () => {
  assert.equal(FAMINE.minShare, 0.02);
  assert.equal(FAMINE.minDeaths, 5);
  assert.equal(EVENT_CAP, 2048);
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

test('famine year: starvation deaths at least 2% of last year\'s people and at least 5', () => {
  let w = famineW();
  year(w, 1, [4, 0], [96, 100]); // 4% but under 5
  assert.equal(w.rec.data(w.people, 1).events.length, 0);
  w = famineW(); w.rec.lastPop.set([200, 100]);
  year(w, 1, [4, 0], [196, 100]); // 2% exactly but only 4 deaths
  assert.equal(w.rec.data(w.people, 1).events.length, 0);
  w = famineW(); w.rec.lastPop.set([300, 100]);
  year(w, 1, [5, 0], [295, 100]); // 5 deaths but 1.67% < 2%
  assert.equal(w.rec.data(w.people, 1).events.length, 0);
  w = famineW(); w.rec.lastPop.set([250, 100]);
  year(w, 1, [5, 0], [245, 100]); // exactly 2% and exactly 5
  const ev = w.rec.data(w.people, 1).events;
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0], { type: 'famine', civ: 0, year: 1, endYear: 1, deaths: 5, ongoing: true });
});

test('consecutive famine years merge into one famine; a quiet year ends it', () => {
  const w = famineW();
  year(w, 1, [10, 0], [90, 100]);
  year(w, 2, [8, 0], [82, 100]);
  year(w, 3, [0, 0], [82, 100]);       // ends it
  year(w, 4, [9, 0], [73, 100]);       // a second one
  year(w, 5, [0, 0], [73, 100]);
  const d = w.rec.data(w.people, 5);
  assert.deepEqual(d.events.map((e) => [e.civ, e.year, e.endYear, e.deaths]), [[0, 1, 2, 18], [0, 4, 4, 9]]);
  assert.deepEqual(d.worstFamine, { civ: 0, startYear: 1, endYear: 2, deaths: 18, ongoing: false });
  assert.equal(d.events.every((e) => !e.ongoing), true);
});

test('a famine still going at report time counts up to the last year', () => {
  const w = famineW();
  year(w, 1, [10, 0], [90, 100]);
  year(w, 2, [20, 0], [70, 100]);
  const d = w.rec.data(w.people, 2);
  assert.deepEqual(d.worstFamine, { civ: 0, startYear: 1, endYear: 2, deaths: 30, ongoing: true });
  assert.equal(d.events[0].ongoing, true);
  assert.equal(d.events[0].endYear, 2);
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
  assert.deepEqual(ev.map((e) => [e.type, e.civ, e.year]), [['famine', 0, 1], ['famine', 1, 2], ['extinction', 0, 2], ['extinction', 1, 2]]);
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
