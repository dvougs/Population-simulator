import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS, offsetToAxial, axialToOffset, axialToIndex, indexToAxial, inBounds,
  neighbours, buildNeighbourTable, distance, hexToPixel, pixelToHex, roundAxial,
  hexCorners, mapBounds, SQRT3,
} from '../../src/sim/hex.js';

// Deterministic generator for sample points (no Math.random in tests).
function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// RULES.md "The map": odd rows are shifted half a hex to the right, so the six
// neighbours in offset coordinates depend on whether the row is odd.
function expectedOffsetNeighbours(col, row, cols, rows) {
  const odd = row & 1;
  const deltas = odd
    ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return deltas
    .map(([dc, dr]) => [col + dc, row + dr])
    .filter(([c, r]) => inBounds(c, r, cols, rows))
    .map(([c, r]) => r * cols + c)
    .sort((a, b) => a - b);
}

test('offset ↔ axial round trip for every hex of a 50 × 50 map', () => {
  for (let row = 0; row < 50; row++) {
    for (let col = 0; col < 50; col++) {
      const { q, r } = offsetToAxial(col, row);
      assert.equal(r, row);
      assert.deepEqual(axialToOffset(q, r), { col, row });
      const i = row * 50 + col;
      assert.equal(axialToIndex(q, r, 50, 50), i, 'index = row × size + col');
      assert.deepEqual(indexToAxial(i, 50), { q, r });
    }
  }
});

test('odd-r layout: known offset → axial values', () => {
  assert.deepEqual(offsetToAxial(0, 0), { q: 0, r: 0 });
  assert.deepEqual(offsetToAxial(0, 1), { q: 0, r: 1 });
  assert.deepEqual(offsetToAxial(0, 2), { q: -1, r: 2 });
  assert.deepEqual(offsetToAxial(3, 3), { q: 2, r: 3 });
  assert.deepEqual(offsetToAxial(5, 4), { q: 3, r: 4 });
});

test('odd rows are drawn half a hex to the right of even rows', () => {
  const size = 1;
  const even = hexToPixel(...Object.values(offsetToAxial(2, 0)), size);
  const odd = hexToPixel(...Object.values(offsetToAxial(2, 1)), size);
  const even2 = hexToPixel(...Object.values(offsetToAxial(2, 2)), size);
  assert.ok(Math.abs(odd.x - even.x - (SQRT3 / 2) * size) < 1e-12);
  assert.ok(Math.abs(even2.x - even.x) < 1e-12);
});

test('axialToIndex is -1 off the map', () => {
  assert.equal(axialToIndex(-1, 0, 10, 10), -1);
  assert.equal(axialToIndex(10, 0, 10, 10), -1);
  assert.equal(axialToIndex(0, -1, 10, 10), -1);
  assert.equal(axialToIndex(0, 10, 10, 10), -1);
  // (col 0, row 2) is axial (-1, 2): on the map although q < 0.
  assert.equal(axialToIndex(-1, 2, 10, 10), 20);
});

test('DIRECTIONS are the six unit axial steps', () => {
  assert.equal(DIRECTIONS.length, 6);
  const keys = new Set(DIRECTIONS.map(([q, r]) => `${q},${r}`));
  assert.equal(keys.size, 6);
  for (const [q, r] of DIRECTIONS) assert.equal(distance(0, 0, q, r), 1);
});

test('neighbours: up to 6, none off the map, matching odd-r layout', () => {
  for (const [cols, rows] of [[10, 10], [11, 7], [50, 50]]) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const { q, r } = offsetToAxial(col, row);
        const got = neighbours(q, r, cols, rows).map((h) => axialToIndex(h.q, h.r, cols, rows)).sort((a, b) => a - b);
        assert.ok(got.every((i) => i >= 0));
        assert.deepEqual(got, expectedOffsetNeighbours(col, row, cols, rows), `(${col}, ${row}) on ${cols}×${rows}`);
        const interior = col > 0 && row > 0 && col < cols - 1 && row < rows - 1;
        if (interior) assert.equal(got.length, 6);
        else assert.ok(got.length >= 2 && got.length < 6, `edge hex (${col}, ${row}) has ${got.length}`);
      }
    }
  }
});

