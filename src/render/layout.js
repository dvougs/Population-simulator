// World-space layout of the map, shared by the renderer, the preview and tap handling.

import { DEEP_WATER } from '../sim/terrain.js';
import { hexToPixel, pixelToHex, axialToOffset, indexToAxial, inBounds, mapBounds, hexCorners } from '../sim/hex.js';

/** Hex size in world units (centre to corner). */
export const HEX_SIZE = 32;

export function hexCentre(cols, i) {
  const { q, r } = indexToAxial(i, cols);
  return hexToPixel(q, r, HEX_SIZE);
}

export function hexPolygon(cols, i) {
  const c = hexCentre(cols, i);
  return hexCorners(c.x, c.y, HEX_SIZE);
}

/** Column, row and index of the hex under world point (wx, wy), or null if off the map. */
export function hexAtWorld(cols, rows, wx, wy) {
  const { q, r } = pixelToHex(wx, wy, HEX_SIZE);
  const { col, row } = axialToOffset(q, r);
  return inBounds(col, row, cols, rows) ? { col, row, index: row * cols + col } : null;
}

export function worldBounds(cols, rows) {
  return mapBounds(cols, rows, HEX_SIZE);
}

/**
 * River segments in world space: [x0, y0, x1, y1] from each river hex's centre
 * towards the hex it flows into, stopping at the shore when that is water.
 */
export function riverSegments(map) {
  const out = [];
  for (let i = 0; i < map.cols * map.rows; i++) {
    const j = map.riverTo[i];
    if (!map.river[i] || j < 0) continue;
    const a = hexCentre(map.cols, i);
    const b = hexCentre(map.cols, j);
    const k = map.terrain[j] === DEEP_WATER ? 0.5 : 1;
    out.push([a.x, a.y, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k]);
  }
  return out;
}
