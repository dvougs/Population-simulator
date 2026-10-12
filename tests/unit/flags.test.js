// Feature flags (RULES.md "Feature flags"): off by default, kept in storage, set by the address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlags, FLAGS, FLAGS_KEY } from '../../src/flags.js';

/** A Storage-like map; `broken` throws on every call, as blocked site data does. */
function memoryStorage(broken = false) {
  const m = new Map();
  const guard = () => { if (broken) throw new Error('blocked'); };
  return {
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    raw: m,
  };
}

test('every flag is off by default', () => {
  const flags = createFlags(memoryStorage());
  for (const name of Object.keys(FLAGS)) assert.equal(flags.get(name), false, name);
  assert.equal(FLAGS.graphics3d.default, false);
});

test('a flag set on is kept in storage and read back by the next visit', () => {
  const storage = memoryStorage();
  const flags = createFlags(storage);
  flags.set('graphics3d', true);
  assert.equal(flags.get('graphics3d'), true);
  assert.deepEqual(JSON.parse(storage.raw.get(FLAGS_KEY)), { graphics3d: true });
  assert.equal(createFlags(storage).get('graphics3d'), true);
  flags.set('graphics3d', false);
  assert.equal(createFlags(storage).get('graphics3d'), false);
});

test('listeners hear changes only, and can stop listening', () => {
  const flags = createFlags(memoryStorage());
  const heard = [];
  const stop = flags.onChange((name, on) => heard.push([name, on]));
  flags.set('graphics3d', true);
  flags.set('graphics3d', true);
  flags.set('graphics3d', false);
  stop();
  flags.set('graphics3d', true);
  assert.deepEqual(heard, [['graphics3d', true], ['graphics3d', false]]);
});

test('?3d=1 and ?3d=0 in the address set the 3D flag and keep it', () => {
  const storage = memoryStorage();
  assert.equal(createFlags(storage, '?3d=1').get('graphics3d'), true);
  assert.equal(createFlags(storage, '').get('graphics3d'), true);
  assert.equal(createFlags(storage, '?seed=x&3d=off').get('graphics3d'), false);
  assert.equal(createFlags(storage).get('graphics3d'), false);
  // Anything else leaves the kept value alone.
  assert.equal(createFlags(storage, '?3d=maybe').get('graphics3d'), false);
});

test('broken or missing storage still gives working flags for the visit', () => {
  for (const storage of [memoryStorage(true), null]) {
    const flags = createFlags(storage, '?3d=1');
    assert.equal(flags.get('graphics3d'), true);
    flags.set('graphics3d', false);
    assert.equal(flags.get('graphics3d'), false);
  }
  const bad = memoryStorage();
  bad.setItem(FLAGS_KEY, '{not json');
  assert.equal(createFlags(bad).get('graphics3d'), false);
});

test('unknown flags are an error, not a silent false', () => {
  const flags = createFlags(null);
  assert.throws(() => flags.get('nope'));
  assert.throws(() => flags.set('nope', true));
});
