// Seeded hex map generation. The map depends only on the map parameters
// (seed, size, water, mountains, rivers), so the preview and the game agree.
//
// Shares are hit by ranking hexes on noise values (ties broken by index), not
// by thresholds, so each setting gives an exact, reproducible count.

import { Rng } from './rng.js';
import { makeNoise } from './noise.js';
import { buildNeighbourTable, hexToPixel, offsetToAxial, mapBounds } from './hex.js';
import { mapParams } from './params.js';
import {
  DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT,
  FOOD_CAPACITY, RIVER_FOOD_BONUS,
} from './terrain.js';

/** Shares of land and lowland used by the generator (also in RULES.md). */
export const GEN = Object.freeze({
  hillsShare: 0.15, // of land, next below the mountains on the mountain score
  tundraShare: 0.15, // of inland lowland, coldest
  desertShare: 0.15, // of inland lowland, hottest and driest
  forestShare: 0.3, // of inland lowland, wettest
});

export function createMap(cols, rows) {
  const count = cols * rows;
  return {
    cols,
    rows,
    count,
    terrain: new Uint8Array(count),
    /** 1 for water not connected to the map edge. */
    lake: new Uint8Array(count),
    /** 1 where a river runs through the hex. */
    river: new Uint8Array(count),
    /** Hex the river flows into next, or -1. */
    riverTo: new Int32Array(count).fill(-1),
    foodCap: new Float32Array(count),
    food: new Float32Array(count),
    neighbours: buildNeighbourTable(cols, rows),
  };
}

const byValueAsc = (values) => (a, b) => values[a] - values[b] || a - b;
const byValueDesc = (values) => (a, b) => values[b] - values[a] || a - b;