test('neighbour counts at the corners of a 10 × 10 map', () => {
  const count = (col, row) => neighbours(...Object.values(offsetToAxial(col, row)), 10, 10).length;
  assert.equal(count(0, 0), 2); // even row, left edge
  assert.equal(count(9, 0), 3);
  assert.equal(count(0, 9), 3); // odd row is shifted right, so it reaches up-right too
  assert.equal(count(9, 9), 2);
  assert.equal(count(5, 0), 4);
  assert.equal(count(0, 4), 3);
  assert.equal(count(0, 5), 5);
});

test('buildNeighbourTable matches neighbours() direction by direction and is symmetric', () => {
  const cols = 13, rows = 9;
  const table = buildNeighbourTable(cols, rows);
  assert.ok(table instanceof Int32Array);
  assert.equal(table.length, cols * rows * 6);
  for (let i = 0; i < cols * rows; i++) {
    const { q, r } = indexToAxial(i, cols);
    for (let k = 0; k < 6; k++) {
      const j = table[i * 6 + k];
      assert.equal(j, axialToIndex(q + DIRECTIONS[k][0], r + DIRECTIONS[k][1], cols, rows));
      if (j >= 0) {
        // The opposite direction leads back.
        assert.equal(table[j * 6 + ((k + 3) % 6)], i);
      }
    }
    const listed = [];
    for (let k = 0; k < 6; k++) if (table[i * 6 + k] >= 0) listed.push(table[i * 6 + k]);
    const fromFn = neighbours(q, r, cols, rows).map((h) => axialToIndex(h.q, h.r, cols, rows));
    assert.deepEqual(listed.sort((a, b) => a - b), fromFn.sort((a, b) => a - b));
  }
});

test('distance is the number of steps through neighbours (BFS on the map)', () => {
  const cols = 15, rows = 12;
  const table = buildNeighbourTable(cols, rows);
  for (const src of [0, 7, 47, 100, cols * rows - 1]) {
    const dist = new Int32Array(cols * rows).fill(-1);
    dist[src] = 0;
    const queue = [src];
    while (queue.length) {
      const i = queue.shift();
      for (let k = 0; k < 6; k++) {
        const j = table[i * 6 + k];
        if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
      }
    }
    const a = indexToAxial(src, cols);
    for (let j = 0; j < cols * rows; j++) {
      const b = indexToAxial(j, cols);
      assert.equal(distance(a.q, a.r, b.q, b.r), dist[j], `${src} → ${j}`);
    }
  }
});

test('distance: zero to itself, symmetric, triangle inequality, known values', () => {
  assert.equal(distance(3, -2, 3, -2), 0);
  assert.equal(distance(0, 0, 3, 0), 3);
  assert.equal(distance(0, 0, 0, 4), 4);
  assert.equal(distance(0, 0, 2, -5), 5);
  assert.equal(distance(0, 0, -3, 3), 3);
  const rnd = lcg(42);
  const p = () => [Math.floor(rnd() * 40) - 20, Math.floor(rnd() * 40) - 20];
  for (let k = 0; k < 300; k++) {
    const [a, b, c] = [p(), p(), p()];
    assert.equal(distance(...a, ...b), distance(...b, ...a));
    assert.ok(distance(...a, ...c) <= distance(...a, ...b) + distance(...b, ...c));
  }
});

test('hexToPixel: pointy-top spacing (√3·size across, 1.5·size down)', () => {
  const s = 10;
  assert.deepEqual(hexToPixel(0, 0, s), { x: 0, y: 0 });
  const e = hexToPixel(1, 0, s);
  assert.ok(Math.abs(e.x - SQRT3 * s) < 1e-9 && e.y === 0);
  const se = hexToPixel(0, 1, s);
  assert.ok(Math.abs(se.x - (SQRT3 / 2) * s) < 1e-9 && Math.abs(se.y - 15) < 1e-9);
  // Every neighbour centre is √3·size away.
  for (const [dq, dr] of DIRECTIONS) {
    const c = hexToPixel(dq, dr, s);
    assert.ok(Math.abs(Math.sqrt(c.x * c.x + c.y * c.y) - SQRT3 * s) < 1e-9);
  }
});

test('pixel → hex round trip: every hex centre maps back to its hex', () => {
  for (const size of [1, 7.5, 32]) {
    for (let i = 0; i < 50 * 50; i++) {
      const { q, r } = indexToAxial(i, 50);
      const c = hexToPixel(q, r, size);
      assert.deepEqual(pixelToHex(c.x, c.y, size), { q, r });
    }
  }
});

