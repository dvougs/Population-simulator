import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, hashMap, countTerrain, createMap, GEN } from '../../src/sim/mapgen.js';
import { presetParams, PRESETS, normalizeParams, MAP_KEYS, LOWLAND_KEYS } from '../../src/sim/params.js';
import {
  DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT,
  FOOD_CAPACITY, RIVER_FOOD_BONUS,
} from '../../src/sim/terrain.js';

// A spread of settings: defaults, every preset and some boundary values.
const CASES = [
  { seed: 'pangaea' },
  ...Object.keys(PRESETS).map((k) => presetParams(k)),
  { seed: 'dry', size: 10, water: 0, mountains: 0, rivers: 0 },
  { seed: 'wet', size: 17, water: 0.7, mountains: 0.4, rivers: 20 },
  { seed: 'mid', size: 23, water: 0.45, mountains: 0.2, rivers: 8 },
  // Lowland weights: uneven, all zero, one only, cold-heavy (rounding can ask for more than is left).
  { seed: 'woods', size: 25, water: 0.3, plains: 0.1, forest: 0.9, desert: 0.05, tundra: 0 },
  { seed: 'bare', size: 18, water: 0.2, plains: 0, forest: 0, desert: 0, tundra: 0 },
  { seed: 'sand', size: 21, water: 0.4, plains: 0, forest: 0, desert: 1, tundra: 0 },
  { seed: 'cold', size: 14, water: 0.37, plains: 0, forest: 0.33, desert: 0.33, tundra: 0.34 },
  { seed: 'odd', size: 37, water: 0.55, plains: 0.07, forest: 0.13, desert: 0.29, tundra: 0.71 },
];
const maps = CASES.map((p) => ({ p: normalizeParams(p), map: generateMap(p) }));

const isEdge = (i, n) => {
  const col = i % n, row = Math.floor(i / n);
  return col === 0 || row === 0 || col === n - 1 || row === n - 1;
};

function seaMask(map) {
  const n = map.cols;
  const sea = new Uint8Array(map.count);
  const stack = [];
  for (let i = 0; i < map.count; i++) if (isEdge(i, n)) { sea[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (let k = 0; k < 6; k++) {
      const j = map.neighbours[i * 6 + k];
      if (j >= 0 && !sea[j] && map.terrain[j] === DEEP_WATER) { sea[j] = 1; stack.push(j); }
    }
  }
  return sea;
}

const nbrs = (map, i) => {
  const out = [];
  for (let k = 0; k < 6; k++) { const j = map.neighbours[i * 6 + k]; if (j >= 0) out.push(j); }
  return out;
};

test('createMap allocates typed arrays of size × size', () => {
  const m = createMap(12, 12);
  assert.equal(m.count, 144);
  for (const key of ['terrain', 'lake', 'river', 'riverTo', 'foodCap', 'food']) assert.equal(m[key].length, 144);
  assert.equal(m.neighbours.length, 144 * 6);
  assert.ok(m.riverTo.every((v) => v === -1));
});

test('map is size × size and keeps its normalised map params', () => {
  for (const { p, map } of maps) {
    assert.equal(map.cols, p.size);
    assert.equal(map.rows, p.size);
    assert.equal(map.count, p.size * p.size);
    const expected = {};
    for (const k of MAP_KEYS) expected[k] = p[k];
    assert.deepEqual(map.params, expected);
    for (let i = 0; i < map.count; i++) assert.ok(map.terrain[i] < TERRAIN_COUNT);
  }
});

test('same settings give the same map (same hash); different seed gives a different map', () => {
  for (const { p, map } of maps) {
    const again = generateMap(p);
    assert.equal(hashMap(again), hashMap(map), p.seed);
    assert.deepEqual(again.terrain, map.terrain);
    assert.deepEqual(again.foodCap, map.foodCap);
  }
  const a = generateMap({ seed: 'alpha', size: 20 });
  const b = generateMap({ seed: 'beta', size: 20 });
  assert.notEqual(hashMap(a), hashMap(b));
  assert.notDeepEqual(a.terrain, b.terrain);
  // Each map setting matters.
  const base = { seed: 'vary', size: 20, water: 0.3, mountains: 0.12, rivers: 4 };
  const h = hashMap(generateMap(base));
  for (const change of [
    { size: 21 }, { water: 0.31 }, { mountains: 0.2 }, { rivers: 1 },
    { plains: 0.6 }, { forest: 0.5 }, { desert: 0.3 }, { tundra: 0.3 },
  ]) {
    assert.notEqual(hashMap(generateMap({ ...base, ...change })), h, JSON.stringify(change));
  }
});

test('the map depends only on the nine map settings', () => {
  assert.deepEqual(MAP_KEYS, ['seed', 'size', 'water', 'mountains', 'rivers', 'plains', 'forest', 'desert', 'tundra']);
  const a = generateMap({ seed: 'only', size: 15, endCondition: 'ticks', endTicks: 20 });
  const b = generateMap({ seed: 'only', size: 15 });
  assert.equal(hashMap(a), hashMap(b));
});

test('every edge hex is ocean (deep water, not lake)', () => {
  for (const { p, map } of maps) {
    for (let i = 0; i < map.count; i++) {
      if (!isEdge(i, p.size)) continue;
      assert.equal(map.terrain[i], DEEP_WATER, `${p.seed}: edge hex ${i}`);
      assert.equal(map.lake[i], 0);
    }
  }
});

// RULES.md "Water": total deep water = round(water × size²), never less than the edge ring.
const ring = (n) => 4 * n - 4;
const waterTotal = (n, w) => Math.max(ring(n), Math.round(w * n * n));

test('water = max(edge ring, round(water × size²)), edge ring always sea', () => {
  for (const { p, map } of maps) {
    assert.equal(countTerrain(map)[DEEP_WATER], waterTotal(p.size, p.water), `${p.seed} water ${p.water}`);
  }
  for (const n of [10, 11, 16, 25, 34, 50]) {
    for (const w of [0, 0.05, 0.12, 0.25, 0.33, 0.36, 0.37, 0.5, 0.69, 0.7]) {
      const map = generateMap({ seed: `w${n}`, size: n, water: w, rivers: 0 });
      assert.equal(countTerrain(map)[DEEP_WATER], waterTotal(n, w), `size ${n} water ${w}`);
      for (let i = 0; i < map.count; i++) if (isEdge(i, n)) assert.equal(map.terrain[i], DEEP_WATER);
    }
  }
});

test('a water share at or below the edge ring gives exactly the ring', () => {
  // 10 × 10: the ring is 36 hexes, so up to 36% (and the 25% default) gives only the ring.
  for (const w of [0, 0.01, 0.25, 0.35, 0.36]) {
    assert.equal(countTerrain(generateMap({ seed: 'b', size: 10, water: w }))[DEEP_WATER], 36, `water ${w}`);
  }
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 10 }))[DEEP_WATER], 36, 'default');
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 10, water: 0.37 }))[DEEP_WATER], 37);
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 10, water: 0.7 }))[DEEP_WATER], 70);
  // 50 × 50: the ring is 196 of 2500 hexes (7.84%).
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 50, water: 0.07 }))[DEEP_WATER], 196);
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 50, water: 0.08 }))[DEEP_WATER], 200);
  assert.equal(countTerrain(generateMap({ seed: 'b', size: 50, water: 0.7 }))[DEEP_WATER], 1750);
});

