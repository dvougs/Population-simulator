import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CivStats, HISTORY_ROWS, HISTORY_FIELDS } from '../../src/sim/civStats.js';
import { DEATH_OLD_AGE, DEATH_STARVATION } from '../../src/sim/life.js';

const year = (st, y, pop, hexes = pop.map(() => 1), oldest = pop.map(() => 0)) =>
  st.endYear(y, Int32Array.from(pop), Int32Array.from(hexes), Int32Array.from(oldest));

test('history columns match RULES.md "Statistics"', () => {
  assert.deepEqual(HISTORY_FIELDS, ['pop', 'hexes', 'births', 'deathsOldAge', 'deathsStarvation', 'lifespanSum']);
  assert.equal(HISTORY_ROWS, 8192);
});

test('births and deaths by cause are counted per civ; average lifespan is total age at death over deaths', () => {
  const st = new CivStats(2);
  st.birth(0); st.birth(0); st.birth(1);
  st.death(0, DEATH_OLD_AGE, 60);
  st.death(0, DEATH_STARVATION, 20);
  st.death(0, DEATH_STARVATION, 1);
  year(st, 1, [5, 3], [2, 1], [60, 10]);
  const [a, b] = st.summary();
  assert.deepEqual([a.births, a.deaths.oldAge, a.deaths.starvation], [2, 1, 2]);
  assert.equal(a.avgLifespan, 27); // 81 / 3
  assert.deepEqual([b.births, b.deaths.oldAge, b.deaths.starvation], [1, 0, 0]);
  assert.equal(b.avgLifespan, null, 'no deaths yet');
  assert.deepEqual([a.name, b.name], ['Civ 1', 'Civ 2']);
  assert.deepEqual([a.pop, a.hexes, b.pop, b.hexes], [5, 2, 3, 1]);
});

test('peak population, most hexes held and oldest age only ever go up', () => {
  const st = new CivStats(1);
  year(st, 0, [10], [3], [30]);
  year(st, 1, [25], [6], [31]);
  year(st, 2, [12], [2], [20]);
  const [c] = st.summary();
  assert.deepEqual([c.pop, c.hexes, c.peakPop, c.peakHexes, c.oldestAge], [12, 2, 25, 6, 31]);
});

test('RULES.md "Statistics": extinction year is the year people fall to 0, and it stays', () => {
  const st = new CivStats(2);
  year(st, 0, [3, 4]);
  year(st, 1, [2, 4]);
  assert.equal(st.summary()[0].extinctYear, null);
  year(st, 2, [0, 4]);
  year(st, 3, [0, 4]);
  year(st, 4, [0, 0]);
  assert.deepEqual(st.summary().map((c) => c.extinctYear), [2, 4]);
});

test('a civ that never had people is not marked extinct', () => {
  const st = new CivStats(1);
  year(st, 0, [0]);
  year(st, 1, [0]);
  assert.equal(st.summary()[0].extinctYear, null);
});

test('history keeps one row per year: pop and hexes as snapshots, the rest per year', () => {
  const st = new CivStats(2);
  year(st, 0, [4, 6], [1, 2]);
  st.birth(0); st.death(1, DEATH_OLD_AGE, 70);
  year(st, 1, [5, 5], [2, 2]);
  st.death(1, DEATH_STARVATION, 3); st.death(1, DEATH_STARVATION, 5);
  year(st, 2, [5, 3], [2, 1]);
  const h = st.historyData();
  assert.equal(h.rows, 3);
  assert.equal(h.stride, 1);
  assert.deepEqual([...h.years], [0, 1, 2]);
  assert.deepEqual([...h.pop], [4, 6, 5, 5, 5, 3]);
  assert.deepEqual([...h.hexes], [1, 2, 2, 2, 2, 1]);
  assert.deepEqual([...h.births], [0, 0, 1, 0, 0, 0]);
  assert.deepEqual([...h.deathsOldAge], [0, 0, 0, 1, 0, 0]);
  assert.deepEqual([...h.deathsStarvation], [0, 0, 0, 0, 0, 2]);
  assert.deepEqual([...h.lifespanSum], [0, 0, 0, 70, 0, 8]);
  assert.doesNotThrow(() => structuredClone(h));
});

test('RULES.md "Statistics": after 8192 rows, pairs are merged (snapshots from the later year, sums added) and rows cover twice as many years', () => {
  const st = new CivStats(1);
  // Year y: pop y+1, hexes y%7, one birth, and a death at age y%90.
  const record = (y) => {
    st.birth(0);
    if (y % 3 === 0) st.death(0, DEATH_OLD_AGE, y % 90);
    year(st, y, [y + 1], [y % 7]);
  };
  for (let y = 0; y < HISTORY_ROWS; y++) record(y);
  assert.deepEqual([st.rows, st.stride], [8192, 1]);
  record(HISTORY_ROWS); // the 8193rd year triggers the merge
  assert.equal(st.stride, 2);
  assert.equal(st.rows, 4096);
  record(HISTORY_ROWS + 1);
  assert.equal(st.rows, 4097);
  const h = st.historyData();
  assert.equal(h.stride, 2);
  // First merged row covers years 0 and 1.
  assert.equal(h.years[0], 1);
  assert.equal(h.pop[0], 2);
  assert.equal(h.hexes[0], 1);
  assert.equal(h.births[0], 2);
  assert.equal(h.deathsOldAge[0], 1);
  assert.equal(h.lifespanSum[0], 0);
  // Row 1 covers years 2 and 3: pop from year 3, birth sum 2, death at year 3 (age 3).
  assert.equal(h.years[1], 3);
  assert.equal(h.pop[1], 4);
  assert.equal(h.births[1], 2);
  assert.equal(h.lifespanSum[1], 3);
  // The newest row covers the last two years.
  assert.equal(h.years[4096], HISTORY_ROWS + 1);
  assert.equal(h.pop[4096], HISTORY_ROWS + 2);
  assert.equal(h.births[4096], 2);
  // Nothing lost: sums over the history equal the running totals.
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const [c] = st.summary();
  assert.equal(sum(h.births), c.births);
  assert.equal(sum(h.deathsOldAge), c.deaths.oldAge);
  assert.equal(sum(h.lifespanSum), st.lifespanSum[0]);
  // Memory stays bounded however long the run goes.
  for (let y = HISTORY_ROWS + 2; y < HISTORY_ROWS * 4; y++) record(y);
  assert.ok(st.rows <= HISTORY_ROWS);
  assert.ok(st.stride >= 4);
  assert.equal(st.history.length, HISTORY_ROWS * HISTORY_FIELDS.length);
  const h2 = st.historyData();
  assert.equal(sum(h2.births) + st.pending[2], st.births[0]);
});
