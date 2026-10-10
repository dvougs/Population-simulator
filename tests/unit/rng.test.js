import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashSeed } from '../../src/sim/rng.js';

test('same seed gives the same sequence', () => {
  const a = new Rng('hello');
  const b = new Rng('hello');
  for (let i = 0; i < 1000; i++) assert.equal(a.nextU32(), b.nextU32());
});

test('different seeds diverge', () => {
  const a = new Rng('hello');
  const b = new Rng('hellp');
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.nextU32() === b.nextU32()) same++;
  assert.ok(same < 3);
});

test('next() stays in [0, 1) and is roughly uniform', () => {
  const r = new Rng(42);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    buckets[Math.floor(v * 10)]++;
  }
  for (const b of buckets) assert.ok(b > 1700 && b < 2300, `bucket ${b}`);
});

test('int() covers its range', () => {
  const r = new Rng('ints');
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(r.int(6));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5]);
});

test('fork() is deterministic and independent of later parent draws', () => {
  const p1 = new Rng('root');
  const c1 = p1.fork('x');
  const p2 = new Rng('root');
  const c2 = p2.fork('x');
  p2.next();
  assert.equal(c1.nextU32(), c2.nextU32());
});

test('hashSeed returns four uint32s', () => {
  const h = hashSeed('abc');
  assert.equal(h.length, 4);
  for (const v of h) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
});
