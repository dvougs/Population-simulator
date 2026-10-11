import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, describeHex } from '../../src/sim/simulation.js';
import { generateMap, hashMap, countTerrain } from '../../src/sim/mapgen.js';
import {
  DEEP_WATER, FOREST, HILLS, MOUNTAIN, TERRAIN_IDS, TERRAIN_NAMES, FOOD_CAPACITY, MOVE_COST, DEFENCE_BONUS, MATERIALS,
} from '../../src/sim/terrain.js';

test('a new simulation starts at year 0 with the generated map', () => {
  const sim = new Simulation({ seed: 'start' });
  assert.equal(sim.tickCount, 0);
  assert.equal(sim.finished, false);
  assert.equal(sim.endReason, null);
  assert.equal(sim.mapHash(), hashMap(generateMap({ seed: 'start' })));
  assert.deepEqual(sim.mapParams, {
    seed: 'start', size: 10, water: 0.25, mountains: 0.12, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
  });
});

test('one tick is one year; tick(n) runs n years when there is no end condition', () => {
  const sim = new Simulation({ seed: 'years' });
  assert.equal(sim.tick(), 1);
  assert.equal(sim.tickCount, 1);
  assert.equal(sim.tick(999), 999);
  assert.equal(sim.tickCount, 1000);
  assert.equal(sim.tick(0), 0);
  assert.equal(sim.finished, false);
});

test('nothing on the map changes as years pass (every hex keeps full food)', () => {
  const sim = new Simulation({ seed: 'still', size: 20 });
  const mapHash = sim.mapHash();
  const food = sim.map.food.slice();
  sim.tick(500);
  assert.equal(sim.mapHash(), mapHash);
  assert.deepEqual(sim.map.food, food);
  for (let i = 0; i < sim.map.count; i++) assert.equal(sim.map.food[i], sim.map.foodCap[i]);
});

test('year limit: the game ends when that year is reached', () => {
  const sim = new Simulation({ seed: 'end', endCondition: 'ticks', endTicks: 25 });
  assert.equal(sim.tick(24), 24);
  assert.equal(sim.finished, false);
  assert.equal(sim.tick(100), 1);
  assert.equal(sim.tickCount, 25);
  assert.equal(sim.finished, true);
  assert.equal(sim.endReason, 'Reached year 25');
  assert.equal(sim.tick(10), 0, 'no ticks after the end');
  assert.equal(sim.tickCount, 25);
});

test('year limit boundaries: below 10 is clamped to 10; the limit only applies with end condition "ticks"', () => {
  const low = new Simulation({ seed: 'end', endCondition: 'ticks', endTicks: 3 });
  assert.equal(low.tick(100), 10);
  assert.ok(low.finished);
  const none = new Simulation({ seed: 'end', endCondition: 'none', endTicks: 10 });
  assert.equal(none.tick(100), 100);
  assert.equal(none.finished, false);
});

test('stats report year, no people yet, terrain counts and end state', () => {
  const sim = new Simulation({ seed: 'stats', endCondition: 'ticks', endTicks: 10 });
  sim.tick(10);
  const s = sim.stats();
  assert.equal(s.tick, 10);
  assert.equal(s.totalPop, 0);
  assert.deepEqual(s.civs, []);
  assert.deepEqual(s.terrainCounts, countTerrain(sim.map));
  assert.equal(s.finished, true);
  assert.equal(s.endReason, 'Reached year 10');
  s.terrainCounts[0] = -1;
  assert.notEqual(sim.stats().terrainCounts[0], -1, 'stats are a copy');
});

test('inspect returns the RULES.md terrain values for every hex', () => {
  const sim = new Simulation({ seed: 'inspect', size: 25, rivers: 6 });
  const m = sim.map;
  for (let row = 0; row < m.rows; row++) {
    for (let col = 0; col < m.cols; col++) {
      const h = sim.inspect(col, row);
      const i = row * m.cols + col;
      const t = m.terrain[i];
      assert.equal(h.index, i);
      assert.equal(h.col, col);
      assert.equal(h.row, row);
      assert.equal(h.r, row);
      assert.equal(h.q, col - (row - (row & 1)) / 2);
      assert.equal(h.terrain, TERRAIN_IDS[t]);
      assert.equal(h.water, t === DEEP_WATER);
      assert.equal(h.lake, m.lake[i] === 1);
      assert.equal(h.river, m.river[i] === 1);
      assert.equal(h.name, t === DEEP_WATER && m.lake[i] ? 'Lake' : TERRAIN_NAMES[t]);
      assert.equal(h.foodCap, FOOD_CAPACITY[t] + (h.river ? 30 : 0));
      assert.equal(h.food, h.foodCap);
      assert.equal(h.materials, MATERIALS[t]);
      assert.equal(h.defence, DEFENCE_BONUS[t]);
      assert.equal(h.moveCost, t === DEEP_WATER ? null : MOVE_COST[t]);
    }
  }
});

test('inspect values for specific terrains match the RULES.md table', () => {
  const sim = new Simulation({ seed: 'inspect', size: 25, rivers: 0 });
  const find = (t) => {
    for (let i = 0; i < sim.map.count; i++) if (sim.map.terrain[i] === t) return sim.inspect(i % 25, Math.floor(i / 25));
    return null;
  };
  const forest = find(FOREST);
  assert.deepEqual([forest.foodCap, forest.moveCost, forest.defence, forest.materials], [40, 2, 0.25, 30]);
  const hills = find(HILLS);
  assert.deepEqual([hills.foodCap, hills.moveCost, hills.defence, hills.materials], [30, 2, 0.5, 20]);
  const mountain = find(MOUNTAIN);
  assert.deepEqual([mountain.foodCap, mountain.moveCost, mountain.defence, mountain.materials], [10, 3, 1, 0]);
  const sea = sim.inspect(0, 0);
  assert.deepEqual([sea.name, sea.water, sea.foodCap, sea.moveCost], ['Deep water', true, 0, null]);
});

test('inspect returns null off the map or for non-integers', () => {
  const sim = new Simulation({ seed: 'off' });
  for (const [c, r] of [[-1, 0], [0, -1], [10, 0], [0, 10], [1.5, 2], [NaN, 0], ['1', 1]]) {
    assert.equal(sim.inspect(c, r), null, `${c}, ${r}`);
  }
  assert.notEqual(sim.inspect(9, 9), null);
  assert.equal(describeHex(sim.map, 3, 3).index, 33);
});

test('a lake is named Lake when inspected', () => {
  for (let k = 0; k < 40; k++) {
    const sim = new Simulation({ seed: `lake${k}`, size: 30, water: 0.4 });
    const i = sim.map.lake.indexOf(1);
    if (i < 0) continue;
    const h = sim.inspect(i % 30, Math.floor(i / 30));
    assert.equal(h.name, 'Lake');
    assert.equal(h.lake, true);
    assert.equal(h.water, true);
    assert.equal(h.moveCost, null);
    return;
  }
  assert.fail('no seed made a lake');
});

test('hash includes the year; mapHash does not', () => {
  const sim = new Simulation({ seed: 'hash' });
  const h0 = sim.hash();
  const m0 = sim.mapHash();
  assert.match(h0, /^[0-9a-f]{8}$/);
  sim.tick();
  assert.notEqual(sim.hash(), h0);
  assert.equal(sim.mapHash(), m0);
});
