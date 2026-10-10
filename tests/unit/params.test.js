import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParams, presetParams, randomParams, PRESETS, DEFAULT_PARAMS, MAX_CIVS } from '../../src/sim/params.js';
import { CIV_TYPE_IDS } from '../../src/sim/civTypes.js';

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('defaults normalise to themselves (apart from mix rounding)', () => {
  const p = normalizeParams(DEFAULT_PARAMS);
  assert.equal(p.width, DEFAULT_PARAMS.width);
  assert.deepEqual(p.civs, DEFAULT_PARAMS.civs);
  assert.ok(Math.abs(sum(p.terrainMix) - 1) < 1e-9);
});

test('bad values are clamped or replaced', () => {
  const p = normalizeParams({
    width: 5000, height: -3, startPop: 'lots', placement: 'nowhere',
    civs: ['bogus', 'nomadic'], abundance: 99, endCondition: 'never',
    terrainMix: { water: 1, desert: 0, plains: 0, fertile: 0, mountain: 0 },
  });
  assert.equal(p.width, 200);
  assert.equal(p.height, 20);
  assert.equal(p.startPop, DEFAULT_PARAMS.startPop);
  assert.equal(p.placement, 'spread');
  assert.deepEqual(p.civs, ['nomadic']);
  assert.equal(p.abundance, 3);
  assert.equal(p.endCondition, 'none');
  assert.ok(p.terrainMix.water < 0.8, 'some land is guaranteed');
  assert.ok(Math.abs(sum(p.terrainMix) - 1) < 1e-9);
});

test('civ list is capped', () => {
  const p = normalizeParams({ civs: new Array(30).fill('nomadic') });
  assert.equal(p.civs.length, MAX_CIVS);
});

test('every preset is valid', () => {
  for (const key of Object.keys(PRESETS)) {
    const p = presetParams(key);
    assert.ok(p.civs.length >= 1, key);
    assert.ok(Math.abs(sum(p.terrainMix) - 1) < 1e-9, key);
  }
});

test('randomParams is always valid', () => {
  let s = 1;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 50; k++) {
    const p = randomParams(random);
    const again = normalizeParams(p);
    assert.deepEqual({ ...again, terrainMix: null }, { ...p, terrainMix: null });
    for (const k of Object.keys(p.terrainMix)) assert.ok(Math.abs(again.terrainMix[k] - p.terrainMix[k]) < 1e-9);
    for (const t of p.civs) assert.ok(CIV_TYPE_IDS.includes(t));
  }
});
