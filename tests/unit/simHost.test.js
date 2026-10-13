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
    seed: 'prev', size: 14, water: 0.3, mountains: 0.12, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15, landShape: 'continent',
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

// RULES.md "How civs and people look": the hex card, its people list and the person card.
function grown() {
  const host = new LocalSimHost();
  host.start({ seed: 'people-api', size: 16, civCount: 3, startPop: 40 });
  host.tick(60);
  return host;
}

test('population(): people per civ per hex add up to the live people, and the arrays are copies', () => {
  const host = grown();
  const pop = host.population();
  cloneable(pop);
  const n = host.map().cols * host.map().rows;
  assert.equal(pop.civs, 3);
  assert.equal(pop.hexCivPop.length, n * 3);
  const live = new Int32Array(n);
  for (let i = 0; i < pop.high; i++) if (pop.alive[i]) live[pop.hex[i]]++;
  let total = 0;
  for (let h = 0; h < n; h++) {
    let sum = 0;
    for (let c = 0; c < 3; c++) sum += pop.hexCivPop[h * 3 + c];
    assert.equal(sum, live[h], `hex ${h}`);
    total += sum;
  }
  assert.equal(total, host.stats().totalPop);
  // Per civ too.
  for (let c = 0; c < 3; c++) {
    let byCiv = 0;
    for (let i = 0; i < pop.high; i++) if (pop.alive[i] && pop.civ[i] === c) byCiv++;
    let fromHex = 0;
    for (let h = 0; h < n; h++) fromHex += pop.hexCivPop[h * 3 + c];
    assert.equal(fromHex, byCiv);
  }
  const before = host.population();
  pop.hexCivPop.fill(99); pop.alive.fill(0); pop.hex.fill(0);
  assert.deepEqual(host.population(), before, 'mutating the result does not touch the sim');
  assert.equal(new LocalSimHost().population(), null);
});

test('person(slot, id): details of a living person; null for a wrong id, a dead or out-of-range slot', () => {
  const host = grown();
  const pop = host.population();
  let founder = -1; let child = -1;
  for (let i = 0; i < pop.high; i++) {
    if (!pop.alive[i]) continue;
    const p = host.person(i, pop.id[i]);
    if (p.parent === null && founder < 0) founder = i;
    if (p.parent !== null && p.parentAlive && child < 0) child = i;
  }
  assert.ok(child >= 0, 'someone has a living parent after 60 years');
  const c = host.person(child, pop.id[child]);
  cloneable(c);
  assert.equal(c.slot, child);
  assert.equal(c.id, pop.id[child]);
  assert.equal(c.civ, pop.civ[child]);
  assert.equal(c.civName, host.stats().civs[pop.civ[child]].name);
  assert.equal(c.hex, pop.hex[child]);
  assert.equal(c.col + c.row * host.map().cols, c.hex);
  // The parent's living-children count is the living people whose parent is them.
  const parentSlot = [...pop.id].findIndex((id, i) => pop.alive[i] && id === c.parent);
  assert.ok(parentSlot >= 0);
  const parent = host.person(parentSlot, c.parent);
  let kids = 0;
  for (let i = 0; i < pop.high; i++) if (pop.alive[i] && host.person(i, pop.id[i]).parent === c.parent) kids++;
  assert.ok(kids >= 1);
  assert.equal(parent.children, kids);
  if (founder >= 0) {
    const f = host.person(founder, pop.id[founder]);
    assert.equal(f.parent, null);
    assert.equal(f.parentAlive, null);
  }
  assert.equal(host.person(child, pop.id[child] + 100000), null, 'wrong id');
  assert.equal(host.person(-1, 1), null);
  assert.equal(host.person(pop.high, 1), null);
  assert.equal(host.person(1.5, pop.id[1]), null);
  const dead = [...pop.alive].findIndex((a, i) => !a && i < pop.high);
  if (dead >= 0) assert.equal(host.person(dead, pop.id[dead]), null, 'dead slot');
  assert.equal(new LocalSimHost().person(0, 1), null);
});

test('hexPeople(col, row, limit): lowest id first, total counts everyone, limit respected, null off the map', () => {
  const host = grown();
  const pop = host.population();
  const cols = host.map().cols;
  let best = 0;
  for (let h = 1; h < cols * cols; h++) {
    let a = 0; let b = 0;
    for (let c = 0; c < 3; c++) { a += pop.hexCivPop[h * 3 + c]; b += pop.hexCivPop[best * 3 + c]; }
    if (a > b) best = h;
  }
  const col = best % cols; const row = Math.floor(best / cols);
  const all = host.hexPeople(col, row, 100000);
  cloneable(all);
  const ids = [];
  for (let i = 0; i < pop.high; i++) if (pop.alive[i] && pop.hex[i] === best) ids.push(pop.id[i]);
  ids.sort((x, y) => x - y);
  assert.ok(ids.length > 3);
  assert.equal(all.index, best);
  assert.equal(all.total, ids.length);
  assert.deepEqual(all.people.map((p) => p.id), ids);
  for (const p of all.people) {
    assert.equal(pop.id[p.slot], p.id);
    assert.equal(pop.civ[p.slot], p.civ);
  }
  const few = host.hexPeople(col, row, 3);
  assert.equal(few.total, ids.length);
  assert.deepEqual(few.people.map((p) => p.id), ids.slice(0, 3));
  assert.equal(host.hexPeople(col, row, 0).people.length, 0);
  assert.equal(host.hexPeople(col, row).people.length, Math.min(100, ids.length), 'default limit 100');
  assert.equal(host.hexPeople(-1, 0, 10), null);
  assert.equal(host.hexPeople(cols, 0, 10), null);
  assert.equal(host.hexPeople(0, cols, 10), null);
  const water = host.hexPeople(0, 0, 10);
  assert.equal(water.total, 0);
  assert.deepEqual(water.people, []);
});

test('RULES.md "Start hexes": the host shows where each civ will start and which starts were chosen', () => {
  const host = new LocalSimHost();
  const auto = host.starts({ seed: 'hs', civCount: 3 });
  assert.equal(auto.starts.length, 3);
  assert.deepEqual(auto.chosen, [false, false, false]);
  cloneable(auto);
  const pick = auto.starts[0];
  const moved = host.starts({ seed: 'hs', civCount: 3, starts: [-1, pick, -1] });
  assert.equal(moved.starts[1], pick);
  assert.deepEqual(moved.chosen, [false, true, false]);
  assert.notEqual(moved.starts[0], pick, 'civ 0 is placed elsewhere');
  host.start({ seed: 'hs', civCount: 3, starts: [-1, pick, -1] });
  assert.deepEqual([...host.sim.starts], moved.starts, 'the game starts where the preview showed');
});
