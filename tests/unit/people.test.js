import { test } from 'node:test';
import assert from 'node:assert/strict';
import { People, NO_PARENT } from '../../src/sim/people.js';

test('add stores every field; ids count up from 1 and the founders have no parent', () => {
  const p = new People(16);
  const a = p.add(7, 2, 30, 100, NO_PARENT);
  const b = p.add(8, 1, 0, 100, p.id[a]);
  assert.equal(NO_PARENT, 0);
  assert.deepEqual([p.id[a], p.id[b]], [1, 2]);
  assert.equal(p.parent[a], 0);
  assert.equal(p.parent[b], 1);
  assert.deepEqual([p.hex[a], p.civ[a], p.age[a], p.health[a], p.hunger[a], p.alive[a]], [7, 2, 30, 100, 0, 1]);
  assert.equal(p.count, 2);
  assert.equal(p.high, 2);
});

test('freed slots are reused before the pool grows; high stays put; ids are never reused', () => {
  const p = new People(16);
  for (let k = 0; k < 10; k++) p.add(0, 0, 20, 100, 0);
  p.remove(2); p.remove(5); p.remove(7);
  assert.equal(p.count, 7);
  assert.equal(p.high, 10);
  const slots = [p.add(1, 0, 0, 100, 1), p.add(1, 0, 0, 100, 1), p.add(1, 0, 0, 100, 1)];
  assert.deepEqual(slots.slice().sort(), [2, 5, 7]);
  assert.equal(p.high, 10, 'no growth while free slots exist');
  assert.equal(p.count, 10);
  assert.equal(p.freeTop, 0);
  const ids = new Set();
  for (let i = 0; i < p.high; i++) ids.add(p.id[i]);
  assert.equal(ids.size, 10, 'all ids distinct');
  assert.deepEqual([p.id[slots[0]], p.id[slots[1]], p.id[slots[2]]].sort((x, y) => x - y), [11, 12, 13]);
  const next = p.add(1, 0, 0, 100, 1);
  assert.equal(next, 10, 'a full pool takes a new slot');
  assert.equal(p.high, 11);
});

test('a reused slot is fully reset (hunger, alive, fields)', () => {
  const p = new People(16);
  const a = p.add(3, 1, 50, 20, 0);
  p.hunger[a] = 5;
  p.remove(a);
  assert.equal(p.alive[a], 0);
  const b = p.add(9, 0, 1, 100, 4);
  assert.equal(b, a);
  assert.deepEqual([p.alive[b], p.hunger[b], p.hex[b], p.civ[b], p.age[b], p.health[b], p.parent[b]], [1, 0, 9, 0, 1, 100, 4]);
});

test('no leaks: count + free slots = high through heavy churn, and the arrays grow only when needed', () => {
  const p = new People(16);
  let live = [];
  let peak = 0;
  let x = 12345;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let step = 0; step < 5000; step++) {
    if (live.length < 40 || rnd() < 0.5) live.push(p.add(0, 0, 0, 100, 0));
    else live.splice(Math.floor(rnd() * live.length), 1).forEach((s) => p.remove(s));
    peak = Math.max(peak, live.length);
    let alive = 0;
    for (let i = 0; i < p.high; i++) alive += p.alive[i];
    assert.equal(p.count, alive);
    assert.equal(p.count, live.length);
    assert.equal(p.count + p.freeTop, p.high);
  }
  assert.equal(p.high, peak, 'high equals the most people ever alive at once: no slot leaked');
});

test('growing the pool keeps every person intact', () => {
  const p = new People(16);
  const n = p.capacity * 3 + 1;
  for (let k = 0; k < n; k++) p.add(k, k % 5, k % 90, 100 - (k % 50), 0);
  assert.ok(p.capacity >= n);
  for (let k = 0; k < n; k++) {
    assert.equal(p.hex[k], k);
    assert.equal(p.civ[k], k % 5);
    assert.equal(p.age[k], k % 90);
    assert.equal(p.id[k], k + 1);
  }
  assert.equal(p.views()[0].length, p.high, 'views cover the used part only');
});
