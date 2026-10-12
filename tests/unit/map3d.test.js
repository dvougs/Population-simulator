// The game's 3D map view maths: the camera's north-south squash (Camera.ky) and
// taps following the line of sight (diorama.rayHex), against RULES.md "Feature flags".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../../src/render/camera.js';
import { worldBounds, hexCentre, HEX_SIZE } from '../../src/render/layout.js';
import { GAME_TILT_DEG, VIEW_PLANE, MAX_TOP, tiltKy, rayHex } from '../../src/render3d/diorama.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('the 3D map looks down 45 degrees from straight down', () => {
  assert.equal(GAME_TILT_DEG, 45);
  assert.ok(near(tiltKy(), Math.SQRT1_2));
  assert.equal(tiltKy(0), 1);
});

test('with ky 1 the camera maps exactly as before', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  cam.setBounds(worldBounds(20, 20));
  cam.fit();
  const w = cam.screenToWorld(123, 456);
  const s = cam.worldToScreen(w.x, w.y);
  assert.ok(near(s.x, 123) && near(s.y, 456));
  assert.ok(near((456 - cam.y) / cam.scale, w.y));
});

test('squashed, screen and world points still map both ways, and north-south distances shrink by ky', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  cam.setBounds(worldBounds(20, 20));
  cam.ky = tiltKy();
  cam.fit();
  const w = cam.screenToWorld(200, 300);
  const s = cam.worldToScreen(w.x, w.y);
  assert.ok(near(s.x, 200) && near(s.y, 300));
  const a = cam.worldToScreen(0, 0); const b = cam.worldToScreen(0, 100);
  assert.ok(near(b.y - a.y, 100 * cam.scale * cam.ky));
});

test('fit centres the squashed map in the view', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  const bounds = worldBounds(20, 20);
  cam.setBounds(bounds);
  cam.ky = tiltKy();
  cam.fit();
  const top = cam.worldToScreen(bounds.minX, bounds.minY);
  const bottom = cam.worldToScreen(bounds.maxX, bounds.maxY);
  assert.ok(near((top.y + bottom.y) / 2, 400, 1e-6));
  assert.ok(near((top.x + bottom.x) / 2, 200, 1e-6));
});

test('changing ky keeps the middle of the view on the same world point', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  cam.setBounds(worldBounds(20, 20));
  cam.fit();
  const before = cam.screenToWorld(200, 400);
  cam.setKy(tiltKy());
  const after = cam.screenToWorld(200, 400);
  assert.ok(near(before.x, after.x, 1e-6) && near(before.y, after.y, 1e-6));
});

test('zooming keeps the point under the fingers fixed when squashed', () => {
  const cam = new Camera();
  cam.setView(400, 800);
  cam.setBounds(worldBounds(20, 20));
  cam.ky = tiltKy();
  cam.fit();
  const w = cam.screenToWorld(150, 420);
  cam.zoomAt(1.5, 150, 420);
  const s = cam.worldToScreen(w.x, w.y);
  assert.ok(near(s.x, 150, 1e-6) && near(s.y, 420, 1e-6));
});

/** Ground-plane point (hex radii) where the line of sight meets tile i's top at its centre. */
function sightOf(cols, i, top) {
  const c = hexCentre(cols, i);
  const tan = Math.tan((GAME_TILT_DEG * Math.PI) / 180);
  return { x: c.x / HEX_SIZE, z: c.y / HEX_SIZE - (top - VIEW_PLANE) * tan };
}

test('on flat ground a tap hits the hex it is over', () => {
  const cols = 10; const rows = 10;
  const top = () => VIEW_PLANE;
  for (const i of [0, 11, 45, 99]) {
    const p = sightOf(cols, i, VIEW_PLANE);
    assert.equal(rayHex(cols, rows, p.x, p.z, top), i);
  }
});

test('a tap on a tall tile hits that tile, not the low ground behind it', () => {
  const cols = 10; const rows = 10;
  const tall = 44;
  const top = (i) => (i === tall ? MAX_TOP : 0.2);
  const p = sightOf(cols, tall, MAX_TOP);
  assert.equal(rayHex(cols, rows, p.x, p.z, top), tall);
  // Without the tall tile the same tap lands further north.
  assert.notEqual(rayHex(cols, rows, p.x, p.z, () => 0), tall);
});

test('a tap off the map hits nothing', () => {
  assert.equal(rayHex(10, 10, -50, -50, () => 0.4), -1);
});
