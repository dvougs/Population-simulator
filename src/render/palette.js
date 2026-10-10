// Colours for terrain and helpers for blending civ colours over it.

// Indexed by terrain id: water, desert, plains, fertile, mountain.
export const TERRAIN_RGB = [
  [36, 74, 120],
  [201, 178, 120],
  [128, 160, 84],
  [62, 128, 62],
  [120, 112, 108],
];

export function rgbCss([r, g, b], a = 1) {
  return a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`;
}
