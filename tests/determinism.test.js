import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { presetParams } from '../src/sim/params.js';

test('same params and seed give an identical world after 1000 ticks', () => {
  const a = new Simulation({ seed: 'repro' });
  const b = new Simulation({ seed: 'repro' });
  a.tick(1000);
  b.tick(1000);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.stats(), b.stats());
});

test('ticking in chunks matches ticking all at once', () => {
  const a = new Simulation({ seed: 'chunks', width: 60, height: 60 });
  const b = new Simulation({ seed: 'chunks', width: 60, height: 60 });
  a.tick(300);
  for (let k = 0; k < 300; k++) b.tick(1);
  assert.equal(a.hash(), b.hash());
});

test('different seeds give different worlds', () => {
  const a = new Simulation({ seed: 'one' });
  const b = new Simulation({ seed: 'two' });
  a.tick(50);
  b.tick(50);
  assert.notEqual(a.hash(), b.hash());
});

test('every preset is reproducible', () => {
  for (const key of ['archipelago', 'drylands', 'crowded']) {
    const a = new Simulation(presetParams(key));
    const b = new Simulation(presetParams(key));
    a.tick(200);
    b.tick(200);
    assert.equal(a.hash(), b.hash(), key);
  }
});
