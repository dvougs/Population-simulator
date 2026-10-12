// Every building and wonder has a 3D model (src/render3d/buildingModels.js), against RULES.md "Feature flags".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_IDS, ERA_MODELS, WONDER_MODELS, SETTLEMENT_MODELS, SHAPES, COLOURS, modelOf, footprint, heightOf } from '../../src/render3d/buildingModels.js';

test('all 20 era buildings, 4 wonders and every settlement building have a model', () => {
  assert.equal(ALL_IDS.era.length, 20);
  assert.equal(ALL_IDS.wonder.length, 4);
  for (const id of ALL_IDS.era) assert.ok(ERA_MODELS[id], id);
  for (const id of ALL_IDS.wonder) assert.ok(WONDER_MODELS[id], id);
  for (const id of ALL_IDS.settlement) assert.ok(SETTLEMENT_MODELS[id], id);
  // Era and settlement buildings share two ids (Granary, Market) but not a look.
  assert.notDeepEqual(modelOf({ kind: 'building', id: 'granary' }), modelOf({ kind: 'food', id: 'granary' }));
  assert.notDeepEqual(modelOf({ kind: 'building', id: 'market' }), modelOf({ kind: 'trade', id: 'market' }));
});

test('models are made of known shapes and colours, all different, wonders the biggest', () => {
  const all = [...Object.values(ERA_MODELS), ...Object.values(WONDER_MODELS), ...Object.values(SETTLEMENT_MODELS)];
  for (const parts of all) {
    assert.ok(parts.length >= 2 && parts.length <= 30);
    for (const p of parts) {
      assert.ok(SHAPES.includes(p.s), p.s);
      assert.ok(p.c === 'civ' || COLOURS[p.c] !== undefined, p.c);
      for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(p[k]), k);
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0);
    }
  }
  const keys = new Set(all.map((m) => JSON.stringify(m)));
  assert.equal(keys.size, all.length);
  const wonders = Object.values(WONDER_MODELS).map(footprint);
  const era = Object.values(ERA_MODELS).map(footprint);
  assert.ok(Math.min(...wonders) > Math.max(...Object.values(SETTLEMENT_MODELS).map(footprint)) - 0.5);
  assert.ok(Math.min(...wonders) >= Math.min(...era));
  for (const parts of all) assert.ok(heightOf(parts) < 4.5);
});
