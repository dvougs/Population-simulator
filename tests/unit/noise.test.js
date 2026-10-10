import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeNoise } from '../../src/sim/noise.js';
import { Rng } from '../../src/sim/rng.js';

const sample = (f, n = 41) => {
  const out = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push(f(x / (n - 1), y / (n - 1)));
  return out;
};

test('noise output is in [0, 1)', () => {
  for (const [cells, oct] of [[2, 1], [3, 4], [6, 2]]) {
    const f = makeNoise(new Rng(`range-${cells}`), cells, oct);
    for (const v of sample(f)) assert.ok(v >= 0 && v < 1, `${v}`);
  }
});

test('same seed gives the same noise; different seed differs', () => {
  const a = sample(makeNoise(new Rng('n'), 3, 4));
  const b = sample(makeNoise(new Rng('n'), 3, 4));
  const c = sample(makeNoise(new Rng('m'), 3, 4));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('noise is continuous (smoothstep blending, no jumps)', () => {
  const f = makeNoise(new Rng('smooth'), 4, 3);
  const h = 1e-4;
  for (let k = 0; k <= 200; k++) {
    const u = k / 200;
    const v = (k * 37 % 200) / 200;
    assert.ok(Math.abs(f(u, v) - f(Math.min(1, u + h), v)) < 0.01);
    assert.ok(Math.abs(f(u, v) - f(u, Math.min(1, v + h))) < 0.01);
  }
});

test('one octave passes through the lattice values at lattice points', () => {
  const rng = new Rng('lattice');
  const f = makeNoise(rng, 2, 1);
  const copy = new Rng('lattice');
  const grid = [];
  for (let i = 0; i < 16; i++) grid.push(copy.next()); // (2 + 2)² values
  assert.equal(f(0, 0), grid[0]);
  assert.equal(f(0.5, 0), grid[1]);
  assert.equal(f(0, 0.5), grid[4]);
  assert.equal(f(0.5, 0.5), grid[5]);
});

test('inputs outside [0, 1] are clamped', () => {
  const f = makeNoise(new Rng('clamp'), 3, 3);
  assert.equal(f(-5, 0.3), f(0, 0.3));
  assert.equal(f(9, 0.3), f(1, 0.3));
  assert.equal(f(0.3, -1), f(0.3, 0));
  assert.equal(f(0.3, 2), f(0.3, 1));
});
