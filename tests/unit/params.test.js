import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peopleTraits } from '../../src/sim/peoples.js';
import {
  normalizeParams, presetParams, randomParams, mapParams, PRESETS, DEFAULT_PARAMS, LIMITS, MAP_KEYS, LOWLAND_KEYS, LAND_SHAPES,
  END_CONDITIONS,
} from '../../src/sim/params.js';

function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

test('defaults match RULES.md "Map settings" and "Game settings"', () => {
  assert.deepEqual({ ...DEFAULT_PARAMS }, {
    seed: 'pangaea', size: 10, water: 0.25, mountains: 0.12, rivers: 2,
    plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15, landShape: 'continent', civCount: 3, civTypes: ['expansionist', 'aggressive', 'cooperative'],
    civs: ['romans', 'assyrians', 'babylonians'].map((people, colour) => ({ people, name: '', traits: { ...peopleTraits(people) }, mutation: null, startPop: null, colour })),
    startPop: 20, mutation: 0.03,
    endConditions: [], endTicks: 2500, dominanceShare: 0.6, dominanceYears: 300, starts: [],
  });
  assert.deepEqual(normalizeParams(), { ...DEFAULT_PARAMS });
  assert.deepEqual(normalizeParams({}), { ...DEFAULT_PARAMS });
  assert.deepEqual(normalizeParams(DEFAULT_PARAMS), { ...DEFAULT_PARAMS });
});

test('ranges match RULES.md', () => {
  assert.deepEqual(LIMITS.size, { min: 10, max: 50 });
  assert.deepEqual(LIMITS.water, { min: 0, max: 0.7 });
  assert.deepEqual(LIMITS.mountains, { min: 0, max: 0.4 });
  assert.deepEqual(LIMITS.rivers, { min: 0, max: 20 });
  for (const k of ['plains', 'forest', 'desert', 'tundra']) assert.deepEqual(LIMITS[k], { min: 0, max: 1 }, k);
  assert.deepEqual(LIMITS.endTicks, { min: 10, max: 100000 });
  assert.equal(LIMITS.seedLength, 64);
  assert.deepEqual(END_CONDITIONS, ['lastCiv', 'kingdom', 'dominance', 'years']);
  assert.deepEqual(LIMITS.civCount, { min: 1, max: 8 });
  assert.deepEqual(LIMITS.startPop, { min: 4, max: 200 });
  assert.deepEqual(LIMITS.mutation, { min: 0, max: 0.1 });
  assert.deepEqual(LIMITS.dominanceShare, { min: 0.25, max: 1 });
  assert.deepEqual(LIMITS.dominanceYears, { min: 10, max: 10000 });
  assert.deepEqual(MAP_KEYS, ['seed', 'size', 'water', 'mountains', 'rivers', 'plains', 'forest', 'desert', 'tundra', 'landShape']);
  assert.deepEqual(LAND_SHAPES, ['continent', 'islands']);
  assert.deepEqual(LOWLAND_KEYS, ['plains', 'forest', 'desert', 'tundra']);
});

test('size: 10 to 50, clamped on both sides, rounded to whole hexes', () => {
  const s = (v) => normalizeParams({ size: v }).size;
  assert.equal(s(9), 10);
  assert.equal(s(10), 10);
  assert.equal(s(11), 11);
  assert.equal(s(49), 49);
  assert.equal(s(50), 50);
  assert.equal(s(51), 50);
  assert.equal(s(100), 50);
  assert.equal(s(-100), 10);
  assert.equal(s(24.6), 25);
  assert.equal(s('30'), 30);
});

test('water: 0% to 70%, whole percent, clamped', () => {
  const w = (v) => normalizeParams({ water: v }).water;
  assert.equal(w(-0.01), 0);
  assert.equal(w(0), 0);
  assert.equal(w(0.01), 0.01);
  assert.equal(w(0.69), 0.69);
  assert.equal(w(0.7), 0.7);
  assert.equal(w(0.71), 0.7);
  assert.equal(w(5), 0.7);
  assert.equal(w(0.333), 0.33);
  assert.equal(w(0.256), 0.26);
});

