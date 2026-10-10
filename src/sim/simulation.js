// Simulation: owns the map and the clock. The only entry point the UI, the
// headless runner and the tests use. Phase 1 has no people yet: a year passes
// each tick and the map stays as generated.

import { normalizeParams, mapParams } from './params.js';
import { generateMap, countTerrain, hashMap, fnv } from './mapgen.js';
import { indexToAxial } from './hex.js';
import {
  DEEP_WATER, TERRAIN_IDS, TERRAIN_NAMES, MOVE_COST, DEFENCE_BONUS, MATERIALS,
} from './terrain.js';

export class Simulation {
  constructor(params) {
    this.params = normalizeParams(params);
    this.map = generateMap(this.params);
    this.terrainCounts = countTerrain(this.map);
    this.tickCount = 0;
    this.finished = false;
    this.endReason = null;
  }

  /** Advance n ticks (stops early when the end condition is met). Returns ticks run. */
  tick(n = 1) {
    let ran = 0;
    while (ran < n && !this.finished) {
      this.tickCount++;
      ran++;
      this.checkEnd();
    }
    return ran;
  }

  checkEnd() {
    const p = this.params;
    if (p.endCondition === 'ticks' && this.tickCount >= p.endTicks) this.end(`Reached year ${p.endTicks}`);
  }

  end(reason) {
    this.finished = true;
    this.endReason = reason;
  }

  stats() {
    return {
      tick: this.tickCount,
      totalPop: 0,
      civs: [],
      terrainCounts: this.terrainCounts.slice(),
      finished: this.finished,
      endReason: this.endReason,
    };
  }

  /** Plain description of hex (col, row), or null if it is off the map. */
  inspect(col, row) {
    return describeHex(this.map, col, row);
  }

  /** Map hash: depends only on the map parameters. */
  mapHash() {
    return hashMap(this.map);
  }

  /** Whole-state hash: the map, food stocks and the year. */
  hash() {
    const m = this.map;
    return fnv([m.terrain, m.lake, m.river, m.riverTo, m.food, new Uint32Array([this.tickCount])]);
  }

  get mapParams() { return mapParams(this.params); }
}

export function describeHex(map, col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) return null;
  const i = row * map.cols + col;
  const t = map.terrain[i];
  const water = t === DEEP_WATER;
  const { q, r } = indexToAxial(i, map.cols);
  return {
    index: i,
    col,
    row,
    q,
    r,
    terrain: TERRAIN_IDS[t],
    name: water && map.lake[i] ? 'Lake' : TERRAIN_NAMES[t],
    water,
    lake: map.lake[i] === 1,
    river: map.river[i] === 1,
    food: map.food[i],
    foodCap: map.foodCap[i],
    materials: MATERIALS[t],
    moveCost: water ? null : MOVE_COST[t],
    defence: DEFENCE_BONUS[t],
  };
}
