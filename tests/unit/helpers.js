// Shared builders for the Phase 2 tests (not a test file: the glob only runs *.test.js).
import { createMap } from '../../src/sim/mapgen.js';
import { FOOD_CAPACITY, DEEP_WATER } from '../../src/sim/terrain.js';

/** A cols × rows map; terrainFn(index) gives each hex's terrain id. Food starts full. */
export function makeMap(cols, rows, terrainFn) {
  const map = createMap(cols, rows);
  for (let i = 0; i < map.count; i++) {
    const t = terrainFn(i);
    map.terrain[i] = t;
    map.foodCap[i] = FOOD_CAPACITY[t];
    map.food[i] = map.foodCap[i];
  }
  return map;
}

export const allWater = () => DEEP_WATER;

/** Scratch arrays sized for a map and a people pool, as the Simulation allocates them. */
export function scratch(map, people) {
  return {
    pop: new Int32Array(map.count),
    seen: new Int32Array(map.count),
    picked: new Int32Array(map.count),
    spare: new Float64Array(map.count),
    parents: new Int32Array(people.capacity),
    dest: new Int32Array(people.capacity),
  };
}

/** Counts of alive people per hex. */
export function hexCounts(people, n) {
  const c = new Int32Array(n);
  for (let i = 0; i < people.high; i++) if (people.alive[i]) c[people.hex[i]]++;
  return c;
}
