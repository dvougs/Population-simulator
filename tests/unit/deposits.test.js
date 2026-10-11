// RULES.md "Material deposits" (T-024, T-036).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MATERIAL_IDS, MATERIAL_NAMES, MATERIAL_TIER, MATERIAL_COUNT, EXOTIC, DEPOSIT_CHANCE, RIVER_DEPOSIT_CHANCE,
  GOLD, GEMSTONES, SPICES, hasDeposit, depositBit, EXOTIC_REROLL_LIMIT,
} from '../../src/sim/materials.js';
import { generateMap, hashMap } from '../../src/sim/mapgen.js';
import { describeHex, Simulation } from '../../src/sim/simulation.js';
import {
  DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA,
} from '../../src/sim/terrain.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
function table(heading) {
  const start = RULES.indexOf(heading);
  assert.ok(start >= 0, heading);
  const lines = RULES.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let k = first + 2; k < lines.length && lines[k].startsWith('|'); k++) rows.push(lines[k].split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}

const TERRAIN_COLUMNS = [COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA];

test('RULES.md "Material deposits": 9 materials with tiers, in the documented order', () => {
  assert.equal(MATERIAL_COUNT, 9);
  assert.deepEqual(MATERIAL_IDS, ['wood', 'stone', 'clay', 'copper', 'iron', 'salt', 'gold', 'gemstones', 'spices']);
  assert.deepEqual(MATERIAL_NAMES, ['Wood', 'Stone', 'Clay', 'Copper', 'Iron', 'Salt', 'Gold', 'Gemstones', 'Spices']);
  assert.deepEqual(MATERIAL_TIER, ['common', 'common', 'common', 'uncommon', 'uncommon', 'uncommon', 'exotic', 'exotic', 'exotic']);
  assert.deepEqual(EXOTIC, [GOLD, GEMSTONES, SPICES]);
  assert.equal(EXOTIC_REROLL_LIMIT, 1000);
  assert.equal(depositBit(8), 256);
});

test('RULES.md "Material deposits": the chance table equals the code, cell by cell (deep water 0)', () => {
  const rows = table('Chance a hex holds a deposit');
  assert.equal(rows.length, 9);
  rows.forEach(([name, tier, ...cells], m) => {
    assert.equal(name, MATERIAL_NAMES[m]);
    assert.equal(tier, MATERIAL_TIER[m]);
    TERRAIN_COLUMNS.forEach((t, k) => assert.equal(Math.round(DEPOSIT_CHANCE[m][t] * 100), Number(cells[k]), `${name} terrain ${t}`));
    assert.equal(Math.round(RIVER_DEPOSIT_CHANCE[m] * 100), Number(cells[7]), `${name} river`);
    assert.equal(DEPOSIT_CHANCE[m][DEEP_WATER], 0, `${name} deep water`);
  });
});

test('RULES.md "Material deposits": deep water never holds deposits; deposits are bits of the material ids', () => {
  for (const seed of ['d1', 'd2', 'd3', 'd4']) {
    const map = generateMap({ seed, size: 30, water: 0.5, rivers: 8 });
    for (let i = 0; i < map.count; i++) {
      if (map.terrain[i] === DEEP_WATER) assert.equal(map.deposits[i], 0, `${seed} hex ${i}`);
      assert.ok(map.deposits[i] < 512, 'only 9 bits');
    }
  }
});