test('mountains = round(mountains × land); hills = round(15% × land)', () => {
  assert.equal(GEN.hillsShare, 0.15);
  for (const { p, map } of maps) {
    const n = p.size;
    const land = n * n - waterTotal(n, p.water);
    const c = countTerrain(map);
    assert.equal(c[MOUNTAIN], Math.round(p.mountains * land), `${p.seed} mountains`);
    assert.equal(c[HILLS], Math.round(0.15 * land), `${p.seed} hills`);
  }
  const none = generateMap({ seed: 'flat', mountains: 0 });
  assert.equal(countTerrain(none)[MOUNTAIN], 0);
});

test('mountains form ranges: most mountain hexes touch another mountain or hills', () => {
  const map = generateMap(presetParams('highlands'));
  let mountains = 0, grouped = 0;
  for (let i = 0; i < map.count; i++) {
    if (map.terrain[i] !== MOUNTAIN) continue;
    mountains++;
    if (nbrs(map, i).some((j) => map.terrain[j] === MOUNTAIN || map.terrain[j] === HILLS)) grouped++;
  }
  assert.ok(mountains > 0 && grouped / mountains > 0.8, `${grouped}/${mountains}`);
});

test('lake = water not connected to the edge; sea = water connected to it', () => {
  let lakes = 0;
  for (const { p, map } of maps) {
    const sea = seaMask(map);
    for (let i = 0; i < map.count; i++) {
      const expectLake = map.terrain[i] === DEEP_WATER && !sea[i] ? 1 : 0;
      assert.equal(map.lake[i], expectLake, `${p.seed} hex ${i}`);
      lakes += expectLake;
    }
  }
  // Make sure the lake rule was actually exercised.
  for (let k = 0; lakes === 0 && k < 30; k++) {
    const map = generateMap({ seed: `lake${k}`, size: 30, water: 0.4 });
    for (let i = 0; i < map.count; i++) lakes += map.lake[i];
  }
  assert.ok(lakes > 0, 'some seed makes a lake');
});

