// Colours for terrain, water and rivers. Terrain colours are indexed by terrain id.

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

/** Fill colour of hex i of a map (lakes are lighter than the sea). */
export function hexRgb(map, i) {
  return map.lake[i] ? LAKE_RGB : TERRAIN_RGB[map.terrain[i]];
}
