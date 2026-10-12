// The look of the seasons on the 3D map and inside a hex (RULES.md "Feature
// flags"): fresh green in spring, golden-brown in autumn, snow in winter,
// each easing into the next across the season's edges. Pure maths on the
// sim's day of the year, unit-tested in Node.

import { DAYS_PER_YEAR } from '../sim/calendar.js';
import { COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT } from '../sim/terrain.js';

/** Snow lies fully from day 281 to 351 (days counted from 1) and fades over 30 days either side. */
export const SNOW = { centre: 315, flat: 35, fade: 30 };
/** Autumn colours are full from day 196 to 256 and fade over 30 days either side. */
export const AUTUMN = { centre: 225, flat: 30, fade: 30 };
/** Spring green is full from day 56 to 126 and fades over 35 days either side. */
export const SPRING = { centre: 90, flat: 35, fade: 35 };

export const SNOW_RGB = [238, 243, 250];
export const AUTUMN_RGB = [196, 142, 66];
export const SPRING_RGB = [96, 178, 84];

/** How white each terrain turns at full snow. Desert never does. */
export const SNOW_COVER = new Float32Array(TERRAIN_COUNT);
SNOW_COVER[TUNDRA] = 0.9; SNOW_COVER[MOUNTAIN] = 0.8; SNOW_COVER[HILLS] = 0.55;
SNOW_COVER[FOREST] = 0.45; SNOW_COVER[PLAINS] = 0.4; SNOW_COVER[COAST] = 0.2; SNOW_COVER[DESERT] = 0;
/** How far plants turn at full autumn and full spring. */
export const AUTUMN_TURN = 0.35;
export const SPRING_TURN = 0.15;
const PLANTS = new Uint8Array(TERRAIN_COUNT);
PLANTS[PLAINS] = 1; PLANTS[FOREST] = 1; PLANTS[HILLS] = 1;

/** The seasons' look fades out when a year passes faster than this many times a second, so it never flickers. */
export const FULL_BELOW_YPS = 0.5;
export const NONE_ABOVE_YPS = 2;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** 1 within `flat` days of `centre` (round the year), easing to 0 over the next `fade` days. */
function plateau(day, { centre, flat, fade }) {
  let d = Math.abs(day - centre) % DAYS_PER_YEAR;
  if (d > DAYS_PER_YEAR / 2) d = DAYS_PER_YEAR - d;
  return smooth(1 - (d - flat) / fade);
}

/**
 * How strong each season's look is on day `day` of the year (0 = the first
 * day of spring), scaled by `amount` (0 to 1, see seasonAmount).
 */
export function seasonLook(day, amount = 1) {
  return {
    snow: plateau(day, SNOW) * amount,
    autumn: plateau(day, AUTUMN) * amount,
    spring: plateau(day, SPRING) * amount,
  };
}

/** How much of the seasons' look to show when years pass at `yps` a second (0 when paused counts as slow). */
export function seasonAmount(yps) {
  if (!(yps > FULL_BELOW_YPS)) return 1;
  if (yps >= NONE_ABOVE_YPS) return 0;
  return smooth((NONE_ABOVE_YPS - yps) / (NONE_ABOVE_YPS - FULL_BELOW_YPS));
}

const mix = (a, b, t) => a + (b - a) * t;

/** Terrain colour `rgb` ([r, g, b], 0-255) of a tile of `terrain` under `look`, written into `out`. */
export function seasonRgb(terrain, rgb, look, out = [0, 0, 0]) {
  let [r, g, b] = rgb;
  if (PLANTS[terrain]) {
    const s = look.spring * SPRING_TURN;
    r = mix(r, SPRING_RGB[0], s); g = mix(g, SPRING_RGB[1], s); b = mix(b, SPRING_RGB[2], s);
    const a = look.autumn * AUTUMN_TURN;
    r = mix(r, AUTUMN_RGB[0], a); g = mix(g, AUTUMN_RGB[1], a); b = mix(b, AUTUMN_RGB[2], a);
  }
  const w = look.snow * SNOW_COVER[terrain];
  out[0] = mix(r, SNOW_RGB[0], w); out[1] = mix(g, SNOW_RGB[1], w); out[2] = mix(b, SNOW_RGB[2], w);
  return out;
}

/** Whether two looks differ enough to be worth repainting the map. */
export const looksDiffer = (a, b, eps = 0.01) =>
  !a || !b || Math.abs(a.snow - b.snow) > eps || Math.abs(a.autumn - b.autumn) > eps || Math.abs(a.spring - b.spring) > eps;
