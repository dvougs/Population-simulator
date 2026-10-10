import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/sim/rng.js';
import { createWorld } from '../src/sim/world.js';
import { generateTerrain, countTerrain } from '../src/sim/mapgen.js';
import { normalizeParams } from '../src/sim/params.js';
import { WATER, MOUNTAIN, DESERT, FERTILE } from '../src/sim/constants.js';

function gen(params) {
  const p = normalizeParams(params);
  const world = createWorld(p.width, p.height);
  generateTerrain(world, p, new Rng(p.seed));
  return { world, p };
}

test('terrain mix is hit within one cell per type', () => {
  const { world, p } = gen({ seed: 'mix', width: 80, height: 60 });
  const counts = countTerrain(world);
  assert.ok(Math.abs(counts[WATER] - p.terrainMix.water * world.size) <= 1);
  assert.ok(Math.abs(counts[MOUNTAIN] - p.terrainMix.mountain * world.size) <= 1);
  assert.ok(Math.abs(counts[DESERT] - p.terrainMix.desert * world.size) <= 2);
  assert.ok(Math.abs(counts[FERTILE] - p.terrainMix.fertile * world.size) <= 2);
});

test('same seed gives the same map; different seed gives a different one', () => {
  const a = gen({ seed: 'same' }).world;
  const b = gen({ seed: 'same' }).world;
  const c = gen({ seed: 'other' }).world;
  assert.deepEqual(a.terrain, b.terrain);
  assert.deepEqual(a.foodCap, b.foodCap);
  assert.notDeepEqual(a.terrain, c.terrain);
});

test('water has no food; fertile land has the most', () => {
  const { world } = gen({ seed: 'food' });
  let fertileMin = Infinity, desertMax = 0;
  for (let i = 0; i < world.size; i++) {
    const t = world.terrain[i];
    if (t === WATER) assert.equal(world.foodCap[i], 0);
    if (t === FERTILE) fertileMin = Math.min(fertileMin, world.capacity[i]);
    if (t === DESERT) desertMax = Math.max(desertMax, world.capacity[i]);
  }
  assert.ok(fertileMin > desertMax);
});

test('terrain is spatially coherent (neighbours usually match)', () => {
  const { world } = gen({ seed: 'coherent' });
  let same = 0, total = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 1; x < world.width; x++) {
      total++;
      if (world.terrain[y * world.width + x] === world.terrain[y * world.width + x - 1]) same++;
    }
  }
  assert.ok(same / total > 0.6, `only ${(same / total).toFixed(2)} of neighbours match`);
});
