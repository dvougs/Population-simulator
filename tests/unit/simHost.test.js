import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalSimHost } from '../../src/host/simHost.js';
import { Simulation } from '../../src/sim/simulation.js';
import { presetParams } from '../../src/sim/params.js';

// Data crossing the host boundary must survive structured cloning (a Worker host).
const cloneable = (v) => assert.doesNotThrow(() => structuredClone(v));

test('before start, the host answers with empty values', () => {
  const host = new LocalSimHost();
  assert.equal(host.params, null);
  assert.equal(host.finished, false);
  assert.equal(host.tickCount, 0);
  assert.equal(host.tick(5), 0);
  assert.equal(host.map(), null);
  assert.equal(host.stats(), null);
  assert.equal(host.inspect(0, 0), null);
  assert.equal(host.hash(), null);
  assert.equal(host.mapHash(), null);
});

test('preview returns plain map data without starting a game', () => {
  const host = new LocalSimHost();
  const m = host.preview({ seed: 'prev', size: 14, water: 0.3 });
  assert.equal(host.params, null, 'preview does not start a game');
  assert.equal(m.cols, 14);
  assert.equal(m.rows, 14);
  for (const k of ['terrain', 'lake', 'river']) assert.ok(m[k] instanceof Uint8Array && m[k].length === 196, k);
  assert.ok(m.riverTo instanceof Int32Array && m.riverTo.length === 196);
  assert.equal(m.terrainCounts.reduce((a, b) => a + b, 0), 196);
  assert.match(m.hash, /^[0-9a-f]{8}$/);
  assert.deepEqual(m.params, {
    seed: 'prev', size: 14, water: 0.3, mountains: 0.12, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
  });
  cloneable(m);
});

test('the preview and the started game show the same map', () => {
  for (const key of ['default', 'archipelago', 'highlands']) {
    const p = presetParams(key);
    const host = new LocalSimHost();
    const preview = host.preview(p);
    const started = host.start({ ...p, endCondition: 'ticks', endTicks: 50 });
    assert.equal(started.endTicks, 50);
    assert.equal(host.mapHash(), preview.hash, key);
    assert.equal(host.map().hash, preview.hash, key);
    assert.deepEqual(host.map().terrain, preview.terrain);
  }
});

test('start, tick, stats, inspect and hashes go through the host', () => {
  const host = new LocalSimHost();
  const params = host.start({ seed: 'host', endCondition: 'ticks', endTicks: 12 });
  assert.equal(params.seed, 'host');
  assert.deepEqual(host.params, params);
  host.params.seed = 'changed';
  assert.equal(host.params.seed, 'host', 'params are a copy');
  assert.equal(host.tick(5), 5);
  assert.equal(host.tickCount, 5);
  assert.equal(host.tick(100), 7);
  assert.equal(host.finished, true);
  const stats = host.stats();
  assert.equal(stats.tick, 12);
  assert.equal(stats.endReason, 'Reached year 12');
  cloneable(stats);
  const h = host.inspect(4, 4);
  assert.equal(h.index, 44);
  cloneable(h);
  assert.equal(host.inspect(10, 0), null);

  const ref = new Simulation({ seed: 'host', endCondition: 'ticks', endTicks: 12 });
  ref.tick(12);
  assert.equal(host.hash(), ref.hash());
  assert.equal(host.mapHash(), ref.mapHash());
});
