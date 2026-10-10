import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, hashMap, countTerrain, createMap, GEN } from '../../src/sim/mapgen.js';
import { presetParams, PRESETS, normalizeParams } from '../../src/sim/params.js';
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
    assert.deepEqual(map.params, { seed: p.seed, size: p.size, water: p.water, mountains: p.mountains, rivers: p.rivers });
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
  for (const change of [{ size: 21 }, { water: 0.31 }, { mountains: 0.2 }, { rivers: 1 }]) {
    assert.notEqual(hashMap(generateMap({ ...base, ...change })), h, JSON.stringify(change));
  }
});

test('the map depends only on the five map settings', () => {
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

test('water = every edge hex + round(water × inner hexes)', () => {
  for (const { p, map } of maps) {
    const n = p.size;
    const inner = (n - 2) * (n - 2);
    const expected = 4 * n - 4 + Math.round(p.water * inner);
    assert.equal(countTerrain(map)[DEEP_WATER], expected, `${p.seed} water ${p.water}`);
  }
  // Boundaries: 0% leaves only the ocean ring; 70% is the most.
  const dry = generateMap({ seed: 'b', size: 10, water: 0 });
  assert.equal(countTerrain(dry)[DEEP_WATER], 36);
  const wet = generateMap({ seed: 'b', size: 10, water: 0.7 });
  assert.equal(countTerrain(wet)[DEEP_WATER], 36 + Math.round(0.7 * 64));
});

test('mountains = round(mountains × land); hills = round(15% × land)', () => {
  assert.equal(GEN.hillsShare, 0.15);
  for (const { p, map } of maps) {
    const n = p.size;
    const land = (n - 2) * (n - 2) - Math.round(p.water * (n - 2) * (n - 2));
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

test('climate split: tundra 15%, desert 15%, forest 30% of inland lowland, rest plains', () => {
  assert.equal(GEN.tundraShare, 0.15);
  assert.equal(GEN.desertShare, 0.15);
  assert.equal(GEN.forestShare, 0.3);
  for (const { p, map } of maps) {
    const c = countTerrain(map);
    const lowland = c[PLAINS] + c[FOREST] + c[DESERT] + c[TUNDRA];
    const tundra = Math.round(0.15 * lowland);
    const desert = Math.round(0.15 * lowland);
    const forest = Math.round(0.3 * lowland);
    assert.equal(c[TUNDRA], tundra, `${p.seed} tundra`);
    assert.equal(c[DESERT], desert, `${p.seed} desert`);
    assert.equal(c[FOREST], forest, `${p.seed} forest`);
    assert.equal(c[PLAINS], lowland - tundra - desert - forest, `${p.seed} plains`);
  }
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