test('RULES.md "Material deposits": hit rates by terrain match the table over many seeds (rivers roll both)', () => {
  // Size 50 with many rivers and mountains, so every terrain has plenty of hexes and no exotic is missing (no re-rolls).
  const hits = new Map(); // key `${river}:${terrain}:${material}` -> hits
  const seen = new Map();
  for (let s = 0; s < 14; s++) {
    const map = generateMap({ seed: `rate${s}`, size: 50, water: 0.2, mountains: 0.25, rivers: 20 });
    for (let i = 0; i < map.count; i++) {
      const t = map.terrain[i];
      if (t === DEEP_WATER) continue;
      const key = `${map.river[i]}:${t}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      for (let m = 0; m < MATERIAL_COUNT; m++) if (hasDeposit(map.deposits, i, m)) hits.set(`${key}:${m}`, (hits.get(`${key}:${m}`) ?? 0) + 1);
    }
  }
  let checked = 0;
  for (const t of TERRAIN_COLUMNS) {
    for (const river of [0, 1]) {
      const n = seen.get(`${river}:${t}`) ?? 0;
      if (n < 300) continue; // too few hexes of this kind for a fair test
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const own = DEPOSIT_CHANCE[m][t];
        const p = river ? 1 - (1 - own) * (1 - RIVER_DEPOSIT_CHANCE[m]) : own;
        const got = (hits.get(`${river}:${t}:${m}`) ?? 0) / n;
        const sigma = Math.sqrt((p * (1 - p)) / n);
        assert.ok(Math.abs(got - p) <= Math.max(5 * sigma, 0.004), `terrain ${t} river ${river} ${MATERIAL_IDS[m]}: ${got} vs ${p} (n ${n})`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 5 * 9, `enough terrain/river kinds had hexes: ${checked}`);
  assert.ok((seen.get('1:2') ?? 0) > 100 || (seen.get('1:3') ?? 0) > 100, 'river hexes were tested');
});

test('RULES.md "Material deposits": a terrain with chance 0 never holds that material', () => {
  for (const seed of ['z1', 'z2', 'z3']) {
    const map = generateMap({ seed, size: 40, water: 0.2, mountains: 0.2, rivers: 10 });
    for (let i = 0; i < map.count; i++) {
      const t = map.terrain[i];
      if (t === DEEP_WATER) continue;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const possible = DEPOSIT_CHANCE[m][t] > 0 || (map.river[i] && RIVER_DEPOSIT_CHANCE[m] > 0);
        if (!possible) assert.ok(!hasDeposit(map.deposits, i, m), `seed ${seed} hex ${i} terrain ${t} ${MATERIAL_IDS[m]}`);
      }
    }
  }
});

const canHold = (map, m) => {
  for (let i = 0; i < map.count; i++) {
    const t = map.terrain[i];
    if (t === DEEP_WATER) continue;
    if (DEPOSIT_CHANCE[m][t] > 0 || (map.river[i] && RIVER_DEPOSIT_CHANCE[m] > 0)) return true;
  }
  return false;
};
const total = (map, m) => { let n = 0; for (let i = 0; i < map.count; i++) if (hasDeposit(map.deposits, i, m)) n++; return n; };

test('RULES.md "Material deposits": every map has each exotic material wherever its land can hold it', () => {
  const settings = [
    { size: 10 }, { size: 10, water: 0.7 }, { size: 10, water: 0.7, mountains: 0 }, { size: 10, mountains: 0, desert: 0 },
    { size: 10, water: 0.7, mountains: 0, desert: 0, rivers: 0 }, { size: 12, water: 0.6, mountains: 0.02, desert: 0.02, rivers: 0 },
    { size: 10, water: 0.7, mountains: 0.01, plains: 1, forest: 0, desert: 0, tundra: 0 },
  ];
  for (const base of settings) {
    for (let s = 0; s < 25; s++) {
      const map = generateMap({ ...base, seed: `exo${s}` });
      for (const m of EXOTIC) {
        if (canHold(map, m)) {
          assert.ok(total(map, m) >= 1, `${JSON.stringify(base)} seed exo${s}: no ${MATERIAL_IDS[m]}`);
        } else assert.equal(total(map, m), 0, `${MATERIAL_IDS[m]} cannot be held here`);
      }
    }
  }
});

test('RULES.md "Material deposits": no mountain and no desert means no gemstones at all', () => {
  let maps = 0;
  for (let s = 0; s < 30; s++) {
    const map = generateMap({ seed: `nogem${s}`, size: 10, mountains: 0, desert: 0 });
    // Mountains 0% still leaves no mountain hexes; desert 0% leaves no desert hexes.
    let mountains = 0; let deserts = 0;
    for (let i = 0; i < map.count; i++) { if (map.terrain[i] === MOUNTAIN) mountains++; if (map.terrain[i] === DESERT) deserts++; }
    if (mountains === 0 && deserts === 0) {
      assert.equal(total(map, GEMSTONES), 0, `seed nogem${s}`);
      maps++;
    }
  }
  assert.ok(maps >= 25, `most such maps have neither: ${maps}`);
});

test('RULES.md "Material deposits": the same map settings always give the same deposits; other seeds differ', () => {
  const a = generateMap({ seed: 'same', size: 20 });
  const b = generateMap({ seed: 'same', size: 20 });
  assert.deepEqual(a.deposits, b.deposits);
  assert.equal(hashMap(a), hashMap(b));
  const c = generateMap({ seed: 'other', size: 20 });
  assert.notDeepEqual(a.deposits, c.deposits);
  // Game settings (civs, mutation, end conditions) do not touch the map's deposits.
  const sim = new Simulation({ seed: 'same', size: 20, civCount: 5, mutation: 0.1, startPop: 100 });
  assert.deepEqual(sim.map.deposits, a.deposits);
  sim.tick(50);
  assert.deepEqual(sim.map.deposits, a.deposits, 'deposits never run out');
  assert.equal(sim.mapHash(), hashMap(a));
});

test('RULES.md "Material deposits": deposits are part of the map hash', () => {
  const map = generateMap({ seed: 'hashdep', size: 15 });
  const before = hashMap(map);
  const land = map.terrain.findIndex((t) => t !== DEEP_WATER);
  map.deposits[land] ^= 1;
  assert.notEqual(hashMap(map), before);
  map.deposits[land] ^= 1;
  assert.equal(hashMap(map), before);
});

test('RULES.md "Material deposits": a hex can hold several materials; inspect lists them as ids in material order', () => {
  const sim = new Simulation({ seed: 'inspectdep', size: 30, rivers: 6, mountains: 0.2 });
  const m = sim.map;
  let most = 0;
  for (let row = 0; row < m.rows; row++) {
    for (let col = 0; col < m.cols; col++) {
      const i = row * m.cols + col;
      const d = sim.inspect(col, row).deposits;
      const expected = MATERIAL_IDS.filter((_, k) => (m.deposits[i] >> k) & 1);
      assert.deepEqual(d, expected);
      assert.deepEqual(describeHex(m, col, row).deposits, expected);
      most = Math.max(most, d.length);
    }
  }
  assert.ok(most >= 3, `some hex holds several materials: ${most}`);
  // A hex with no deposits lists none.
  const empty = m.deposits.findIndex((v, i) => v === 0 && m.terrain[i] !== DEEP_WATER);
  assert.deepEqual(sim.inspect(empty % m.cols, Math.floor(empty / m.cols)).deposits, []);
});
