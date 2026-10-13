// RULES.md "Setup" (Starting positions: Random positions) and LIFE.spreadRounds: spreadStarts and LocalSimHost.spreadStarts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadStarts, LIFE } from '../../src/sim/life.js';
import { LocalSimHost } from '../../src/host/simHost.js';
import { Rng } from '../../src/sim/rng.js';
import { indexToAxial, distance } from '../../src/sim/hex.js';
import { PLAINS, DESERT, DEEP_WATER, FOOD_CAPACITY } from '../../src/sim/terrain.js';
import { makeMap } from './helpers.js';

const COLS = 20;
const random = (seed) => { const r = new Rng(seed); return () => r.next(); };
const dist = (a, b) => { const p = indexToAxial(a, COLS); const q = indexToAxial(b, COLS); return distance(p.q, p.r, q.q, q.r); };
const gaps = (at) => at.map((a, i) => Math.min(...at.filter((_, j) => j !== i).map((b) => dist(a, b))));

test('RULES.md "Starting positions": the number of rounds is 20', () => {
  assert.equal(LIFE.spreadRounds, 20);
  assert.equal(LIFE.startMinFood, 40);
});

test('RULES.md "Random positions": one good start hex for each civ, all different', () => {
  // Desert (food 10) is not good; plains (60) is; deep water is not land.
  const map = makeMap(COLS, COLS, (i) => (i % 7 === 0 ? DESERT : i % 11 === 0 ? DEEP_WATER : PLAINS));
  assert.ok(FOOD_CAPACITY[DESERT] < 40 && FOOD_CAPACITY[PLAINS] >= 40);
  for (const civs of [1, 2, 3, 5, 8]) {
    for (const seed of ['a', 'b', 'c']) {
      const at = spreadStarts(map, civs, random(seed));
      assert.equal(at.length, civs);
      assert.equal(new Set(at).size, civs, `${civs} civs on distinct hexes`);
      for (const h of at) {
        assert.ok(Number.isInteger(h) && h >= 0 && h < map.count);
        assert.ok(map.terrain[h] !== DEEP_WATER && map.foodCap[h] >= LIFE.startMinFood, `hex ${h} is a good start`);
      }
    }
  }
});

test('RULES.md "Random positions": spread as evenly as the land allows (the smallest gap is close to the largest)', () => {
  const map = makeMap(COLS, COLS, () => PLAINS);
  for (const civs of [3, 4, 6, 8]) {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const g = gaps(spreadStarts(map, civs, random(seed)));
      const lo = Math.min(...g);
      const hi = Math.max(...g);
      assert.ok(lo >= 0.75 * hi, `${civs} civs, seed ${seed}: smallest gap ${lo}, largest ${hi}`);
      assert.ok(lo >= 8, `${civs} civs are well apart: ${lo}`);
    }
  }
  // Two civs end up far apart whatever the first random pick.
  for (const seed of ['a', 'b', 'c']) assert.ok(Math.min(...gaps(spreadStarts(map, 2, random(seed)))) >= 25);
});

test('RULES.md "Random positions": deterministic for a given random function; a different one gives a different spread', () => {
  const map = makeMap(COLS, COLS, () => PLAINS);
  const a = spreadStarts(map, 4, random('x'));
  assert.deepEqual(spreadStarts(map, 4, random('x')), a);
  const others = ['y', 'z', 'w', 'v', 'u'].map((s) => spreadStarts(map, 4, random(s)).join());
  assert.ok(others.some((o) => o !== a.join()), 'not always the same hexes');
  // A constant random function works too (ties broken by the first pick).
  assert.deepEqual(spreadStarts(map, 3, () => 0), spreadStarts(map, 3, () => 0));
});

test('RULES.md "Random positions": too few good hexes means any land; too few land hexes means civs share', () => {
  // Only 2 good hexes for 3 civs: any land is used.
  const map = makeMap(COLS, COLS, (i) => (i === 21 || i === 300 ? PLAINS : DESERT));
  const at = spreadStarts(map, 3, random('s'));
  assert.equal(new Set(at).size, 3);
  assert.ok(at.every((h) => map.terrain[h] !== DEEP_WATER));
  // Exactly enough good hexes: they are the ones used.
  const two = spreadStarts(map, 2, random('s'));
  assert.deepEqual([...two].sort((x, y) => x - y), [21, 300]);
  // Two land hexes for four civs.
  const tiny = makeMap(COLS, COLS, (i) => (i === 5 || i === 6 ? PLAINS : DEEP_WATER));
  const four = spreadStarts(tiny, 4, random('s'));
  assert.equal(four.length, 4);
  assert.deepEqual([...new Set(four)].sort((x, y) => x - y), [5, 6]);
  // No land or no civs.
  assert.deepEqual(spreadStarts(makeMap(5, 5, () => DEEP_WATER), 3, random('s')), []);
  assert.deepEqual(spreadStarts(map, 0, random('s')), []);
});

test('LocalSimHost.spreadStarts(params): one distinct land hex per civ of the map the params make', () => {
  const host = new LocalSimHost();
  const params = { seed: 'spread-host', size: 20, civCount: 5 };
  const at = host.spreadStarts(params);
  assert.equal(at.length, 5);
  assert.equal(new Set(at).size, 5);
  const map = host.generated(params);
  for (const h of at) assert.ok(map.terrain[h] !== DEEP_WATER && map.foodCap[h] >= LIFE.startMinFood, `hex ${h} is a good start`);
  assert.equal(host.spreadStarts({ ...params, civCount: 2 }).length, 2);
});
