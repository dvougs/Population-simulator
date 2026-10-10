// Hex grid maths for pointy-top hexes.
//
// Hexes are addressed by axial coordinates (q, r). The map is a rectangle of
// `cols` × `rows` hexes stored row by row in "odd-r" offset layout: odd rows
// are shifted half a hex to the right, so hex index i = row * cols + col.
// Pixel coordinates put the centre of axial hex (0, 0) at (0, 0), with `size`
// being the distance from a hex centre to any of its corners.
//
// Pure: no DOM, no floating-point functions beyond + - * / and Math.sqrt.

export const SQRT3 = Math.sqrt(3);

/** Axial direction vectors, clockwise from east. */
export const DIRECTIONS = Object.freeze([
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
]);

export function offsetToAxial(col, row) {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(q, r) {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function inBounds(col, row, cols, rows) {
  return col >= 0 && row >= 0 && col < cols && row < rows;
}

/** Hex index of axial (q, r), or -1 if it is off the map. */
export function axialToIndex(q, r, cols, rows) {
  const { col, row } = axialToOffset(q, r);
  return inBounds(col, row, cols, rows) ? row * cols + col : -1;
}

export function indexToAxial(i, cols) {
  return offsetToAxial(i % cols, Math.floor(i / cols));
}

/** The on-map neighbours of axial (q, r), as axial coordinates (between 2 and 6 of them). */
export function neighbours(q, r, cols, rows) {
  const out = [];
  for (const [dq, dr] of DIRECTIONS) {
    if (axialToIndex(q + dq, r + dr, cols, rows) >= 0) out.push({ q: q + dq, r: r + dr });
  }
  return out;
}

/**
 * Neighbour table for the whole map: table[i * 6 + k] is the index of hex i's
 * neighbour in DIRECTIONS[k], or -1 where that would be off the map.
 */
export function buildNeighbourTable(cols, rows) {
  const table = new Int32Array(cols * rows * 6);
  for (let i = 0; i < cols * rows; i++) {
    const { q, r } = indexToAxial(i, cols);
    for (let k = 0; k < 6; k++) {
      table[i * 6 + k] = axialToIndex(q + DIRECTIONS[k][0], r + DIRECTIONS[k][1], cols, rows);
    }
  }
  return table;
}

/** Number of steps between two hexes. */
export function distance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Centre of axial hex (q, r) in pixels. */
export function hexToPixel(q, r, size) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/** Rounds fractional axial coordinates to the hex that contains them. */
export function roundAxial(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // + 0 turns -0 into 0 so results compare equal to plain integers.
  return { q: q + 0, r: r + 0 };
}

/** Axial hex containing pixel (x, y). */
export function pixelToHex(x, y, size) {
  const fq = ((SQRT3 / 3) * x - y / 3) / size;
  const fr = ((2 / 3) * y) / size;
  return roundAxial(fq, fr);
}

/** The 6 corners of a hex centred at (cx, cy), clockwise from the top, as a flat [x0, y0, x1, y1, ...] list. */
export function hexCorners(cx, cy, size) {
  const hw = (SQRT3 / 2) * size;
  return [
    cx, cy - size,
    cx + hw, cy - size / 2,
    cx + hw, cy + size / 2,
    cx, cy + size,
    cx - hw, cy + size / 2,
    cx - hw, cy - size / 2,
  ];
}

/** Pixel bounding box of a cols × rows map (hex corners included). */
export function mapBounds(cols, rows, size) {
  const hw = (SQRT3 / 2) * size;
  return {
    minX: -hw,
    minY: -size,
    maxX: SQRT3 * size * (cols - 1) + (rows > 1 ? hw : 0) + hw,
    maxY: 1.5 * size * (rows - 1) + size,
  };
}
