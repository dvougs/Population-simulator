// Seeded hex map generation. The map depends only on the map parameters
// (MAP_KEYS in params.js), so the preview and the game agree.
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
import {
  MATERIAL_COUNT, DEPOSIT_CHANCE, RIVER_DEPOSIT_CHANCE, EXOTIC, EXOTIC_REROLL_LIMIT,
} from './materials.js';

/** Shares of land and lowland used by the generator (also in RULES.md). */
export const GEN = Object.freeze({
  hillsShare: 0.15, // of land, next below the mountains on the mountain score
  // Islands land shape: a grid of islandGrid(size) × islandGrid(size) island centres, each
  // moved up to islandJitter of a cell, raising land within islandRadius cells of it.
  islandJitter: 0.3,
  islandRadius: 0.55,
  islandNoise: 0.4, // noise share of elevation (0.6 for one continent)
});

/** Island centres across (and down) an islands map of this size. */
export const islandGrid = (size) => 2 + Math.floor(size / 15);

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
    /** Elevation from step 1 of generation, kept for drawing (shading by height and depth). */
    elevation: new Float32Array(count),
    foodCap: new Float32Array(count),
    food: new Float32Array(count),
    /** Material deposits per hex: bit m set when the hex holds material m (see materials.js). */
    deposits: new Uint16Array(count),
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
  // Forked after the others, so adding deposits left every earlier stream (and the terrain) unchanged.
  const depositRng = rng.fork('deposits');
  const rerollRng = rng.fork('depositReroll');
  const islandRng = rng.fork('islands');

  // Sample the noise at each hex centre, scaled so the map spans [0, 1] both ways.
  const b = mapBounds(n, n, 1);
  const elev = new Float64Array(count);
  const ridge = new Float64Array(count);
  const temp = new Float64Array(count);
  const moist = new Float64Array(count);
  const edge = new Uint8Array(count);
  const islands = p.landShape === 'islands' ? islandCentres(islandRng, n) : null;
  for (let i = 0; i < count; i++) {
    const col = i % n;
    const row = (i - col) / n;
    const { q, r } = offsetToAxial(col, row);
    const c = hexToPixel(q, r, 1);
    const u = (c.x - b.minX) / (b.maxX - b.minX);
    const v = (c.y - b.minY) / (b.maxY - b.minY);
    const nx = 2 * u - 1;
    const ny = 2 * v - 1;
    // Falloff towards the edges makes one landmass with coasts rather than land cut off by the frame;
    // with islands, land rises around each island centre instead.
    elev[i] = islands
      ? GEN.islandNoise * elevNoise(u, v) + (1 - GEN.islandNoise) * islandHeight(islands, u, v)
      : 0.6 * elevNoise(u, v) + 0.4 * (1 - (nx * nx + ny * ny) / 2);
    ridge[i] = 1 - Math.abs(2 * ridgeNoise(u, v) - 1);
    const latitude = 1 - Math.abs(2 * v - 1); // 1 at the middle row, 0 at the top and bottom
    temp[i] = 0.7 * latitude + 0.3 * tempNoise(u, v) - 0.2 * elev[i];
    moist[i] = moistNoise(u, v);
    edge[i] = col === 0 || row === 0 || col === n - 1 || row === n - 1 ? 1 : 0;
  }

  // Water counts against the whole map: the edge ring is always water, and only
  // what is left of the total comes from the lowest inner hexes.
  const inner = [];
  for (let i = 0; i < count; i++) {
    if (edge[i]) terrain[i] = DEEP_WATER;
    else inner.push(i);
  }
  inner.sort(byValueAsc(elev));
  const waterCount = Math.max(0, Math.round(p.water * count) - (count - inner.length));
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
  // The four lowland settings are relative weights. Work in whole percents so
  // e.g. 40 + 30 + 15 + 15 sums to exactly 100 (fractions would not).
  const w = (k) => Math.round(p[k] * 100);
  const weightSum = w('plains') + w('forest') + w('desert') + w('tundra');
  const share = (k) => (weightSum > 0 ? Math.round((w(k) * lowland) / weightSum) : 0);
  rest = takeTop(rest, temp, share('tundra'), false, TUNDRA);
  const dryness = new Float64Array(count);
  for (const i of rest) dryness[i] = 1 - moist[i] + 0.3 * temp[i];
  rest = takeTop(rest, dryness, share('desert'), true, DESERT);
  takeTop(rest, moist, share('forest'), true, FOREST);

  traceRivers(map, elev, p.rivers, riverRng);
  map.elevation.set(elev);

  for (let i = 0; i < count; i++) {
    map.foodCap[i] = FOOD_CAPACITY[terrain[i]] + (map.river[i] ? RIVER_FOOD_BONUS : 0);
    map.food[i] = map.foodCap[i];
  }
  rollDeposits(map, depositRng, rerollRng);
  map.params = p;
  return map;
}