test('pixelToHex returns the hex whose centre is nearest (points inside the hex)', () => {
  const size = 20;
  const rnd = lcg(7);
  for (let k = 0; k < 3000; k++) {
    const x = (rnd() - 0.5) * 800;
    const y = (rnd() - 0.5) * 800;
    const h = pixelToHex(x, y, size);
    assert.ok(Number.isInteger(h.q) && Number.isInteger(h.r));
    const c = hexToPixel(h.q, h.r, size);
    const d0 = (x - c.x) ** 2 + (y - c.y) ** 2;
    for (const [dq, dr] of DIRECTIONS) {
      const n = hexToPixel(h.q + dq, h.r + dr, size);
      const d1 = (x - n.x) ** 2 + (y - n.y) ** 2;
      assert.ok(d0 <= d1 + 1e-6, `(${x}, ${y}) closer to a neighbour of ${h.q},${h.r}`);
    }
  }
});

test('pixelToHex near corners stays inside the hex (0.95 × size from centre)', () => {
  const size = 10;
  for (let i = 0; i < 100; i++) {
    const { q, r } = indexToAxial(i, 10);
    const c = hexToPixel(q, r, size);
    const corners = hexCorners(c.x, c.y, size);
    for (let k = 0; k < 6; k++) {
      const x = c.x + (corners[2 * k] - c.x) * 0.95;
      const y = c.y + (corners[2 * k + 1] - c.y) * 0.95;
      assert.deepEqual(pixelToHex(x, y, size), { q, r });
    }
  }
});

test('roundAxial gives integers, never -0', () => {
  const h = roundAxial(-0.2, 0.1);
  assert.ok(Object.is(h.q, 0) && Object.is(h.r, 0));
  assert.deepEqual(roundAxial(1.4, -0.3), { q: 1, r: 0 });
});

test('hexCorners: 6 corners clockwise from the top, each size from the centre', () => {
  const c = hexCorners(5, 7, 10);
  assert.equal(c.length, 12);
  assert.ok(Math.abs(c[0] - 5) < 1e-12 && Math.abs(c[1] - (7 - 10)) < 1e-12, 'first corner at the top');
  for (let k = 0; k < 6; k++) {
    const dx = c[2 * k] - 5, dy = c[2 * k + 1] - 7;
    assert.ok(Math.abs(Math.sqrt(dx * dx + dy * dy) - 10) < 1e-9);
  }
  // Clockwise on screen (y down): positive signed area with this orientation.
  let area = 0;
  for (let k = 0; k < 6; k++) {
    const j = (k + 1) % 6;
    area += c[2 * k] * c[2 * j + 1] - c[2 * j] * c[2 * k + 1];
  }
  assert.ok(area > 0);
  // Neighbouring hexes share an edge: corners 1 and 2 of (0,0) are corners 5 and 4 of (1,0).
  const a = hexCorners(0, 0, 10);
  const e = hexToPixel(1, 0, 10);
  const b = hexCorners(e.x, e.y, 10);
  assert.ok(Math.abs(a[2] - b[10]) < 1e-9 && Math.abs(a[3] - b[11]) < 1e-9);
  assert.ok(Math.abs(a[4] - b[8]) < 1e-9 && Math.abs(a[5] - b[9]) < 1e-9);
});

test('mapBounds is the tight box around every corner of the map', () => {
  for (const [cols, rows, size] of [[10, 10, 1], [50, 50, 12], [7, 1, 3], [1, 2, 5]]) {
    const b = mapBounds(cols, rows, size);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < cols * rows; i++) {
      const { q, r } = indexToAxial(i, cols);
      const c = hexToPixel(q, r, size);
      const k = hexCorners(c.x, c.y, size);
      for (let j = 0; j < 12; j += 2) {
        minX = Math.min(minX, k[j]); maxX = Math.max(maxX, k[j]);
        minY = Math.min(minY, k[j + 1]); maxY = Math.max(maxY, k[j + 1]);
      }
    }
    const close = (a, e) => Math.abs(a - e) < 1e-9;
    assert.ok(close(b.minX, minX) && close(b.minY, minY) && close(b.maxX, maxX) && close(b.maxY, maxY),
      `${cols}×${rows}: ${JSON.stringify(b)} vs ${JSON.stringify({ minX, minY, maxX, maxY })}`);
  }
});
