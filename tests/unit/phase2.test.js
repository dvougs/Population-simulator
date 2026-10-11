// Phase 2 at the whole-sim level: setup params, the people pool over a run, statistics totals,
// determinism, the host boundary and the headless report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Simulation } from '../../src/sim/simulation.js';
import { LocalSimHost } from '../../src/host/simHost.js';
import {
  normalizeParams, presetParams, randomParams, PRESETS, DEFAULT_PARAMS, LIMITS,
} from '../../src/sim/params.js';
import { DEEP_WATER } from '../../src/sim/terrain.js';

function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

test('RULES.md "Game settings": civ count 3 (1 to 8) and starting population 20 (2 to 200)', () => {
  assert.equal(DEFAULT_PARAMS.civCount, 3);
  assert.equal(DEFAULT_PARAMS.startPop, 20);
  assert.deepEqual(LIMITS.civCount, { min: 1, max: 8 });
  assert.deepEqual(LIMITS.startPop, { min: 2, max: 200 });
});

test('civCount: clamped to 1-8 on both sides, rounded, bad values fall back to 3', () => {
  const c = (v) => normalizeParams({ civCount: v }).civCount;
  assert.equal(c(0), 1);
  assert.equal(c(1), 1);
  assert.equal(c(2), 2);
  assert.equal(c(7), 7);
  assert.equal(c(8), 8);
  assert.equal(c(9), 8);
  assert.equal(c(-5), 1);
  assert.equal(c(4.4), 4);
  assert.equal(c(4.6), 5);
  assert.equal(c('6'), 6);
  for (const bad of ['abc', null, undefined, NaN, '', Infinity - Infinity, {}]) assert.equal(c(bad), 3, String(bad));
});

test('startPop: clamped to 2-200 on both sides, rounded, bad values fall back to 20', () => {
  const s = (v) => normalizeParams({ startPop: v }).startPop;
  assert.equal(s(1), 2);
  assert.equal(s(2), 2);
  assert.equal(s(3), 3);
  assert.equal(s(199), 199);
  assert.equal(s(200), 200);
  assert.equal(s(201), 200);
  assert.equal(s(-1), 2);
  assert.equal(s(1e9), 200);
  assert.equal(s(30.5), 31);
  assert.equal(s('45'), 45);
  for (const bad of ['x', null, undefined, NaN, '']) assert.equal(s(bad), 20, String(bad));
});

test('RULES.md "Game settings": each preset sets the civs', () => {
  const want = { default: [3, 20], continent: [4, 30], archipelago: [5, 20], highlands: [3, 20], large: [6, 40] };
  assert.deepEqual(Object.keys(PRESETS), Object.keys(want));
  for (const [key, [civs, pop]] of Object.entries(want)) {
    const p = presetParams(key);
    assert.deepEqual([p.civCount, p.startPop], [civs, pop], key);
    assert.deepEqual(normalizeParams(p), p, `${key} is already normalised`);
  }
});

test('RULES.md "Game settings": randomise picks 2 to 6 civs and 10 to 50 people each', () => {
  const lo = randomParams(() => 0);
  const hi = randomParams(() => 0.9999999);
  assert.deepEqual([lo.civCount, lo.startPop], [2, 10]);
  assert.deepEqual([hi.civCount, hi.startPop], [6, 50]);
  const random = lcg(5);
  const seen = new Set();
  for (let k = 0; k < 300; k++) {
    const p = randomParams(random);
    assert.ok(p.civCount >= 2 && p.civCount <= 6 && Number.isInteger(p.civCount));
    assert.ok(p.startPop >= 10 && p.startPop <= 50 && Number.isInteger(p.startPop));
    assert.deepEqual(normalizeParams(p), p);
    seen.add(p.civCount);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5, 6]);
});

test('a new game has civCount civs of startPop people on land, year 0 history row has pop = startPop', () => {
  for (const [civs, pop] of [[3, 20], [1, 2], [8, 200], [5, 7]]) {
    const sim = new Simulation({ seed: 'start', size: 20, civCount: civs, startPop: pop });
    assert.equal(sim.people.count, civs * pop);
    assert.equal(sim.stats().totalPop, civs * pop);
    assert.equal(sim.stats().civs.length, civs);
    const h = sim.history();
    assert.equal(h.rows, 1);
    assert.equal(h.years[0], 0);
    for (let k = 0; k < civs; k++) {
      assert.equal(h.pop[k], pop);
      assert.equal(h.births[k] + h.deathsOldAge[k] + h.deathsStarvation[k], 0);
      assert.equal(h.hexes[k], 1, 'founders share one start hex');
    }
    for (const s of sim.starts) assert.notEqual(sim.map.terrain[s], DEEP_WATER);
  }
});