test('coast = land other than hills/mountains next to the sea; not next to a lake only', () => {
  for (const { p, map } of maps) {
    const sea = seaMask(map);
    for (let i = 0; i < map.count; i++) {
      const t = map.terrain[i];
      if (t === DEEP_WATER || t === HILLS || t === MOUNTAIN) continue;
      const bySea = nbrs(map, i).some((j) => sea[j]);
      assert.equal(t === COAST, bySea, `${p.seed} hex ${i} terrain ${t}`);
    }
  }
});

// RULES.md "Climate": with L lowland hexes and S the sum of the four weights in whole
// percents, tundra, desert and forest each get round(weight × L ÷ S) in that order (capped
// at what is left); plains get the rest; all four at 0 gives all plains.
function lowlandSplit(p, L) {
  const pc = (k) => Math.round(p[k] * 100);
  const S = LOWLAND_KEYS.reduce((a, k) => a + pc(k), 0);
  const want = (k) => (S > 0 ? Math.round((pc(k) * L) / S) : 0);
  const tundra = Math.min(want('tundra'), L);
  const desert = Math.min(want('desert'), L - tundra);
  const forest = Math.min(want('forest'), L - tundra - desert);
  return { tundra, desert, forest, plains: L - tundra - desert - forest };
}

test('climate split: tundra, desert, forest = round(weight × L ÷ S) of inland lowland, rest plains', () => {
  for (const { p, map } of maps) {
    const c = countTerrain(map);
    const L = c[PLAINS] + c[FOREST] + c[DESERT] + c[TUNDRA];
    assert.ok(L > 0, `${p.seed} has lowland`);
    const e = lowlandSplit(p, L);
    assert.equal(c[TUNDRA], e.tundra, `${p.seed} tundra`);
    assert.equal(c[DESERT], e.desert, `${p.seed} desert`);
    assert.equal(c[FOREST], e.forest, `${p.seed} forest`);
    assert.equal(c[PLAINS], e.plains, `${p.seed} plains`);
  }
});

test('climate split holds over many seeds, sizes and weights', () => {
  const weights = [
    [0.4, 0.3, 0.15, 0.15], [1, 1, 1, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0.01, 0, 0, 0],
    [0, 0.01, 0.01, 0.01], [0.2, 0.5, 0.3, 0.3], [0.6, 0.1, 0, 0.3], [0.33, 0.33, 0.33, 0],
  ];
  let k = 0;
  for (const size of [10, 13, 20, 31, 44]) {
    for (const [plains, forest, desert, tundra] of weights) {
      const p = normalizeParams({ seed: `split${k++}`, size, water: 0.3, rivers: 0, plains, forest, desert, tundra });
      const c = countTerrain(generateMap(p));
      const L = c[PLAINS] + c[FOREST] + c[DESERT] + c[TUNDRA];
      const e = lowlandSplit(p, L);
      assert.deepEqual(
        [c[TUNDRA], c[DESERT], c[FOREST], c[PLAINS]], [e.tundra, e.desert, e.forest, e.plains],
        `size ${size} weights ${[plains, forest, desert, tundra]} L ${L}`,
      );
    }
  }
});

test('default weights give 40% plains, 30% forest, 15% desert, 15% tundra', () => {
  const c = countTerrain(generateMap({ seed: 'defaults', size: 40, water: 0.3 }));
  const L = c[PLAINS] + c[FOREST] + c[DESERT] + c[TUNDRA];
  assert.equal(c[TUNDRA], Math.round(0.15 * L));
  assert.equal(c[DESERT], Math.round(0.15 * L));
  assert.equal(c[FOREST], Math.round(0.3 * L));
  assert.equal(c[PLAINS], L - c[TUNDRA] - c[DESERT] - c[FOREST]);
});

test('all four lowland weights at 0% give all plains', () => {
  for (const size of [10, 25, 50]) {
    const c = countTerrain(generateMap({ seed: 'zero', size, plains: 0, forest: 0, desert: 0, tundra: 0 }));
    assert.ok(c[PLAINS] > 0, `size ${size}`);
    assert.equal(c[FOREST] + c[DESERT] + c[TUNDRA], 0, `size ${size}`);
  }
});

test('lowland weights scale together: doubling all four gives the same map', () => {
  const a = generateMap({ seed: 'scale', size: 22, plains: 0.2, forest: 0.15, desert: 0.1, tundra: 0.05 });
  const b = generateMap({ seed: 'scale', size: 22, plains: 0.4, forest: 0.3, desert: 0.2, tundra: 0.1 });
  assert.deepEqual(a.terrain, b.terrain);
});

