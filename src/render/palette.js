// Colours for terrain, water and rivers. Terrain colours are indexed by terrain id.

import { DEEP_WATER } from '../sim/terrain.js';

// deep water, coast, plains, forest, hills, mountain, desert, tundra
export const TERRAIN_RGB = [
  [29, 78, 122],
  [232, 222, 178],
  [134, 172, 88],
  [52, 112, 58],
  [150, 136, 92],
  [128, 120, 116],
  [226, 170, 88],
  [190, 204, 206],
];
export const LAKE_RGB = [56, 118, 170];
export const RIVER_RGB = [86, 164, 226];

export const rgbToHex = ([r, g, b]) => (r << 16) | (g << 8) | b;

export function rgbCss([r, g, b], a = 1) {
  return a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`;
}

/** Base fill colour of hex i of a map (lakes are lighter than the sea), before shading. */
export function hexRgb(map, i) {
  return map.lake[i] ? LAKE_RGB : TERRAIN_RGB[map.terrain[i]];
}

/**
 * Shading by height (RULES.md "Terrain colours"): land is up to landShade
 * darker (lowest land) to landShade lighter (highest land); water is up to
 * waterShade darker the deeper it is. Heights are ranked against the map's own
 * lowest and highest land (or water), so every map uses the full range.
 */
export const SHADE = Object.freeze({ landShade: 0.06, waterShade: 0.25 });

/** Shaded fill colour of every hex, baked once per map: an array of [r, g, b]. */
export function hexColours(map) {
  const n = map.cols * map.rows;
  const elev = map.elevation;
  let landLo = Infinity; let landHi = -Infinity; let waterLo = Infinity; let waterHi = -Infinity;
  for (let i = 0; i < n; i++) {
    const e = elev ? elev[i] : 0;
    if (map.terrain[i] === DEEP_WATER) { waterLo = Math.min(waterLo, e); waterHi = Math.max(waterHi, e); }
    else { landLo = Math.min(landLo, e); landHi = Math.max(landHi, e); }
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = elev ? elev[i] : 0;
    let f;
    if (map.terrain[i] === DEEP_WATER) {
      const depth = waterHi > waterLo ? (waterHi - e) / (waterHi - waterLo) : 0;
      f = 1 - SHADE.waterShade * depth;
    } else {
      const t = landHi > landLo ? (e - landLo) / (landHi - landLo) : 0.5;
      f = 1 + SHADE.landShade * (2 * t - 1);
    }
    const [r, g, b] = hexRgb(map, i);
    out[i] = [Math.min(255, Math.round(r * f)), Math.min(255, Math.round(g * f)), Math.min(255, Math.round(b * f))];
  }
  return out;
}
