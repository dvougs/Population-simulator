// RULES.md "How civs and people look" (T-031 to T-034): ring arcs, territory edges and outlines, tint, flight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ringArcs, civMix, tintedRgb, territoryEdges, outlineSegments, outlineInset, TINT_AMOUNT,
  RING_RADIUS, RING_WIDTH, OUTLINE_WIDTH,
} from '../../src/render/territory.js';
import { PEOPLE_ZOOM_PX, PEOPLE_FLY_PX, peopleShown, driftLap, DRIFT_R, DRIFT_LAP_MIN_S, DRIFT_LAP_MAX_S } from '../../src/render/peopleLayer.js';
import { Camera, flightAt, FLY_MS } from '../../src/render/camera.js';
import { HEX_SIZE } from '../../src/render/layout.js';
import { CIV_STYLES } from '../../src/render/civStyle.js';
import { Simulation } from '../../src/sim/simulation.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('ring: 70% radius, 7% line; outline 10% wide (world units)', () => {
  assert.equal(RING_RADIUS, 0.7 * HEX_SIZE);
  assert.equal(RING_WIDTH, 0.07 * HEX_SIZE);
  assert.equal(OUTLINE_WIDTH, 0.1 * HEX_SIZE);
});

test('ringArcs: largest civ first, lower civ on a tie, clockwise from the top, sum to the whole circle', () => {
  const arcs = ringArcs(Int32Array.from([3, 8, 2, 8]), 4, 0);
  assert.deepEqual(arcs.map((a) => a.civ), [1, 3, 0, 2]);
  assert.equal(arcs[0].from, 0);
  assert.equal(arcs.at(-1).to, 1, 'exactly the whole circle');
  near(arcs[0].to, 8 / 21); near(arcs[1].to, 16 / 21); near(arcs[2].to, 19 / 21);
  for (let i = 1; i < arcs.length; i++) assert.equal(arcs[i].from, arcs[i - 1].to);
  assert.deepEqual(ringArcs(new Int32Array(4), 4, 0), []);
  assert.deepEqual(ringArcs(Int32Array.from([0, 0, 5, 0]), 4, 0), [{ civ: 2, from: 0, to: 1 }]);
});

test('ringArcs reads the hex-major layout (hexCivPop[h × civs + c])', () => {
  const pop = Int32Array.from([1, 0, 0, 2, 5, 5]);
  assert.deepEqual(ringArcs(pop, 2, 1).map((a) => a.civ), [1]);
  assert.deepEqual(ringArcs(pop, 2, 2).map((a) => a.civ), [0, 1], 'tie: lower civ first');
});

test('tint: 70% terrain + 30% share-weighted civ mix', () => {
  assert.equal(TINT_AMOUNT, 0.3);
  assert.ok(TINT_AMOUNT <= 0.35);
  const m = civMix(Int32Array.from([1, 1]), 2, 0);
  const [a, b] = [CIV_STYLES[0].rgb, CIV_STYLES[1].rgb];
  near(m[0], (a[0] + b[0]) / 2); near(m[1], (a[1] + b[1]) / 2); near(m[2], (a[2] + b[2]) / 2);
  assert.deepEqual(m, [144, 95.5, 162.5]);
  assert.deepEqual(tintedRgb([100, 100, 100], Int32Array.from([1, 0]), 2, 0), [139, 87, 91]);
  assert.deepEqual(tintedRgb([100, 100, 100], Int32Array.from([0, 0]), 2, 0), [100, 100, 100], 'empty hex untinted');
  assert.equal(civMix(Int32Array.from([0, 0]), 2, 0), null);
  // Weights follow shares: 3:1 is closer to civ 1's colour than 1:1.
  const w = civMix(Int32Array.from([3, 1]), 2, 0);
  near(w[0], (3 * a[0] + b[0]) / 4);
});

// 5 x 5 map; civs=1; hexCivPop marks which hexes the civ holds.
const held = (...hexes) => { const p = new Int32Array(25); for (const h of hexes) p[h] = 1; return p; };

test('territoryEdges: only edges between a held hex and one not held (or off the map)', () => {
  assert.equal(territoryEdges(held(12), 1, 5, 5, 0).length, 6);
  assert.equal(territoryEdges(held(12, 13), 1, 5, 5, 0).length, 10, 'shared edge not drawn from either side');
  assert.equal(territoryEdges(held(), 1, 5, 5, 0).length, 0);
  const corner = territoryEdges(held(0), 1, 5, 5, 0);
  assert.equal(corner.length, 6, 'off-map edges count as edges');
  assert.deepEqual(corner.map((e) => Math.floor(e / 6)), [0, 0, 0, 0, 0, 0]);
  // Whole map held: only the map border remains.
  const all = new Int32Array(25).fill(1);
  const border = territoryEdges(all, 1, 5, 5, 0);
  for (const e of border) assert.ok(Math.floor(e / 6) % 5 === 0 || Math.floor(e / 6) % 5 === 4 || Math.floor(e / 6) < 5 || Math.floor(e / 6) >= 20);
  // Another civ's hexes are ignored.
  const two = Int32Array.from({ length: 50 }, (_, i) => (i === 24 ? 1 : i === 25 ? 7 : 0));
  assert.equal(territoryEdges(two, 2, 5, 5, 0).length, 6);
});

