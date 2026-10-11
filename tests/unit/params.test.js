import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeParams, presetParams, randomParams, mapParams, PRESETS, DEFAULT_PARAMS, LIMITS, MAP_KEYS, LOWLAND_KEYS,
  END_CONDITIONS,
} from '../../src/sim/params.js';

function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

test('defaults match RULES.md "Map settings" and "Game settings"', () => {
  assert.deepEqual({ ...DEFAULT_PARAMS }, {
    seed: 'pangaea', size: 10, water: 0.25, mountains: 0.12, rivers: 2,
    plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15, civCount: 3, startPop: 20,
    endCondition: 'none', endTicks: 1000,
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
  assert.deepEqual(END_CONDITIONS, ['none', 'ticks']);
  assert.deepEqual(MAP_KEYS, ['seed', 'size', 'water', 'mountains', 'rivers', 'plains', 'forest', 'desert', 'tundra']);
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

test('year limit: 10 to 100000, clamped; end condition none or ticks', () => {
  const t = (v) => normalizeParams({ endTicks: v }).endTicks;
  assert.equal(t(9), 10);
  assert.equal(t(10), 10);
  assert.equal(t(11), 11);
  assert.equal(t(100000), 100000);
  assert.equal(t(100001), 100000);
  assert.equal(normalizeParams({ endCondition: 'ticks' }).endCondition, 'ticks');
  assert.equal(normalizeParams({ endCondition: 'none' }).endCondition, 'none');
  assert.equal(normalizeParams({ endCondition: 'never' }).endCondition, 'none');
});

test('values that are not numbers fall back to the default', () => {
  for (const bad of ['lots', '', null, undefined, NaN, Infinity, {}, 'NaN']) {
    const p = normalizeParams({ size: bad, water: bad, mountains: bad, rivers: bad, endTicks: bad });
    assert.equal(p.size, 10, `size ${String(bad)}`);
    assert.equal(p.water, 0.25);
    assert.equal(p.mountains, 0.12);
    assert.equal(p.rivers, 2);
    assert.equal(p.endTicks, 1000);
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
  const p = normalizeParams({ seed: 'a', size: 33, water: 0.4, width: 999, civs: ['x'] });
  assert.deepEqual(normalizeParams(p), p);
  assert.equal('width' in p, false);
  assert.equal('civs' in p, false);
});

test('presets match RULES.md', () => {
  const expected = {
    default: ['Small world', 'pangaea', 10, 0.25, 0.12, 2, 0.4, 0.3, 0.15, 0.15],
    continent: ['Continent', 'continent', 30, 0.2, 0.12, 6, 0.4, 0.3, 0.15, 0.15],
    archipelago: ['Archipelago', 'islands', 30, 0.6, 0.08, 2, 0.4, 0.3, 0.15, 0.15],
    highlands: ['Highlands', 'peaks', 20, 0.15, 0.3, 5, 0.4, 0.3, 0.15, 0.15],
    large: ['Large world', 'vast', 50, 0.3, 0.12, 12, 0.4, 0.3, 0.15, 0.15],
  };
  assert.deepEqual(Object.keys(PRESETS).sort(), Object.keys(expected).sort());
  for (const [key, [label, seed, size, water, mountains, rivers, plains, forest, desert, tundra]] of Object.entries(expected)) {
    assert.equal(PRESETS[key].label, label);
    const p = presetParams(key);
    assert.deepEqual(mapParams(p), { seed, size, water, mountains, rivers, plains, forest, desert, tundra }, key);
    // Non-default presets list every map setting themselves.
    if (key !== 'default') for (const k of MAP_KEYS) assert.ok(k in PRESETS[key].params, `${key} lists ${k}`);
    assert.deepEqual(normalizeParams(p), p, `${key} is already normal`);
  }
  assert.throws(() => presetParams('nope'));
});

test('mapParams keeps only the nine map settings', () => {
  const m = mapParams({ seed: 's', size: 12, endCondition: 'ticks', endTicks: 50 });
  assert.deepEqual(Object.keys(m), MAP_KEYS);
  assert.equal(Object.keys(m).length, 9);
  assert.deepEqual(m, {
    seed: 's', size: 12, water: 0.25, mountains: 0.12, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
  });
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

  const random = lcg(99);
  const sizes = new Set();
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
    assert.equal(p.endCondition, 'none');
    assert.ok(typeof p.seed === 'string' && p.seed.length > 0 && p.seed.length <= 64);
    sizes.add(p.size);
  }
  assert.ok(sizes.size > 20, 'sizes spread over the range');
});
