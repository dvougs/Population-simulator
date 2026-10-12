// The look of the seasons and the sun and moon on the 3D map (src/render3d/seasons.js, dayNight.js), against RULES.md "Feature flags".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seasonLook, seasonAmount, seasonRgb, looksDiffer, SNOW_RGB, SNOW_COVER, FULL_BELOW_YPS, NONE_ABOVE_YPS,
} from '../../src/render3d/seasons.js';
import { sunArc, moonArc, daylight, DAY_S, NIGHT_S, TWILIGHT_S } from '../../src/render3d/dayNight.js';
import { PLAINS, DESERT, TUNDRA, MOUNTAIN, FOREST } from '../../src/sim/terrain.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('snow lies fully days 281-351, autumn colours 196-256, spring green 56-126, each easing in and out', () => {
  // Days counted from 1 in RULES.md; day-of-year indices here count from 0.
  for (const d of [280, 315, 350]) assert.equal(seasonLook(d).snow, 1);
  for (const d of [195, 225, 255]) assert.equal(seasonLook(d).autumn, 1);
  for (const d of [55, 90, 125]) assert.equal(seasonLook(d).spring, 1);
  assert.equal(seasonLook(249).snow, 0);
  assert.equal(seasonLook(21).snow, 0);
  assert.equal(seasonLook(165).autumn, 0);
  assert.equal(seasonLook(160).spring, 0);
  assert.equal(seasonLook(20).spring, 0);
  // Late summer is plain terrain.
  assert.deepEqual(seasonLook(162), { snow: 0, autumn: 0, spring: 0 });
  // Smooth: no day jumps by more than a few percent.
  for (let d = 0; d < 360; d++) {
    const a = seasonLook(d); const b = seasonLook((d + 1) % 360);
    for (const k of ['snow', 'autumn', 'spring']) assert.ok(Math.abs(a[k] - b[k]) < 0.06, `${k} jumps at day ${d}`);
  }
});

test('the seasons fade out when years fly by, so they never flicker', () => {
  assert.equal(seasonAmount(0), 1);
  assert.equal(seasonAmount(FULL_BELOW_YPS), 1);
  assert.equal(seasonAmount(NONE_ABOVE_YPS), 0);
  assert.equal(seasonAmount(Infinity), 0);
  assert.equal(FULL_BELOW_YPS, 0.5);
  assert.equal(NONE_ABOVE_YPS, 2);
  // 1× to 20× (a year in 3 minutes to 9 s): full; 100× (a year in 1.8 s): nearly full; faster: none.
  assert.equal(seasonAmount(40 / 360), 1);
  const hundred = seasonAmount(200 / 360);
  assert.ok(hundred > 0.95 && hundred < 1);
  assert.ok(seasonAmount(1) > 0 && seasonAmount(1) < 1);
  assert.equal(seasonAmount(10), 0);
  assert.equal(seasonLook(315, 0.5).snow, 0.5);
});

test('snow whitens tundra and mountains most, never desert; plants turn in autumn', () => {
  const winter = { snow: 1, autumn: 0, spring: 0 };
  const grey = [100, 100, 100];
  const out = seasonRgb(TUNDRA, grey, winter);
  assert.ok(near(out[0], 100 + (SNOW_RGB[0] - 100) * 0.9, 1e-4));
  assert.ok(SNOW_COVER[TUNDRA] > SNOW_COVER[PLAINS] && SNOW_COVER[MOUNTAIN] > SNOW_COVER[FOREST]);
  assert.deepEqual(seasonRgb(DESERT, grey, winter), grey);
  assert.deepEqual(seasonRgb(DESERT, grey, { snow: 0, autumn: 1, spring: 1 }), grey);
  assert.notDeepEqual(seasonRgb(PLAINS, grey, { snow: 0, autumn: 1, spring: 0 }), grey);
  assert.deepEqual(seasonRgb(PLAINS, grey, { snow: 0, autumn: 0, spring: 0 }), grey);
  assert.equal(looksDiffer(winter, { ...winter }), false);
  assert.equal(looksDiffer(winter, { ...winter, snow: 0.9 }), true);
});

test('the sun crosses east to west through the day and the moon through the night, never jumping while lit', () => {
  const cycle = DAY_S + NIGHT_S;
  assert.equal(sunArc(-TWILIGHT_S / 2), 0); // rises at the start of dawn
  assert.ok(near(sunArc(DAY_S + TWILIGHT_S / 2 - 1e-9), 1, 1e-6)); // sets at the end of dusk
  assert.ok(near(sunArc((DAY_S) / 2), 0.5, 1e-9)); // overhead at midday
  for (let t = 0; t < 2 * cycle; t += 0.1) {
    const next = t + 0.1;
    if (daylight(t) > 0 && daylight(next) > 0) assert.ok(Math.abs(sunArc(next) - sunArc(t)) < 0.01, `sun jumps at ${t}`);
    if (daylight(t) < 1 && daylight(next) < 1) assert.ok(Math.abs(moonArc(next) - moonArc(t)) < 0.01, `moon jumps at ${t}`);
  }
});