test('mountains: 0% to 40%, whole percent, clamped', () => {
  const m = (v) => normalizeParams({ mountains: v }).mountains;
  assert.equal(m(-1), 0);
  assert.equal(m(0), 0);
  assert.equal(m(0.4), 0.4);
  assert.equal(m(0.41), 0.4);
  assert.equal(m(0.124), 0.12);
});

test('plains, forest, desert, tundra: 0% to 100%, whole percent, clamped, default on bad input', () => {
  const defaults = { plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15 };
  for (const [k, d] of Object.entries(defaults)) {
    const v = (x) => normalizeParams({ [k]: x })[k];
    assert.equal(v(undefined), d, k);
    assert.equal(v(-0.01), 0, k);
    assert.equal(v(-5), 0, k);
    assert.equal(v(0), 0, k);
    assert.equal(v(0.01), 0.01, k);
    assert.equal(v(0.99), 0.99, k);
    assert.equal(v(1), 1, k);
    assert.equal(v(1.01), 1, k);
    assert.equal(v(7), 1, k);
    assert.equal(v(0.333), 0.33, k);
    assert.equal(v(0.256), 0.26, k);
    assert.equal(v('0.5'), 0.5, k);
    for (const bad of ['lots', '', null, NaN, Infinity, {}, 'NaN']) assert.equal(v(bad), d, `${k} ${String(bad)}`);
  }
  // Each key is normalised on its own.
  const p = normalizeParams({ plains: 2, forest: -1, desert: 0.5, tundra: 'x' });
  assert.deepEqual([p.plains, p.forest, p.desert, p.tundra], [1, 0, 0.5, 0.15]);
});

test('rivers: 0 to 20, whole number, clamped', () => {
  const r = (v) => normalizeParams({ rivers: v }).rivers;
  assert.equal(r(-1), 0);
  assert.equal(r(0), 0);
  assert.equal(r(1), 1);
  assert.equal(r(19), 19);
  assert.equal(r(20), 20);
  assert.equal(r(21), 20);
  assert.equal(r(2.4), 2);
});

test('year limit: 10 to 100000, clamped (RULES.md "Game settings")', () => {
  const t = (v) => normalizeParams({ endTicks: v }).endTicks;
  assert.equal(t(9), 10);
  assert.equal(t(10), 10);
  assert.equal(t(11), 11);
  assert.equal(t(100000), 100000);
  assert.equal(t(100001), 100000);
});

test('dominance share 25% to 100% whole percent; dominance years 10 to 10000', () => {
  const sh = (v) => normalizeParams({ dominanceShare: v }).dominanceShare;
  assert.equal(sh(0.24), 0.25);
  assert.equal(sh(0.25), 0.25);
  assert.equal(sh(0.26), 0.26);
  assert.equal(sh(1), 1);
  assert.equal(sh(1.01), 1);
  assert.equal(sh(0.555), 0.56);
  const yr = (v) => normalizeParams({ dominanceYears: v }).dominanceYears;
  assert.equal(yr(9), 10);
  assert.equal(yr(10), 10);
  assert.equal(yr(10000), 10000);
  assert.equal(yr(10001), 10000);
  assert.equal(yr(299.6), 300);
});

test('end conditions: any combination, unknown ignored, duplicates once, non-list means Sandbox, legacy ticks', () => {
  const e = (v) => normalizeParams({ endConditions: v }).endConditions;
  assert.deepEqual(e([]), []);
  assert.deepEqual(e(['years']), ['years']);
  assert.deepEqual(e(['years', 'kingdom', 'lastCiv', 'dominance']), ['lastCiv', 'kingdom', 'dominance', 'years']);
  assert.deepEqual(e(['years', 'years', 'bogus', 'lastCiv']), ['lastCiv', 'years']);
  for (const bad of ['years', 'lastCiv', 5, null, undefined, {}, true]) assert.deepEqual(e(bad), [], String(bad));
  assert.deepEqual(normalizeParams({ endCondition: 'ticks' }).endConditions, ['years']);
  assert.deepEqual(normalizeParams({ endCondition: 'none' }).endConditions, []);
  assert.deepEqual(normalizeParams({ endCondition: 'never' }).endConditions, []);
});

