import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CivStats, HISTORY_ROWS, HISTORY_FIELDS, EXTINCT_CAUSES, COMPLETE_FAMILY_AGE, GROWN_UP_AGE } from '../../src/sim/civStats.js';
import { DEATH_OLD_AGE, DEATH_STARVATION, DEATH_WAR, DEATH_CHILDHOOD, DEATH_CHILDBIRTH } from '../../src/sim/life.js';
import { TRAITS, TRAIT_COUNT } from '../../src/sim/traits.js';

const year = (st, y, pop, hexes = pop.map(() => 1), oldest = pop.map(() => 0)) =>
  st.endYear(y, Int32Array.from(pop), Int32Array.from(hexes), Int32Array.from(oldest));

test('history columns match RULES.md "Statistics"', () => {
  assert.deepEqual(HISTORY_FIELDS, ['pop', 'hexes', 'births', 'deathsOldAge', 'deathsStarvation', 'lifespanSum', 'deathsWar', 'level',
    'deathsChildhood', 'deathsChildbirth']);
  assert.deepEqual(EXTINCT_CAUSES, ['oldAge', 'starvation', 'war', 'childhood', 'childbirth', 'switching']);
  assert.deepEqual([COMPLETE_FAMILY_AGE, GROWN_UP_AGE], [45, 15]);
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

test('RULES.md "Statistics": peak population year is the first year the peak was reached', () => {
  const st = new CivStats(1);
  year(st, 1, [5]);
  year(st, 2, [9]);
  year(st, 3, [9]);
  year(st, 4, [4]);
  const [c] = st.summary();
  assert.equal(c.peakPop, 9);
  assert.equal(c.peakPopYear, 2);
});

test('RULES.md "Statistics": war deaths are their own column and count towards lifespan and totals', () => {
  const st = new CivStats(2);
  st.death(0, DEATH_WAR, 30);
  st.death(0, DEATH_WAR, 10);
  st.death(0, DEATH_OLD_AGE, 80);
  year(st, 1, [5, 5]);
  const [a, b] = st.summary();
  assert.deepEqual(a.deaths, { oldAge: 1, starvation: 0, war: 2, childhood: 0, childbirth: 0 });
  assert.equal(a.avgLifespan, 40, '(30 + 10 + 80) / 3, war deaths included');
  assert.deepEqual(b.deaths, { oldAge: 0, starvation: 0, war: 0, childhood: 0, childbirth: 0 });
  const h = st.historyData();
  assert.deepEqual([...h.deathsWar], [2, 0]);
  assert.deepEqual([...h.deathsOldAge], [1, 0]);
});

test('fights count for both sides and wins for the winner; switches count in and out', () => {
  const st = new CivStats(3);
  st.fight(0, 1, 1);
  st.fight(2, 0, 2);
  st.switched(0, 1);
  st.switched(0, 2);
  st.switched(1, 0);
  year(st, 1, [1, 1, 1]);
  const s = st.summary();
  assert.deepEqual(s.map((c) => c.fights), [2, 1, 1]);
  assert.deepEqual(s.map((c) => c.fightsWon), [0, 1, 1]);
  assert.deepEqual(s.map((c) => c.switchesOut), [2, 1, 0]);
  assert.deepEqual(s.map((c) => c.switchesIn), [1, 1, 1]);
});

test('RULES.md "Statistics": extinction cause is the most deaths that year (tie: old age, starvation, war, childhood, childbirth), switching if none', () => {
  const cause = (setup) => {
    const st = new CivStats(1);
    year(st, 0, [3]);
    setup(st);
    year(st, 1, [0]);
    return st.summary()[0].extinctCause;
  };
  assert.equal(cause((st) => { st.death(0, DEATH_WAR, 5); st.death(0, DEATH_WAR, 5); st.death(0, DEATH_STARVATION, 5); }), 'war');
  assert.equal(cause((st) => { st.death(0, DEATH_WAR, 5); st.death(0, DEATH_STARVATION, 5); }), 'starvation');
  assert.equal(cause((st) => { st.death(0, DEATH_WAR, 5); st.death(0, DEATH_OLD_AGE, 5); }), 'oldAge');
  assert.equal(cause((st) => { st.death(0, DEATH_CHILDHOOD, 3); st.death(0, DEATH_CHILDHOOD, 3); st.death(0, DEATH_WAR, 5); }), 'childhood');
  assert.equal(cause((st) => { st.death(0, DEATH_CHILDBIRTH, 30, 1, 3); st.death(0, DEATH_CHILDBIRTH, 30, 1, 3); st.death(0, DEATH_CHILDHOOD, 3); }), 'childbirth');
  assert.equal(cause((st) => { st.death(0, DEATH_CHILDBIRTH, 30, 1, 3); st.death(0, DEATH_CHILDHOOD, 3); }), 'childhood', 'tie: childhood before childbirth');
  assert.equal(cause((st) => { st.death(0, DEATH_CHILDBIRTH, 30, 1, 3); st.death(0, DEATH_WAR, 30); }), 'war', 'tie: war before childbirth');
  assert.equal(cause((st) => { st.death(0, DEATH_CHILDHOOD, 3); st.death(0, DEATH_OLD_AGE, 70); }), 'oldAge', 'tie: old age first');
  assert.equal(cause(() => {}), 'switching');
});

test('RULES.md "Statistics": the level column is a snapshot (1 when no levels are passed)', () => {
  const st = new CivStats(2);
  st.endYear(0, Int32Array.of(5, 5), Int32Array.of(1, 1), Int32Array.of(0, 0));
  st.endYear(1, Int32Array.of(5, 5), Int32Array.of(1, 1), Int32Array.of(0, 0), null, Uint8Array.of(2, 1));
  const h = st.historyData();
  assert.deepEqual([...h.level], [1, 1, 2, 1]);
});

test('RULES.md "Statistics": trait averages are recorded per row, NaN while a civ has nobody, and the founders\' averages are kept', () => {
  const st = new CivStats(2);
  const avg = (a, b) => {
    const t = new Float64Array(2 * TRAIT_COUNT);
    for (let k = 0; k < TRAIT_COUNT; k++) { t[k] = a + k / 100; t[TRAIT_COUNT + k] = b; }
    return t;
  };
  const end = (y, pop, t) => st.endYear(y, Int32Array.from(pop), Int32Array.of(1, 1), Int32Array.of(0, 0), t, Uint8Array.of(1, 1));
  end(0, [3, 3], avg(0.4, 0.6));
  end(1, [3, 3], avg(0.5, 0.7));
  const dead = avg(0.9, NaN);
  end(2, [3, 0], dead);
  const h = st.historyData();
  assert.deepEqual(h.traitIds, TRAITS);
  assert.equal(h.traitCount, 8);
  assert.equal(h.traits.length, 3 * 2 * 8);
  assert.ok(Math.abs(h.traits[(1 * 2 + 0) * 8 + 3] - 0.53) < 1e-6);
  assert.ok(Number.isNaN(h.traits[(2 * 2 + 1) * 8]), 'civ 2 has nobody in year 2');
  const [a, b] = st.summary();
  assert.equal(a.startTraits.fertility, 0.4);
  assert.equal(a.startTraits.lifeExpectancy, 0.41);
  assert.equal(a.traits.fertility, 0.9, 'now');
  assert.equal(b.traits.fertility, 0.7, 'its last averages while it had people');
  assert.equal(b.startTraits.fertility, 0.6);
});

test('RULES.md "Statistics": merged rows take the trait averages and the level from the later year', () => {
  const st = new CivStats(1);
  const rec = (y) => {
    const t = new Float64Array(TRAIT_COUNT).fill((y % 100) / 100);
    st.endYear(y, Int32Array.of(1), Int32Array.of(1), Int32Array.of(0), t, Uint8Array.of(1 + (y % 5)));
  };
  for (let y = 0; y < HISTORY_ROWS + 2; y++) rec(y);
  assert.equal(st.stride, 2);
  const h = st.historyData();
  // Row r covers years 2r and 2r + 1.
  for (const r of [0, 1, 7, 100, 4095]) {
    const later = 2 * r + 1;
    assert.equal(h.years[r], later);
    assert.ok(Math.abs(h.traits[r * TRAIT_COUNT] - (later % 100) / 100) < 1e-6, `row ${r} fertility`);
    assert.equal(h.level[r], 1 + (later % 5), `row ${r} level`);
  }
});

test('RULES.md "Statistics": childhood and childbirth deaths are their own columns and count towards lifespan and totals', () => {
  const st = new CivStats(2);
  st.death(0, DEATH_CHILDHOOD, 1);
  st.death(0, DEATH_CHILDHOOD, 4);
  st.death(0, DEATH_CHILDBIRTH, 25, 1, 2);
  st.death(0, DEATH_OLD_AGE, 70);
  year(st, 1, [5, 5]);
  const [a, b] = st.summary();
  assert.deepEqual(a.deaths, { oldAge: 1, starvation: 0, war: 0, childhood: 2, childbirth: 1 });
  assert.equal(a.avgLifespan, 25, '(1 + 4 + 25 + 70) / 4, every cause included');
  assert.deepEqual(b.deaths, { oldAge: 0, starvation: 0, war: 0, childhood: 0, childbirth: 0 });
  const h = st.historyData();
  assert.deepEqual([...h.deathsChildhood], [2, 0]);
  assert.deepEqual([...h.deathsChildbirth], [1, 0]);
  assert.deepEqual([...h.deathsOldAge], [1, 0]);
  assert.deepEqual([...h.lifespanSum], [100, 0]);
});

test('RULES.md "Statistics": lifespan of those who grew up counts deaths at 15 or older only (boundary 14 / 15)', () => {
  const st = new CivStats(1);
  st.death(0, DEATH_CHILDHOOD, 14);
  year(st, 1, [5]);
  assert.equal(st.summary()[0].grownLifespan, null, 'no one died at 15 or older yet');
  st.death(0, DEATH_STARVATION, 15);
  st.death(0, DEATH_OLD_AGE, 60);
  st.death(0, DEATH_CHILDHOOD, 1);
  year(st, 2, [5]);
  const [c] = st.summary();
  assert.equal(c.grownLifespan, 37.5);
  assert.equal(c.avgLifespan, 22.5, '(14 + 15 + 60 + 1) / 4');
});

test('RULES.md "Statistics": children per woman is the children borne by women who died at 45 or older, over those women', () => {
  const st = new CivStats(2);
  st.death(0, DEATH_OLD_AGE, 44, 1, 9); // too young
  st.death(0, DEATH_OLD_AGE, 60, 0, 9); // a man
  year(st, 1, [5, 5]);
  assert.equal(st.summary()[0].childrenPerWoman, null, 'none until such a woman has died');
  st.death(0, DEATH_OLD_AGE, 45, 1, 5);
  st.death(0, DEATH_OLD_AGE, 70, 1, 4);
  st.death(0, DEATH_STARVATION, 50, 1, 6);
  st.death(1, DEATH_OLD_AGE, 80, 1, 2);
  year(st, 2, [5, 5]);
  const [a, b] = st.summary();
  assert.equal(a.childrenPerWoman, 5, '(5 + 4 + 6) / 3');
  assert.equal(b.childrenPerWoman, 2);
});