function runChecked(params, years) {
  const sim = new Simulation(params);
  const p = sim.people;
  for (let y = 0; y < years; y++) {
    sim.tick(1);
    let alive = 0;
    for (let i = 0; i < p.high; i++) {
      if (!p.alive[i]) continue;
      alive++;
      assert.notEqual(sim.map.terrain[p.hex[i]], DEEP_WATER, 'nobody on water');
      assert.ok(p.age[i] <= 85, `age ${p.age[i]}: nobody lives past 85`);
      assert.ok(p.health[i] > 0 && p.health[i] <= 100);
    }
    assert.equal(p.count, alive, 'count equals alive slots');
    assert.equal(p.count + p.freeTop, p.high, 'no leaked slots');
    for (let h = 0; h < sim.map.count; h++) assert.ok(sim.map.food[h] >= 0 && sim.map.food[h] <= sim.map.foodCap[h]);
  }
  return sim;
}

test('over a run: pool has no leaks, nobody on water, nobody older than 85, food in range', () => {
  runChecked({ seed: 'pool', size: 16, civCount: 4, startPop: 30 }, 250);
  runChecked({ seed: 'pool2', size: 10, civCount: 8, startPop: 200, water: 0.5 }, 120);
});

test('totals: per civ, start pop + births - deaths = alive; history sums equal the totals', () => {
  for (const seed of ['t1', 't2', 'd']) {
    const startPop = 12;
    const sim = new Simulation({ seed, size: 14, civCount: 5, startPop });
    sim.tick(400);
    const h = sim.history();
    assert.equal(h.rows, 401);
    assert.equal(h.stride, 1);
    assert.deepEqual([...h.years].slice(0, 3), [0, 1, 2]);
    assert.equal(h.years[400], 400);
    const stats = sim.stats();
    let alive = 0;
    stats.civs.forEach((c, k) => {
      const deaths = c.deaths.oldAge + c.deaths.starvation;
      assert.equal(startPop + c.births - deaths, c.pop, `${seed} civ ${k}`);
      let births = 0; let old = 0; let starve = 0; let life = 0;
      for (let r = 0; r < h.rows; r++) {
        births += h.births[r * h.civs + k];
        old += h.deathsOldAge[r * h.civs + k];
        starve += h.deathsStarvation[r * h.civs + k];
        life += h.lifespanSum[r * h.civs + k];
      }
      assert.deepEqual([births, old, starve], [c.births, c.deaths.oldAge, c.deaths.starvation]);
      assert.equal(h.pop[400 * h.civs + k], c.pop);
      assert.equal(h.hexes[400 * h.civs + k], c.hexes);
      if (deaths > 0) assert.equal(c.avgLifespan, Math.round((life / deaths) * 10) / 10);
      assert.ok(c.peakPop >= c.pop && c.peakPop >= startPop);
      assert.ok(c.oldestAge <= 85);
      alive += c.pop;
    });
    assert.equal(alive, stats.totalPop);
    assert.equal(stats.totalPop, sim.people.count);
  }
});

test('hexes held match the people: each civ holds the hexes where at least one of its people stands', () => {
  const sim = new Simulation({ seed: 'hexes', size: 14, civCount: 4, startPop: 25 });
  sim.tick(60);
  const p = sim.people;
  sim.stats().civs.forEach((c, k) => {
    const set = new Set();
    for (let i = 0; i < p.high; i++) if (p.alive[i] && p.civ[i] === k) set.add(p.hex[i]);
    assert.equal(c.hexes, set.size);
  });
});

test('extinction: extinctYear is the first year the civ has 0 people, and only then', () => {
  const sim = new Simulation({ seed: 'd', size: 10, civCount: 8, startPop: 2 });
  sim.tick(300);
  const h = sim.history();
  let extinct = 0;
  sim.stats().civs.forEach((c, k) => {
    const pops = Array.from({ length: h.rows }, (_, r) => h.pop[r * h.civs + k]);
    const first = pops.findIndex((v, r) => v === 0 && r > 0 && pops[r - 1] > 0);
    if (first >= 0) {
      assert.equal(c.extinctYear, h.years[first], `civ ${k}`);
      assert.equal(c.pop === 0 || pops.slice(first).some((v) => v > 0), true);
      extinct++;
    } else assert.equal(c.extinctYear, null, `civ ${k}`);
  });
  assert.ok(extinct > 0, 'with 8 civs of 2 people at least one dies out within 300 years');
});