test('values that are not numbers fall back to the default', () => {
  for (const bad of ['lots', '', null, undefined, NaN, Infinity, {}, 'NaN']) {
    const p = normalizeParams({ size: bad, water: bad, mountains: bad, rivers: bad, endTicks: bad, dominanceShare: bad, dominanceYears: bad });
    assert.equal(p.size, 10, `size ${String(bad)}`);
    assert.equal(p.water, 0.25);
    assert.equal(p.mountains, 0.12);
    assert.equal(p.rivers, 2);
    assert.equal(p.endTicks, 2500);
    assert.equal(p.dominanceShare, 0.6);
    assert.equal(p.dominanceYears, 300);
  }
});

test('seed: any text up to 64 characters, empty means the default', () => {
  assert.equal(normalizeParams({ seed: '' }).seed, 'pangaea');
  assert.equal(normalizeParams({ seed: null }).seed, 'pangaea');
  assert.equal(normalizeParams({ seed: 'hello world ✓' }).seed, 'hello world ✓');
  assert.equal(normalizeParams({ seed: 42 }).seed, '42');
  const s64 = 'x'.repeat(64);
  assert.equal(normalizeParams({ seed: s64 }).seed, s64);
  assert.equal(normalizeParams({ seed: s64 + 'y' }).seed, s64);
});

test('normalizeParams is idempotent and drops unknown keys', () => {
  const p = normalizeParams({ seed: 'a', size: 33, water: 0.4, width: 999, civList: ['x'], civs: ['x', { people: 'nope', extra: 1 }] });
  assert.deepEqual(normalizeParams(p), p);
  assert.equal('width' in p, false);
  assert.equal('civList' in p, false);
  assert.deepEqual(p.civs.map((c) => Object.keys(c)), Array(3).fill(['people', 'name', 'traits', 'mutation', 'startPop', 'colour']));
});

test('presets match RULES.md', () => {
  const expected = {
    default: ['Small world', 'pangaea', 10, 0.25, 0.12, 2, 0.4, 0.3, 0.15, 0.15, 'continent'],
    continent: ['Continent', 'continent', 30, 0.2, 0.12, 6, 0.4, 0.3, 0.15, 0.15, 'continent'],
    archipelago: ['Archipelago', 'islands', 30, 0.6, 0.08, 2, 0.4, 0.3, 0.15, 0.15, 'islands'],
    highlands: ['Highlands', 'peaks', 20, 0.15, 0.3, 5, 0.4, 0.3, 0.15, 0.15, 'continent'],
    large: ['Large world', 'vast', 50, 0.3, 0.12, 12, 0.4, 0.3, 0.15, 0.15, 'continent'],
  };
  assert.deepEqual(Object.keys(PRESETS).sort(), Object.keys(expected).sort());
  for (const [key, [label, seed, size, water, mountains, rivers, plains, forest, desert, tundra, landShape]] of Object.entries(expected)) {
    assert.equal(PRESETS[key].label, label);
    const p = presetParams(key);
    assert.deepEqual(mapParams(p), { seed, size, water, mountains, rivers, plains, forest, desert, tundra, landShape }, key);
    // Non-default presets list every map setting themselves (the land shape only when it is not the default).
    if (key !== 'default') for (const k of MAP_KEYS) if (k !== 'landShape') assert.ok(k in PRESETS[key].params, `${key} lists ${k}`);
    assert.deepEqual(normalizeParams(p), p, `${key} is already normal`);
  }
  assert.throws(() => presetParams('nope'));
});