export function generateMap(input) {
  const p = mapParams(input);
  const n = p.size;
  const map = createMap(n, n);
  const { count, terrain, neighbours } = map;
  const rng = new Rng(p.seed).fork('map');
  const elevNoise = makeNoise(rng.fork('elevation'), 2 + Math.floor(n / 12), 4);
  const ridgeNoise = makeNoise(rng.fork('ridges'), 2 + Math.floor(n / 8), 2);
  const tempNoise = makeNoise(rng.fork('temperature'), 2, 2);
  const moistNoise = makeNoise(rng.fork('moisture'), 2 + Math.floor(n / 10), 3);
  const riverRng = rng.fork('rivers');

  // Sample the noise at each hex centre, scaled so the map spans [0, 1] both ways.
  const b = mapBounds(n, n, 1);
  const elev = new Float64Array(count);
  const ridge = new Float64Array(count);
  const temp = new Float64Array(count);
  const moist = new Float64Array(count);
  const edge = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const col = i % n;
    const row = (i - col) / n;
    const { q, r } = offsetToAxial(col, row);
    const c = hexToPixel(q, r, 1);
    const u = (c.x - b.minX) / (b.maxX - b.minX);
    const v = (c.y - b.minY) / (b.maxY - b.minY);
    const nx = 2 * u - 1;
    const ny = 2 * v - 1;
    // Falloff towards the edges makes one landmass with coasts rather than land cut off by the frame.
    elev[i] = 0.6 * elevNoise(u, v) + 0.4 * (1 - (nx * nx + ny * ny) / 2);
    ridge[i] = 1 - Math.abs(2 * ridgeNoise(u, v) - 1);
    const latitude = 1 - Math.abs(2 * v - 1); // 1 at the middle row, 0 at the top and bottom
    temp[i] = 0.7 * latitude + 0.3 * tempNoise(u, v) - 0.2 * elev[i];
    moist[i] = moistNoise(u, v);
    edge[i] = col === 0 || row === 0 || col === n - 1 || row === n - 1 ? 1 : 0;
  }

  // Water: every edge hex, plus the lowest share of the inner hexes.
  const inner = [];
  for (let i = 0; i < count; i++) {
    if (edge[i]) terrain[i] = DEEP_WATER;
    else inner.push(i);
  }
  inner.sort(byValueAsc(elev));
  const waterCount = Math.round(p.water * inner.length);
  const land = [];
  for (let k = 0; k < inner.length; k++) {
    if (k < waterCount) terrain[inner[k]] = DEEP_WATER;
    else { terrain[inner[k]] = PLAINS; land.push(inner[k]); }
  }
  land.sort((a, c) => a - c);

  // Sea is water connected to the edge; any other water is a lake.
  const sea = new Uint8Array(count);
  const stack = [];
  for (let i = 0; i < count; i++) if (edge[i]) { sea[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (let k = 0; k < 6; k++) {
      const j = neighbours[i * 6 + k];
      if (j >= 0 && !sea[j] && terrain[j] === DEEP_WATER) { sea[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < count; i++) map.lake[i] = terrain[i] === DEEP_WATER && !sea[i] ? 1 : 0;

  // Mountains and hills: highest on a ridged score, so they form ranges along high ground.
  const score = new Float64Array(count);
  for (const i of land) score[i] = 0.6 * ridge[i] + 0.4 * elev[i];
  const byScore = land.slice().sort(byValueDesc(score));
  const mountainCount = Math.round(p.mountains * land.length);
  const hillsCount = Math.round(GEN.hillsShare * land.length);
  for (let k = 0; k < byScore.length; k++) {
    if (k < mountainCount) terrain[byScore[k]] = MOUNTAIN;
    else if (k < mountainCount + hillsCount) terrain[byScore[k]] = HILLS;
  }

  // Lowland next to the sea is coast; the rest is split by climate.
  let rest = [];
  for (const i of land) {
    if (terrain[i] !== PLAINS) continue;
    let bySea = false;
    for (let k = 0; k < 6; k++) {
      const j = neighbours[i * 6 + k];
      if (j >= 0 && sea[j]) bySea = true;
    }
    if (bySea) terrain[i] = COAST;
    else rest.push(i);
  }
  const lowland = rest.length;
  const takeTop = (list, values, howMany, desc, t) => {
    const sorted = list.slice().sort(desc ? byValueDesc(values) : byValueAsc(values));
    for (let k = 0; k < howMany && k < sorted.length; k++) terrain[sorted[k]] = t;
    return sorted.slice(howMany).sort((a, c) => a - c);
  };
  rest = takeTop(rest, temp, Math.round(GEN.tundraShare * lowland), false, TUNDRA);
  const dryness = new Float64Array(count);
  for (const i of rest) dryness[i] = 1 - moist[i] + 0.3 * temp[i];
  rest = takeTop(rest, dryness, Math.round(GEN.desertShare * lowland), true, DESERT);
  takeTop(rest, moist, Math.round(GEN.forestShare * lowland), true, FOREST);

  traceRivers(map, elev, p.rivers, riverRng);

  for (let i = 0; i < count; i++) {
    map.foodCap[i] = FOOD_CAPACITY[terrain[i]] + (map.river[i] ? RIVER_FOOD_BONUS : 0);
    map.food[i] = map.foodCap[i];
  }
  map.params = p;
  return map;
}

/**
 * Rivers start in hills or mountains and step to the lowest neighbour until
 * they reach water or join another river. Depressions are filled first
 * (priority flood from all water), so every land hex has a downhill path to water.
 */
function traceRivers(map, elev, wanted, rng) {
  const { count, terrain, neighbours, river, riverTo } = map;
  const level = fillDepressions(map, elev);

  const nearWaterOrRiver = (i) => {
    for (let k = 0; k < 6; k++) {
      const j = neighbours[i * 6 + k];
      if (j >= 0 && (terrain[j] === DEEP_WATER || river[j])) return true;
    }
    return false;
  };

  for (let made = 0; made < wanted; made++) {
    const candidates = [];
    for (let i = 0; i < count; i++) {
      if ((terrain[i] === HILLS || terrain[i] === MOUNTAIN) && !river[i] && !nearWaterOrRiver(i)) candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < count; i++) {
        if (terrain[i] !== DEEP_WATER && terrain[i] !== COAST && !river[i] && !nearWaterOrRiver(i)) candidates.push(i);
      }
    }
    if (candidates.length === 0) return; // no room for more rivers
    // Sources come from the higher half of the candidates, so rivers are long enough to see.
    candidates.sort(byValueDesc(elev));
    let cur = candidates[rng.int(Math.ceil(candidates.length / 2))];
    for (let steps = 0; steps < count; steps++) {
      river[cur] = 1;
      let next = -1;
      for (let k = 0; k < 6; k++) {
        const j = neighbours[cur * 6 + k];
        if (j >= 0 && (next < 0 || level[j] < level[next] || (level[j] === level[next] && j < next))) next = j;
      }
      riverTo[cur] = next;
      if (terrain[next] === DEEP_WATER || river[next]) break;
      cur = next;
    }
  }
}

/** Water sits at level -1; each land hex's level is at least its elevation and above the hex it drains into. */
function fillDepressions(map, elev) {
  const { count, terrain, neighbours } = map;
  const level = new Float64Array(count);
  const done = new Uint8Array(count);
  const heap = new MinHeap(count, level);
  for (let i = 0; i < count; i++) {
    if (terrain[i] === DEEP_WATER) { level[i] = -1; done[i] = 1; heap.push(i); }
  }
  while (heap.size > 0) {
    const i = heap.pop();
    for (let k = 0; k < 6; k++) {
      const j = neighbours[i * 6 + k];
      if (j < 0 || done[j]) continue;
      done[j] = 1;
      level[j] = Math.max(elev[j], level[i] + 1e-6);
      heap.push(j);
    }
  }
  return level;
}

/** Binary min-heap of hex indices ordered by (key, index). */
class MinHeap {
  constructor(capacity, keys) {
    this.items = new Int32Array(capacity);
    this.size = 0;
    this.keys = keys;
  }

  less(a, b) {
    const ka = this.keys[a];
    const kb = this.keys[b];
    return ka < kb || (ka === kb && a < b);
  }

  push(v) {
    const it = this.items;
    let k = this.size++;
    it[k] = v;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!this.less(it[k], it[parent])) break;
      [it[k], it[parent]] = [it[parent], it[k]];
      k = parent;
    }
  }

  pop() {
    const it = this.items;
    const top = it[0];
    it[0] = it[--this.size];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < this.size && this.less(it[l], it[m])) m = l;
      if (r < this.size && this.less(it[r], it[m])) m = r;
      if (m === k) break;
      [it[k], it[m]] = [it[m], it[k]];
      k = m;
    }
    return top;
  }
}

/** Number of hexes of each terrain, indexed by terrain id. */
export function countTerrain(map) {
  const counts = new Array(TERRAIN_COUNT).fill(0);
  for (let i = 0; i < map.count; i++) counts[map.terrain[i]]++;
  return counts;
}

/** FNV-1a over everything that defines the map. Equal hashes mean equal maps. */
export function hashMap(map) {
  return fnv([map.terrain, map.lake, map.river, map.riverTo]);
}

export function fnv(arrays, h = 0x811c9dc5) {
  for (const arr of arrays) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