test('outlineInset: (1/2 + (civ − 1) mod 4) × line width = 1.6, 4.8, 8.0, 11.2 repeating', () => {
  const want = [1.6, 4.8, 8.0, 11.2];
  for (let c = 0; c < 8; c++) near(outlineInset(c), want[c % 4], 1e-9);
});

test('outlineSegments: a single hex at inset 4 lies at apothem − 4 from the centre', () => {
  const seg = outlineSegments(held(12), 1, 5, 5, 0, 4);
  assert.equal(seg.length, 24);
  const apothem = (Math.sqrt(3) / 2) * HEX_SIZE;
  // Hex 12 is row 2, col 2 (even row): centre x = sqrt3 * 32 * (q + r/2) with q = 1.
  const cx = Math.sqrt(3) * HEX_SIZE * 2;
  const cy = 1.5 * HEX_SIZE * 2;
  for (let e = 0; e < 6; e++) {
    const mx = (seg[e * 4] + seg[e * 4 + 2]) / 2 - cx;
    const my = (seg[e * 4 + 1] + seg[e * 4 + 3]) / 2 - cy;
    near(Math.sqrt(mx * mx + my * my), apothem - 4, 1e-3);
  }
  near(apothem - 4, 23.713, 1e-3);
});

test('outlineSegments: an L-shaped territory forms a closed loop (every endpoint exactly twice)', () => {
  const seg = outlineSegments(held(12, 13, 7), 1, 5, 5, 0, 4);
  const count = new Map();
  for (let i = 0; i < seg.length; i += 2) {
    const k = `${seg[i].toFixed(3)},${seg[i + 1].toFixed(3)}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  assert.equal(seg.length / 4, territoryEdges(held(12, 13, 7), 1, 5, 5, 0).length);
  for (const [k, n] of count) assert.equal(n, 2, k);
});

test('map-edge territory of a seeded run only uses held hexes', () => {
  const sim = new Simulation({ seed: 'terr', size: 10, civCount: 3 });
  sim.tick(60);
  const pop = sim.population();
  for (let c = 0; c < 3; c++) {
    const edges = territoryEdges(pop.hexCivPop, 3, sim.map.cols, sim.map.rows, c);
    for (const e of edges) assert.ok(pop.hexCivPop[Math.floor(e / 6) * 3 + c] > 0);
    assert.ok(edges.length >= 6 || sim.civHexes[c] === 0);
  }
});

test('people threshold 120 px corner to corner; drift radius and lap; fly size', () => {
  assert.equal(PEOPLE_ZOOM_PX, 120);
  assert.equal(PEOPLE_FLY_PX, 180);
  assert.equal(peopleShown(120 / 64), true);
  assert.equal(peopleShown(119.9 / 64), false);
  assert.equal(DRIFT_R, 0.1 * HEX_SIZE);
  assert.equal(DRIFT_LAP_MIN_S, 4);
  assert.equal(DRIFT_LAP_MAX_S, 8);
  const laps = new Set();
  for (let id = 1; id <= 2000; id++) {
    const l = driftLap(id);
    assert.ok(l >= 4 && l <= 8, `lap ${l}`);
    assert.equal(l, driftLap(id), 'deterministic');
    laps.add(Math.round(l * 10));
  }
  assert.ok(laps.size > 20, 'laps spread over 4 to 8 s');
});

test('flightAt: endpoints, monotonic progress and geometric zoom; FLY_MS is 0.4 s', () => {
  assert.equal(FLY_MS, 400);
  const from = { x: 10, y: 20 }; const to = { x: 110, y: -80 };
  const s = flightAt(from, to, 1, 4, 0);
  assert.deepEqual([s.scale, s.wx, s.wy], [1, 10, 20]);
  const e = flightAt(from, to, 1, 4, 1);
  near(e.scale, 4); near(e.wx, 110); near(e.wy, -80);
  assert.deepEqual(flightAt(from, to, 1, 4, -1), s);
  let prev = flightAt(from, to, 1, 4, 0);
  for (let i = 1; i <= 20; i++) {
    const f = flightAt(from, to, 1, 4, i / 20);
    assert.ok(f.scale >= prev.scale && f.wx >= prev.wx && f.wy <= prev.wy);
    prev = f;
  }
  const same = flightAt(from, to, 2, 2, 0.5);
  near(same.scale, 2);
});

test('Camera.viewAt puts a world point at a screen point at a scale, without clamping', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  cam.viewAt(100, 50, 3, 200, 300);
  assert.equal(cam.scale, 3);
  assert.deepEqual(cam.worldToScreen(100, 50), { x: 200, y: 300 });
  cam.viewAt(-5000, 5000, 2, 10, 10);
  assert.deepEqual(cam.worldToScreen(-5000, 5000), { x: 10, y: 10 });
});