test('tundra lies towards the top and bottom rows (cold), on average', () => {
  const map = generateMap(presetParams('large'));
  const n = map.cols;
  let tSum = 0, tN = 0, oSum = 0, oN = 0;
  for (let i = 0; i < map.count; i++) {
    const t = map.terrain[i];
    const lat = 1 - Math.abs(2 * Math.floor(i / n) / (n - 1) - 1);
    if (t === TUNDRA) { tSum += lat; tN++; } else if (t === PLAINS || t === FOREST) { oSum += lat; oN++; }
  }
  assert.ok(tN > 0 && tSum / tN < oSum / oN, `tundra latitude ${tSum / tN} vs ${oSum / oN}`);
});

function riverSources(map) {
  const into = new Uint8Array(map.count);
  for (let i = 0; i < map.count; i++) if (map.river[i] && map.riverTo[i] >= 0) into[map.riverTo[i]] = 1;
  const out = [];
  for (let i = 0; i < map.count; i++) if (map.river[i] && !into[i]) out.push(i);
  return out;
}

test('rivers run on land, step to a neighbour each time, and reach water', () => {
  for (const { p, map } of maps) {
    for (let i = 0; i < map.count; i++) {
      if (!map.river[i]) { assert.equal(map.riverTo[i], -1, `${p.seed}: riverTo on non-river ${i}`); continue; }
      assert.notEqual(map.terrain[i], DEEP_WATER, `${p.seed}: river on water at ${i}`);
      const to = map.riverTo[i];
      assert.ok(nbrs(map, i).includes(to), `${p.seed}: river ${i} → ${to} is not a neighbour`);
      assert.ok(map.terrain[to] === DEEP_WATER || map.river[to], `${p.seed}: river ${i} flows into dry land`);
    }
    for (const s of riverSources(map)) {
      let cur = s;
      let steps = 0;
      while (map.terrain[cur] !== DEEP_WATER) {
        cur = map.riverTo[cur];
        assert.ok(++steps <= map.count, `${p.seed}: river from ${s} loops`);
      }
    }
  }
});

test('river count: 0 gives none; otherwise up to the setting, starting in hills or mountains away from water', () => {
  for (const { p, map } of maps) {
    const sources = riverSources(map);
    const riverHexes = map.river.reduce((a, b) => a + b, 0);
    if (p.rivers === 0) { assert.equal(riverHexes, 0, p.seed); continue; }
    assert.ok(sources.length >= 1 && sources.length <= p.rivers, `${p.seed}: ${sources.length} sources for ${p.rivers}`);
    for (const s of sources) {
      // When no hill or mountain is free, any inland non-coast land hex may start a river.
      assert.ok(map.terrain[s] !== DEEP_WATER && map.terrain[s] !== COAST, `${p.seed}: source ${s} terrain ${map.terrain[s]}`);
      assert.ok(!nbrs(map, s).some((j) => map.terrain[j] === DEEP_WATER), `${p.seed}: source ${s} is next to water`);
    }
  }
});

test('seeded presets: each river starts in hills or mountains; one source per river', () => {
  for (const key of ['default', 'continent', 'archipelago', 'highlands']) {
    const p = presetParams(key);
    const map = generateMap(p);
    const sources = riverSources(map);
    assert.equal(sources.length, p.rivers, key);
    for (const s of sources) assert.ok(map.terrain[s] === HILLS || map.terrain[s] === MOUNTAIN, `${key}: source ${s}`);
  }
});

test('food capacity = terrain value (+30 on a river); every hex starts full', () => {
  for (const { p, map } of maps) {
    for (let i = 0; i < map.count; i++) {
      const expected = FOOD_CAPACITY[map.terrain[i]] + (map.river[i] ? RIVER_FOOD_BONUS : 0);
      assert.equal(map.foodCap[i], expected, `${p.seed} hex ${i}`);
      assert.equal(map.food[i], map.foodCap[i]);
    }
  }
});

test('river hexes keep their terrain (rivers do not change land type)', () => {
  const map = generateMap({ seed: 'rivers', size: 30, rivers: 20 });
  let n = 0;
  for (let i = 0; i < map.count; i++) {
    if (!map.river[i]) continue;
    n++;
    assert.ok([COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA].includes(map.terrain[i]));
  }
  assert.ok(n > 0);
});

test('hashMap is an 8-digit hex string that changes with the map', () => {
  const map = generateMap({ seed: 'h' });
  const h = hashMap(map);
  assert.match(h, /^[0-9a-f]{8}$/);
  map.river[50] ^= 1;
  assert.notEqual(hashMap(map), h);
});

test('countTerrain counts every hex once', () => {
  for (const { map } of maps) {
    const c = countTerrain(map);
    assert.equal(c.length, TERRAIN_COUNT);
    assert.equal(c.reduce((a, b) => a + b, 0), map.count);
  }
});