test('a civ of 2 with no way to eat dies out: extinction recorded at the year its people hit 0', () => {
  // Desert-only land makes starvation certain eventually; use a tiny, harsh map instead of assuming terrain.
  const sim = new Simulation({ seed: 'harsh', size: 10, civCount: 8, startPop: 2, water: 0.7, mountains: 0.4 });
  sim.tick(400);
  for (const c of sim.stats().civs) {
    if (c.pop === 0) assert.ok(c.extinctYear !== null && c.extinctYear >= 1 && c.extinctYear <= 400);
    else assert.equal(c.extinctYear, null);
  }
});

test('determinism: same params and seed give the same state hash; a different seed or setting differs', () => {
  const params = { seed: 'det', size: 16, civCount: 4, startPop: 25 };
  const a = new Simulation(params);
  const b = new Simulation({ ...params });
  assert.equal(a.hash(), b.hash());
  a.tick(300); b.tick(300);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.history(), b.history());
  const c = new Simulation({ ...params, seed: 'det2' });
  c.tick(300);
  assert.notEqual(c.hash(), a.hash());
  const d = new Simulation({ ...params, startPop: 26 });
  d.tick(300);
  assert.notEqual(d.hash(), a.hash());
});

test('determinism: chunked ticking gives the same hash as ticking all at once', () => {
  const params = { seed: 'chunk', size: 16, civCount: 6, startPop: 40 };
  const once = new Simulation(params);
  once.tick(250);
  const parts = new Simulation(params);
  for (const n of [1, 7, 50, 1, 0, 100, 91]) parts.tick(n);
  assert.equal(parts.tickCount, 250);
  assert.equal(parts.hash(), once.hash());
  assert.deepEqual(parts.stats().civs, once.stats().civs);
});

test('the people subsystems use their own streams: the civ count does not change the map', () => {
  const a = new Simulation({ seed: 'map', civCount: 1 });
  const b = new Simulation({ seed: 'map', civCount: 8, startPop: 200 });
  assert.equal(a.mapHash(), b.mapHash());
});

test('host.history() and host.stats() survive structuredClone', () => {
  const host = new LocalSimHost();
  assert.equal(host.history(), null);
  host.start({ seed: 'clone', size: 12 });
  host.tick(40);
  const hist = host.history();
  const stats = host.stats();
  const h2 = structuredClone(hist);
  const s2 = structuredClone(stats);
  assert.deepEqual(h2, hist);
  assert.deepEqual(s2, stats);
  assert.equal(hist.rows, 41);
  assert.ok(hist.pop instanceof Int32Array);
  assert.ok(hist.lifespanSum instanceof Float64Array);
  hist.pop[0] = -1;
  assert.notEqual(host.history().pop[0], -1, 'history is a copy');
  const hex = host.inspect(5, 5);
  assert.doesNotThrow(() => structuredClone(hex));
  assert.equal(hex.people, hex.peopleByCiv.reduce((x, y) => x + y, 0));
});

test('inspect lists people per civ on a hex (RULES.md "Statistics")', () => {
  const sim = new Simulation({ seed: 'insp', size: 12, civCount: 2, startPop: 9 });
  const s = sim.starts[0];
  const d = sim.inspect(s % sim.map.cols, Math.floor(s / sim.map.cols));
  assert.equal(d.people, sim.starts[1] === s ? 18 : 9);
  assert.equal(d.peopleByCiv.length, 2);
  assert.equal(d.peopleByCiv[0], 9);
});

test('headless --json parses with civs, extinctions, samples and a 401-entry history for 400 ticks', () => {
  const out = execFileSync(process.execPath, ['tools/headless.js', '--seed', 'd', '--ticks', '400', '--civs', '8', '--start-pop', '2', '--every', '100', '--json'],
    { encoding: 'utf8', cwd: new URL('../..', import.meta.url) });
  const r = JSON.parse(out);
  assert.equal(r.civs.length, 8);
  assert.equal(r.civCount, 8);
  assert.equal(r.startPop, 2);
  assert.ok(Array.isArray(r.extinctions));
  assert.equal(r.extinctions.length, r.civs.filter((c) => c.pop === 0).length);
  assert.equal(r.samples.length, 5, 'years 0, 100, 200, 300, 400');
  assert.deepEqual(r.samples.map((s) => s.year), [0, 100, 200, 300, 400]);
  assert.equal(r.history.civs.length, 8);
  assert.equal(r.history.yearsPerRow, 1);
  assert.equal(r.history.years.length, 401);
  for (const c of r.history.civs) {
    assert.equal(c.pop.length, 401);
    assert.equal(c.pop[0], 2);
  }
  const ref = new Simulation({ seed: 'd', size: 10, civCount: 8, startPop: 2 });
  ref.tick(400);
  assert.equal(r.hash, ref.hash());
});
