import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../../src/sim/simulation.js';
import { presetParams, PRESETS } from '../../src/sim/params.js';

test('same params and seed give the same state hash after 1000 years', () => {
  const a = new Simulation({ seed: 'repro', size: 30 });
  const b = new Simulation({ seed: 'repro', size: 30 });
  a.tick(1000);
  b.tick(1000);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.stats(), b.stats());
});

test('ticking in chunks matches ticking all at once', () => {
  const a = new Simulation({ seed: 'chunks', size: 20 });
  const b = new Simulation({ seed: 'chunks', size: 20 });
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
  assert.notEqual(a.mapHash(), b.mapHash());
});

test('every preset is reproducible', () => {
  const hashes = new Set();
  for (const key of Object.keys(PRESETS)) {
    const a = new Simulation(presetParams(key));
    const b = new Simulation(presetParams(key));
    a.tick(200);
    b.tick(200);
    assert.equal(a.hash(), b.hash(), key);
    assert.equal(a.mapHash(), b.mapHash(), key);
    hashes.add(a.mapHash());
  }
  assert.equal(hashes.size, Object.keys(PRESETS).length, 'presets give different maps');
});

// CLAUDE.md: the sim is pure and deterministic.
test('src/sim uses no DOM, timers, Date or engine-dependent maths', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/sim');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(join(dir, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of [/\bdocument\b/, /\bwindow\b/, /\bDate\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\brequestAnimationFrame\b/,
      /\bperformance\b/, /pixi/i, /Math\.(exp|pow|log\w*|sin|cos|tan|asin|acos|atan2?|hypot|cbrt|sinh|cosh|tanh)\b/, /\*\*/]) {
      assert.doesNotMatch(code, bad, `${file} uses ${bad}`);
    }
    // Math.random is allowed only in the UI helpers that pick a new setup.
    const randoms = code.match(/Math\.random/g)?.length ?? 0;
    if (file === 'rng.js') assert.ok(randoms <= 2, `${file}: Math.random outside randomSeedString`);
    else if (file === 'params.js') assert.ok(randoms <= 1, `${file}: Math.random outside randomParams`);
    else assert.equal(randoms, 0, `${file} uses Math.random`);
  }
});
