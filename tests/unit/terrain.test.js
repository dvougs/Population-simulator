import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT,
  TERRAIN_IDS, TERRAIN_NAMES, FOOD_CAPACITY, MOVE_COST, DEFENCE_BONUS,
  RIVER_FOOD_BONUS, isWater,
} from '../../src/sim/terrain.js';

// RULES.md "Terrain" table, row by row.
const RULES_TABLE = [
  [DEEP_WATER, 'Deep water', 0, Infinity, 0],
  [COAST, 'Coast', 50, 1, 0],
  [PLAINS, 'Plains', 60, 1, 0],
  [FOREST, 'Forest', 40, 2, 0.25],
  [HILLS, 'Hills', 30, 2, 0.5],
  [MOUNTAIN, 'Mountain', 10, 3, 1],
  [DESERT, 'Desert', 10, 1.5, 0],
  [TUNDRA, 'Tundra', 15, 1.5, 0],
];

test('terrain table equals RULES.md', () => {
  assert.equal(TERRAIN_COUNT, 8);
  for (const [id, name, food, move, defence] of RULES_TABLE) {
    assert.equal(TERRAIN_NAMES[id], name);
    assert.equal(FOOD_CAPACITY[id], food, `${name} food capacity`);
    assert.equal(MOVE_COST[id], move, `${name} movement cost`);
    assert.equal(DEFENCE_BONUS[id], defence, `${name} defence bonus`);
  }
  for (const arr of [TERRAIN_IDS, TERRAIN_NAMES, FOOD_CAPACITY, MOVE_COST, DEFENCE_BONUS]) {
    assert.equal(arr.length, TERRAIN_COUNT);
  }
});

test('river adds +30 food capacity', () => {
  assert.equal(RIVER_FOOD_BONUS, 30);
});

test('only deep water is water, and it is impassable', () => {
  for (let t = 0; t < TERRAIN_COUNT; t++) {
    assert.equal(isWater(t), t === DEEP_WATER);
    assert.equal(Number.isFinite(MOVE_COST[t]), t !== DEEP_WATER);
  }
});
