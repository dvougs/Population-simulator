// The maths behind the 3D world (RULES.md "Feature flags"): how tall each
// tile stands, how many homes a hex shows, where they sit, how the tiles rise
// out of the flat map and where the camera looks from. No three.js here, so it
// is unit-tested in Node and the 3D scenes all build the same diorama.
//
// Units: one hex has radius 1 (the 2D map's HEX_SIZE world pixels), x runs
// east and z runs south as the 2D map's y does, and y is up.

import { HEX_SIZE, worldBounds } from '../render/layout.js';
import { DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, TERRAIN_COUNT } from '../sim/terrain.js';

/** Height of a tile's top above the board's base plane, by terrain (hex radii). */
export const TILE_HEIGHT = (() => {
  const h = new Array(TERRAIN_COUNT).fill(0.4);
  h[DEEP_WATER] = 0.14;
  h[COAST] = 0.3;
  h[PLAINS] = 0.38;
  h[DESERT] = 0.36;
  h[FOREST] = 0.42;
  h[TUNDRA] = 0.44;
  h[HILLS] = 0.62;
  h[MOUNTAIN] = 0.82;
  return Object.freeze(h);
})();
/** Land tiles also stand up to this much taller with the map's elevation (0 to 1). */
export const ELEVATION_LIFT = 0.25;
/** Every tile reaches this far below the base plane, so the board has a visible edge. */
export const TILE_BASE = 0.3;

/** Top of tile `i` (hex radii), at full rise. */
export function tileHeight(terrain, elevation) {
  const h = TILE_HEIGHT[terrain];
  if (terrain === DEEP_WATER) return h;
  const e = elevation === undefined ? 0.5 : Math.max(0, Math.min(1, elevation));
  return h + ELEVATION_LIFT * e;
}

/** Most homes one hex shows. */
export const MAX_HOMES = 5;

/** Settlement tier from which a tower stands among the homes (2: Town). */
export const TOWER_TIER = 2;

/**
 * What a hex shows for its settlement tier (-1: none; 0 Camp, 1 Village, 2
 * Town, 3 City and up) and its people: a number of homes, whether they are a
 * tent, and whether a tower stands among them. People with no settlement camp
 * in one tent; a Camp shows 2 homes and each tier adds one, up to MAX_HOMES,
 * and a Town or bigger raises a tower.
 */
export function homesFor(tier, people) {
  if (people <= 0 && tier < 0) return { homes: 0, tents: false, tower: false };
  if (tier < 0) return { homes: 1, tents: true, tower: false };
  return { homes: Math.min(MAX_HOMES, tier + 2), tents: false, tower: tier >= TOWER_TIER };
}

/** Where a hex's homes stand, as offsets from its centre (hex radii), filled in order. */
export const HOME_SLOTS = Object.freeze([
  [-0.28, -0.18], [0.3, -0.24], [-0.05, 0.32], [0.38, 0.22], [-0.42, 0.2],
].map((s) => Object.freeze(s)));
/** A tower stands at the hex centre, a monument just off it. */
export const MONUMENT_SLOT = Object.freeze([0.05, -0.02]);

/** Board extent in hex radii: { minX, maxX, minZ, maxZ, cx, cz, w, d }. */
export function boardBounds(cols, rows) {
  const b = worldBounds(cols, rows);
  const minX = b.minX / HEX_SIZE; const maxX = b.maxX / HEX_SIZE;
  const minZ = b.minY / HEX_SIZE; const maxZ = b.maxY / HEX_SIZE;
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

/** Transition from the flat map to the diorama and back, in milliseconds. */
export const RISE_MS = 1800;
/** Tilt of the camera from straight down once fully 3D (degrees). */
export const TILT_DEG = 52;
/** Field of view of the camera (degrees, vertical). */
export const FOV_DEG = 30;
/** Share of the view the board fills, as on the 2D board. */
export const FILL = 0.95;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * How far a tile has risen (0 flat, 1 full height) at transition progress `u`
 * (0 to 1). The rise sweeps out from the middle: `dist` is the tile's distance
 * from the board centre as a share of the furthest tile (0 to 1).
 */
export function riseAt(u, dist) {
  const start = 0.15 + 0.35 * dist;
  return smooth((u - start) / 0.45);
}

/** How far the camera has tilted at transition progress `u`: it starts first and ends last. */
export function tiltAt(u) {
  return smooth(u / 0.9);
}

/**
 * Camera pose for board `b`, a view of aspect `aspect` (width ÷ height), tilt
 * share `tilt` (0 straight down, 1 at TILT_DEG) and turn `yaw` (radians round
 * the vertical). Straight down, the board fills the view as the 2D board does,
 * so the two can crossfade. Returns { x, y, z, tx, ty, tz }.
 */
export function cameraPose(b, aspect, tilt, yaw = 0) {
  const half = Math.tan((FOV_DEG * Math.PI) / 360);
  // Distance at which the board (plus its base edge) just fits, straight down.
  const fitD = Math.max(b.d + TILE_BASE, b.w / Math.max(0.1, aspect)) / (2 * half * FILL);
  const dist = fitD * (1 + 0.06 * tilt); // tilted, the near corners spread wider
  const a = (tilt * TILT_DEG * Math.PI) / 180;
  const ty = 0.2 * tilt;
  // Tilted, the near edge looms larger, so the camera aims a little nearer to keep the board centred.
  const tz = b.cz + 0.07 * b.d * tilt;
  const back = dist * Math.sin(a);
  return {
    x: b.cx + back * Math.sin(yaw),
    y: ty + dist * Math.cos(a),
    z: tz + back * Math.cos(yaw),
    tx: b.cx, ty, tz,
  };
}