/** One roll of material m in hex i: its terrain's chance, and for a river hex the river chance too. */
function rollOne(map, i, m, rng) {
  const t = DEPOSIT_CHANCE[m][map.terrain[i]];
  let hit = t > 0 && rng.next() < t;
  const r = map.river[i] ? RIVER_DEPOSIT_CHANCE[m] : 0;
  if (r > 0 && rng.next() < r) hit = true;
  return hit;
}

/**
 * Every land hex rolls for every material (index order, then material order).
 * Then each exotic material the map lacks is rolled again over the whole land
 * (its own stream) until at least one hex holds it. After EXOTIC_REROLL_LIMIT
 * rounds it goes to the hex with the best chance (lowest index on ties); a map
 * with no land that can hold it at all goes without.
 */
function rollDeposits(map, rng, rerollRng) {
  const { count, terrain, deposits } = map;
  for (let i = 0; i < count; i++) {
    if (terrain[i] === DEEP_WATER) continue;
    for (let m = 0; m < MATERIAL_COUNT; m++) if (rollOne(map, i, m, rng)) deposits[i] |= 1 << m;
  }
  for (const m of EXOTIC) {
    let found = false;
    let best = -1;
    let bestChance = 0;
    for (let i = 0; i < count; i++) {
      if (terrain[i] === DEEP_WATER) continue;
      if (deposits[i] & (1 << m)) found = true;
      const c = Math.max(DEPOSIT_CHANCE[m][terrain[i]], map.river[i] ? RIVER_DEPOSIT_CHANCE[m] : 0);
      if (c > bestChance) { bestChance = c; best = i; }
    }
    if (found || best < 0) continue;
    for (let round = 0; round < EXOTIC_REROLL_LIMIT && !found; round++) {
      for (let i = 0; i < count; i++) {
        if (terrain[i] !== DEEP_WATER && rollOne(map, i, m, rerollRng)) { deposits[i] |= 1 << m; found = true; }
      }
    }
    if (!found) deposits[best] |= 1 << m;
  }
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
/** Island centres in the unit square, a jittered grid; r2 is the squared radius of each island's rise. */
function islandCentres(rng, size) {
  const g = islandGrid(size);
  const xs = [];
  const ys = [];
  for (let gy = 0; gy < g; gy++) {
    for (let gx = 0; gx < g; gx++) {
      xs.push((gx + 0.5 + GEN.islandJitter * (2 * rng.next() - 1)) / g);
      ys.push((gy + 0.5 + GEN.islandJitter * (2 * rng.next() - 1)) / g);
    }
  }
  const r = GEN.islandRadius / g;
  return { xs, ys, r2: r * r };
}

/** 1 at an island centre, falling to 0 at its radius (the highest of all islands). */
function islandHeight({ xs, ys, r2 }, u, v) {
  let best = 0;
  for (let k = 0; k < xs.length; k++) {
    const dx = u - xs[k];
    const dy = v - ys[k];
    const hgt = 1 - (dx * dx + dy * dy) / r2;
    if (hgt > best) best = hgt;
  }
  return best;
}

export function countTerrain(map) {
  const counts = new Array(TERRAIN_COUNT).fill(0);
  for (let i = 0; i < map.count; i++) counts[map.terrain[i]]++;
  return counts;
}

/** FNV-1a over everything that defines the map. Equal hashes mean equal maps. */
export function hashMap(map) {
  return fnv([map.terrain, map.lake, map.river, map.riverTo, map.deposits]);
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