test('mapParams keeps only the ten map settings', () => {
  const m = mapParams({ seed: 's', size: 12, endCondition: 'ticks', endTicks: 50 });
  assert.deepEqual(Object.keys(m), MAP_KEYS);
  assert.equal(Object.keys(m).length, 10);
  assert.deepEqual(m, {
    seed: 's', size: 12, water: 0.25, mountains: 0.12, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15, landShape: 'continent',
  });
  assert.equal(mapParams({ landShape: 'islands' }).landShape, 'islands');
  assert.equal(mapParams({ landShape: 'donut' }).landShape, 'continent', 'anything else means the default');
  const w = mapParams({ seed: 's', forest: 0.9, tundra: 2 });
  assert.equal(w.forest, 0.9);
  assert.equal(w.tundra, 1);
});

test('randomise ranges match RULES.md (size 10–50, water 10–60%, mountains 5–30%, rivers 0–⌊size/4⌋, plains 20–60%, forest 10–50%, desert 0–30%, tundra 0–30%)', () => {
  const lo = randomParams(() => 0);
  assert.equal(lo.size, 10);
  assert.equal(lo.water, 0.1);
  assert.equal(lo.mountains, 0.05);
  assert.equal(lo.rivers, 0);
  assert.deepEqual([lo.plains, lo.forest, lo.desert, lo.tundra], [0.2, 0.1, 0, 0]);
  const hi = randomParams(() => 0.9999999);
  assert.equal(hi.size, 50);
  assert.equal(hi.water, 0.6);
  assert.equal(hi.mountains, 0.3);
  assert.equal(hi.rivers, 12);
  assert.deepEqual([hi.plains, hi.forest, hi.desert, hi.tundra], [0.6, 0.5, 0.3, 0.3]);
  // Every draw 0: all four end conditions ticked (First to Kingdom is drawn last), 2 civs, 10 people, 0% mutation.
  assert.deepEqual(lo.endConditions, ['lastCiv', 'kingdom', 'dominance', 'years']);
  assert.deepEqual([lo.civCount, lo.startPop, lo.mutation], [2, 10, 0]);
  // Every draw 0: the first people, then the next one (the first is taken).
  assert.deepEqual(lo.civs.map((c) => c.people), ['sumerians', 'egyptians']);
  assert.deepEqual(lo.civTypes, ['isolationist', 'isolationist']);
  assert.deepEqual([hi.civCount, hi.startPop, hi.mutation], [6, 50, 0.1]);
  // Every draw near 1: the last people, then from the top of the list.
  assert.deepEqual(hi.civs.map((c) => c.people), ['incas', 'sumerians', 'egyptians', 'akkadians', 'maya', 'babylonians']);
  assert.equal(lo.endTicks, 1000);
  assert.equal(lo.dominanceShare, 0.5);
  assert.equal(lo.dominanceYears, 100);
  assert.deepEqual(hi.endConditions, []);
  assert.equal(hi.endTicks, 10000);
  assert.equal(hi.dominanceShare, 0.8);
  assert.equal(hi.dominanceYears, 500);

  const random = lcg(99);
  const sizes = new Set();
  const ticked = [0, 0, 0, 0, 0];
  const each = { lastCiv: 0, kingdom: 0, dominance: 0, years: 0 };
  const typeSeen = new Set();
  for (let k = 0; k < 300; k++) {
    const p = randomParams(random);
    assert.deepEqual(normalizeParams(p), p);
    assert.ok(p.size >= 10 && p.size <= 50 && Number.isInteger(p.size));
    assert.ok(p.water >= 0.1 && p.water <= 0.6);
    assert.ok(p.mountains >= 0.05 && p.mountains <= 0.3);
    assert.ok(p.rivers >= 0 && p.rivers <= Math.floor(p.size / 4));
    assert.ok(p.plains >= 0.2 && p.plains <= 0.6, `plains ${p.plains}`);
    assert.ok(p.forest >= 0.1 && p.forest <= 0.5, `forest ${p.forest}`);
    assert.ok(p.desert >= 0 && p.desert <= 0.3, `desert ${p.desert}`);
    assert.ok(p.tundra >= 0 && p.tundra <= 0.3, `tundra ${p.tundra}`);
    assert.ok(Array.isArray(p.endConditions) && p.endConditions.every((k) => END_CONDITIONS.includes(k)));
    assert.ok([1000, 2500, 5000, 10000].includes(p.endTicks), `endTicks ${p.endTicks}`);
    assert.ok(p.dominanceShare >= 0.5 && p.dominanceShare <= 0.8, `share ${p.dominanceShare}`);
    assert.ok([100, 200, 300, 500].includes(p.dominanceYears));
    assert.ok(p.civCount >= 2 && p.civCount <= 6, `civs ${p.civCount}`);
    assert.equal(p.civTypes.length, p.civCount);
    assert.equal(new Set(p.civs.map((c) => c.people)).size, p.civCount, 'every civ a different people');
    for (const t of p.civTypes) typeSeen.add(t);
    assert.ok(p.startPop >= 10 && p.startPop <= 50);
    assert.ok(p.mutation >= 0 && p.mutation <= 0.1 && Math.abs(p.mutation * 100 - Math.round(p.mutation * 100)) < 1e-9, `mutation ${p.mutation}`);
    ticked[p.endConditions.length]++;
    for (const k of p.endConditions) each[k]++;
    assert.ok(typeof p.seed === 'string' && p.seed.length > 0 && p.seed.length <= 64);
    sizes.add(p.size);
  }
  assert.ok(sizes.size > 20, 'sizes spread over the range');
  assert.ok(ticked.every((n) => n > 0), 'all of 0 to 4 ticked occur');
  assert.equal(typeSeen.size, 5, 'all 5 civ types are drawn');
  for (const k of Object.keys(each)) assert.ok(each[k] > 90 && each[k] < 210, `${k} ticked about half the time: ${each[k]}`);
});

