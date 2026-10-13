// The 3D world's pure maths (src/render3d/diorama.js), against RULES.md "Feature flags".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_HEIGHT, tileHeight, homesFor, MAX_HOMES, HOME_SLOTS, boardBounds, riseAt, tiltAt, cameraPose,
  RISE_MS, FOV_DEG, FILL, TILE_BASE, borderEdges, borderQuad, HEX_CORNERS, BORDER_OUTER, BORDER_INNER, BORDER_CASING,
} from '../../src/render3d/diorama.js';
import { buildNeighbourTable } from '../../src/sim/hex.js';
import { DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA } from '../../src/sim/terrain.js';

test('tiles stand in the RULES.md order: water, coast, desert, plains, forest, tundra, hills, mountain', () => {
  const order = [DEEP_WATER, COAST, DESERT, PLAINS, FOREST, TUNDRA, HILLS, MOUNTAIN];
  for (let k = 1; k < order.length; k++) assert.ok(TILE_HEIGHT[order[k]] > TILE_HEIGHT[order[k - 1]], `terrain ${order[k]}`);
});

test('elevation raises land tiles but not water', () => {
  assert.equal(tileHeight(DEEP_WATER, 0), tileHeight(DEEP_WATER, 1));
  assert.ok(tileHeight(PLAINS, 1) > tileHeight(PLAINS, 0));
  assert.equal(tileHeight(PLAINS, 2), tileHeight(PLAINS, 1)); // clamped
});

test('homes by settlement tier: tent, then 2 for a Camp up to 5, tower from a Town', () => {
  assert.deepEqual(homesFor(-1, 0), { homes: 0, tents: false, tower: false });
  assert.deepEqual(homesFor(-1, 3), { homes: 1, tents: true, tower: false });
  assert.deepEqual(homesFor(0, 1), { homes: 2, tents: false, tower: false }); // Camp
  assert.deepEqual(homesFor(1, 12), { homes: 3, tents: false, tower: false }); // Village
  assert.deepEqual(homesFor(2, 30), { homes: 4, tents: false, tower: true }); // Town
  assert.deepEqual(homesFor(3, 60), { homes: 5, tents: false, tower: true }); // City
  assert.equal(homesFor(5, 200).homes, MAX_HOMES);
  assert.equal(HOME_SLOTS.length, MAX_HOMES);
  // Every home stands inside its hex (inner radius √3/2 of the unit hex).
  for (const [x, z] of HOME_SLOTS) assert.ok(Math.hypot(x, z) < 0.75);
});

test('the change takes 1.8 seconds; tiles rise from the middle out, flat at the start and full at the end', () => {
  assert.equal(RISE_MS, 1800);
  for (const d of [0, 0.5, 1]) {
    assert.equal(riseAt(0, d), 0);
    assert.equal(riseAt(1, d), 1);
  }
  assert.ok(riseAt(0.4, 0) > riseAt(0.4, 1));
  let prev = 0;
  for (let u = 0; u <= 1; u += 0.05) {
    const r = riseAt(u, 0.5);
    assert.ok(r >= prev);
    prev = r;
  }
  assert.equal(tiltAt(0), 0);
  assert.equal(tiltAt(1), 1);
});

test('straight down, the camera sits over the board centre at the distance that fits it like the 2D board', () => {
  const b = boardBounds(12, 12);
  for (const aspect of [7 / 6, 0.5, 2]) {
    const p = cameraPose(b, aspect, 0);
    assert.equal(p.x, b.cx);
    assert.equal(p.z, b.cz);
    const half = Math.tan((FOV_DEG * Math.PI) / 360);
    const seenD = 2 * p.y * half; // visible depth at the board plane
    const seenW = seenD * aspect;
    // The board just fits: FILL of the view along its tighter side.
    const fit = Math.max((b.d + TILE_BASE) / seenD, b.w / seenW);
    assert.ok(Math.abs(fit - FILL) < 1e-9, `aspect ${aspect}: ${fit}`);
  }
});

test('tilted, the camera moves south of the board and looks down at it', () => {
  const b = boardBounds(12, 12);
  const p = cameraPose(b, 7 / 6, 1);
  assert.ok(p.z > b.cz + b.d / 2);
  assert.ok(p.y > 0);
  const yawed = cameraPose(b, 7 / 6, 1, 0.2);
  assert.ok(Math.abs(Math.hypot(yawed.x - yawed.tx, yawed.z - yawed.tz) - Math.hypot(p.x - p.tx, p.z - p.tz)) < 1e-9);
});

test('3D empire borders run along every edge where a civ\'s land meets another civ, nobody or the map edge', () => {
  const cols = 5; const rows = 5;
  const civOf = new Int8Array(cols * rows).fill(-1);
  // A lone hex in the middle: all six edges.
  civOf[12] = 0;
  assert.deepEqual(borderEdges(civOf, cols, rows), [72, 73, 74, 75, 76, 77]);
  // Its neighbour joins the same civ: the shared edge goes from both sides.
  const nb = buildNeighbourTable(cols, rows);
  const east = nb[12 * 6];
  civOf[east] = 0;
  const two = borderEdges(civOf, cols, rows);
  assert.equal(two.length, 10);
  assert.ok(!two.includes(12 * 6) && !two.includes(east * 6 + 3));
  // Another civ next door: both sides of the meeting edge have a band.
  civOf[east] = 1;
  const both = borderEdges(civOf, cols, rows);
  assert.ok(both.includes(12 * 6) && both.includes(east * 6 + 3));
  // A corner hex borders the map's edge too.
  civOf.fill(-1); civOf[0] = 2;
  assert.equal(borderEdges(civOf, cols, rows).length, 6);
  civOf.fill(-1);
  assert.deepEqual(borderEdges(civOf, cols, rows), []);
});

test('3D border bands sit inside the tile, from 96% to 72% of the way out with a dark line to 67%, and meet at the corners', () => {
  assert.deepEqual([BORDER_OUTER, BORDER_INNER, BORDER_CASING], [0.96, 0.72, 0.67]);
  assert.ok(BORDER_OUTER < 0.965, 'inside the tile top');
  // Edge 0 faces east (direction 0): between corners 1 and 2, at x = cos 30°.
  const q = borderQuad(10, 20, 0, 1, 0.5);
  assert.deepEqual(q[0], [10 + HEX_CORNERS[1][0], 20 + HEX_CORNERS[1][1]]);
  assert.deepEqual(q[1], [10 + HEX_CORNERS[2][0], 20 + HEX_CORNERS[2][1]]);
  assert.ok(Math.abs(q[2][0] - (10 + HEX_CORNERS[2][0] / 2)) < 1e-12);
  // The band of edge 0 ends where the band of edge 1 begins.
  const next = borderQuad(10, 20, 1, 1, 0.5);
  assert.deepEqual(next[0], q[1]);
  assert.deepEqual(next[3], q[2]);
});
