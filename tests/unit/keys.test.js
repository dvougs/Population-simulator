// Keyboard map control (RULES.md "How civs and people look", Moving the map).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyPanStep, keyZoomStep, KEY_PAN_PX_S, KEY_FAST, KEY_ZOOM_PER_S } from '../../src/input/keys.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the speeds match RULES.md', () => {
  assert.equal(KEY_PAN_PX_S, 600);
  assert.equal(KEY_FAST, 2.5);
  assert.equal(KEY_ZOOM_PER_S, 2.5);
  assert.match(RULES, /arrow keys move the view the way they point for as long as they are held, 600 pixels a second \(2\.5 times as fast with Shift/);
  assert.match(RULES, /\+ and − zoom in and out about the middle of the open map, by 2\.5 times a second/);
});

test('each arrow moves the view its way: the map contents move the other way', () => {
  assert.deepEqual(keyPanStep(new Set(['ArrowRight']), 1000), { dx: -600, dy: -0 });
  assert.deepEqual(keyPanStep(new Set(['ArrowLeft']), 1000), { dx: 600, dy: -0 });
  assert.deepEqual(keyPanStep(new Set(['ArrowDown']), 1000), { dx: -0, dy: -600 });
  assert.deepEqual(keyPanStep(new Set(['ArrowUp']), 1000), { dx: -0, dy: 600 });
});

test('speed scales with time and Shift; diagonals keep the same speed; opposite arrows cancel', () => {
  const half = keyPanStep(new Set(['ArrowRight']), 500);
  assert.ok(close(half.dx, -300));
  const fast = keyPanStep(new Set(['ArrowRight']), 1000, true);
  assert.ok(close(fast.dx, -1500));
  const diag = keyPanStep(new Set(['ArrowRight', 'ArrowDown']), 1000);
  assert.ok(close(Math.hypot(diag.dx, diag.dy), 600));
  assert.ok(diag.dx < 0 && diag.dy < 0);
  const none = keyPanStep(new Set(['ArrowLeft', 'ArrowRight']), 1000);
  assert.equal(none.dx, 0);
  assert.equal(none.dy, 0);
  assert.deepEqual(keyPanStep(new Set(['a']), 1000), { dx: 0, dy: 0 });
});

test('+ zooms in and − out, 2.5 times a second', () => {
  assert.ok(close(keyZoomStep(new Set(['+']), 1000), 2.5));
  assert.ok(close(keyZoomStep(new Set(['=']), 1000), 2.5));
  assert.ok(close(keyZoomStep(new Set(['-']), 1000), 1 / 2.5));
  assert.ok(close(keyZoomStep(new Set(['+']), 500), Math.sqrt(2.5)));
  assert.equal(keyZoomStep(new Set(['+', '-']), 1000), 1);
  assert.equal(keyZoomStep(new Set(['ArrowUp']), 1000), 1);
});