test('presets set the end conditions per RULES.md "Game settings"', () => {
  const ends = (k) => presetParams(k).endConditions;
  assert.deepEqual(ends('default'), []);
  assert.deepEqual(ends('continent'), ['kingdom', 'dominance', 'years']);
  assert.equal(presetParams('continent').endTicks, 5000);
  assert.deepEqual(ends('archipelago'), ['lastCiv', 'years']);
  assert.equal(presetParams('archipelago').endTicks, 10000);
  assert.deepEqual(ends('highlands'), ['years']);
  assert.equal(presetParams('highlands').endTicks, 2500);
  assert.deepEqual(ends('large'), ['lastCiv', 'dominance']);
  for (const k of Object.keys(PRESETS)) {
    assert.equal(presetParams(k).dominanceShare, 0.6, k);
    assert.equal(presetParams(k).dominanceYears, 300, k);
  }
});

test('RULES.md "Game settings": civ count 1 to 8, starting population 4 to 200, mutation 0% to 10% whole percent', () => {
  const c = (v) => normalizeParams({ civCount: v }).civCount;
  assert.deepEqual([c(0), c(1), c(8), c(9), c(2.4), c('x'), c(undefined)], [1, 1, 8, 8, 2, 3, 3]);
  const s = (v) => normalizeParams({ startPop: v }).startPop;
  assert.deepEqual([s(1), s(3), s(4), s(5), s(200), s(201), s('x')], [4, 4, 4, 5, 200, 200, 20]);
  const m = (v) => normalizeParams({ mutation: v }).mutation;
  assert.deepEqual([m(-0.01), m(0), m(0.01), m(0.1), m(0.11), m(0.034), m('x'), m(null)], [0, 0, 0.01, 0.1, 0.1, 0.03, 0.03, 0.03]);
});

test('RULES.md "Game settings": civ types are padded and trimmed to the civ count, unknown take the default for that number', () => {
  const t = (types, civCount) => normalizeParams({ civCount, civTypes: types }).civTypes;
  const order = ['expansionist', 'aggressive', 'cooperative', 'isolationist', 'nomadic'];
  assert.deepEqual(t(undefined, 8), [...order, 'expansionist', 'aggressive', 'cooperative']);
  assert.deepEqual(t(['nomadic'], 3), ['nomadic', 'aggressive', 'cooperative']);
  assert.deepEqual(t(['nomadic', 'nomadic', 'nomadic', 'nomadic'], 2), ['nomadic', 'nomadic']);
  assert.deepEqual(t(['bogus', 5, null, 'isolationist'], 4), ['expansionist', 'aggressive', 'cooperative', 'isolationist']);
  assert.deepEqual(t('nomadic', 2), ['expansionist', 'aggressive']);
  assert.deepEqual(t(['Nomadic'], 1), ['expansionist']);
  assert.deepEqual(t(['aggressive'], 1), ['aggressive']);
});

test('RULES.md "Game settings": every preset has its civs, peoples, types, people and mutation 3%', () => {
  const want = {
    default: [3, ['expansionist', 'aggressive', 'cooperative'], 20, ['romans', 'assyrians', 'babylonians']],
    continent: [4, ['expansionist', 'aggressive', 'cooperative', 'isolationist'], 30, ['romans', 'assyrians', 'babylonians', 'egyptians']],
    archipelago: [5, ['nomadic', 'expansionist', 'isolationist', 'cooperative', 'aggressive'], 20, ['mongols', 'persians', 'sumerians', 'phoenicians', 'vikings']],
    highlands: [3, ['isolationist', 'aggressive', 'nomadic'], 20, ['incas', 'hittites', 'mongols']],
    large: [6, ['expansionist', 'aggressive', 'cooperative', 'isolationist', 'nomadic', 'aggressive'], 40, ['romans', 'assyrians', 'babylonians', 'egyptians', 'mongols', 'aztecs']],
  };
  for (const [k, [n, types, pop, peoples]] of Object.entries(want)) {
    const p = presetParams(k);
    assert.equal(p.civCount, n, k);
    assert.deepEqual(p.civTypes, types, k);
    assert.deepEqual(p.civs.map((c) => c.people), peoples, k);
    assert.deepEqual(p.civs.map((c) => [c.mutation, c.startPop, c.colour]), peoples.map((_, j) => [null, null, j]), k);
    p.civs.forEach((c) => assert.deepEqual(c.traits, { ...peopleTraits(c.people) }, k));
    assert.equal(p.startPop, pop, k);
    assert.equal(p.mutation, 0.03, k);
  }
});

test('RULES.md "Starting positions": one entry per civ, a hex of the map or -1; none chosen is stored as []', () => {
  const st = (starts, civCount = 3, size = 10) => normalizeParams({ starts, civCount, size }).starts;
  assert.deepEqual(st(undefined), []);
  assert.deepEqual(st([-1, -1, -1]), []);
  assert.deepEqual(st([5, -1, 99]), [5, -1, 99]);
  assert.deepEqual(st([5]), [5, -1, -1], 'padded to the civ count');
  assert.deepEqual(st([5, 6, 7, 8]), [5, 6, 7], 'cut to the civ count');
  assert.deepEqual(st([100, 2.5, 'x', null, -3], 5), [], 'off the map or not whole numbers: automatic');
  assert.deepEqual(st([100], 1, 11), [100], 'hex 100 is on an 11 x 11 map');
  assert.deepEqual(st(['7', 3]), [7, 3, -1], 'numbers as text are read');
  assert.deepEqual(st('nonsense'), []);
});

test('RULES.md "Map settings": randomise picks Islands as the land shape about one time in four', () => {
  let islands = 0;
  for (let k = 0; k < 400; k++) {
    let x = k * 7919 + 1;
    const random = () => { x = (x * 48271) % 2147483647; return x / 2147483647; };
    const p = randomParams(random);
    assert.ok(LAND_SHAPES.includes(p.landShape));
    if (p.landShape === 'islands') islands++;
  }
  assert.ok(islands > 60 && islands < 140, `${islands} of 400`);
});
