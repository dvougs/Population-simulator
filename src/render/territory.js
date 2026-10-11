// Pure maths behind the civ overlays on the map (RULES.md "How civs and people
// look"): the shared-hex ring, the territory outlines and the hex tint. No
// PixiJS here, so node tests can check the rules directly; territoryLayer.js
// turns the results into Graphics.
//
// Every function reads a population snapshot's hexCivPop (people per hex per
// civ, hex-major: hexCivPop[h * civs + c]).

import { CIV_STYLES } from './civStyle.js';
import { hexCentre, HEX_SIZE } from './layout.js';
import { buildNeighbourTable, SQRT3 } from '../sim/hex.js';

/** Ring around a hex's label, in world units: radius and line width. */
export const RING_RADIUS = 0.7 * HEX_SIZE;
export const RING_WIDTH = 0.07 * HEX_SIZE;
/** Territory outline line width, in world units. */
export const OUTLINE_WIDTH = 0.1 * HEX_SIZE;
/** Civs are inset in this many steps (civ number mod OUTLINE_SLOTS), so up to 4 overlapping outlines never coincide. */
export const OUTLINE_SLOTS = 4;
/** How far a hex is tinted toward its civs' colour: 0 keeps the terrain, 1 would be flat civ colour. */
export const TINT_AMOUNT = 0.3;

/**
 * The ring's arcs for hex h, largest civ first (the lower civ number on a tie),
 * as fractions of a full turn starting at the top and running clockwise:
 * [{ civ, from, to }]. Empty for a hex with nobody in it.
 */
export function ringArcs(hexCivPop, civs, h) {
  const order = [];
  let total = 0;
  for (let c = 0; c < civs; c++) {
    const k = hexCivPop[h * civs + c];
    if (k > 0) { order.push(c); total += k; }
  }
  if (total === 0) return [];
  // Stable on ties because civs were pushed in civ order.
  order.sort((a, b) => hexCivPop[h * civs + b] - hexCivPop[h * civs + a]);
  const arcs = [];
  let at = 0;
  for (let j = 0; j < order.length; j++) {
    const c = order[j];
    const to = j === order.length - 1 ? 1 : at + hexCivPop[h * civs + c] / total;
    arcs.push({ civ: c, from: at, to });
    at = to;
  }
  return arcs;
}

/** The civs' colours in hex h mixed by each civ's share of its people, as unrounded [r, g, b]; null if empty. */
export function civMix(hexCivPop, civs, h, styles = CIV_STYLES) {
  let total = 0;
  let r = 0; let g = 0; let b = 0;
  for (let c = 0; c < civs; c++) {
    const k = hexCivPop[h * civs + c];
    if (k <= 0) continue;
    const rgb = styles[c % styles.length].rgb;
    r += k * rgb[0]; g += k * rgb[1]; b += k * rgb[2];
    total += k;
  }
  return total === 0 ? null : [r / total, g / total, b / total];
}

/**
 * Colour hex h is drawn in: its terrain colour `base` moved TINT_AMOUNT of the
 * way toward civMix (what a civMix overlay at alpha TINT_AMOUNT gives). An empty
 * hex keeps its terrain colour.
 */
export function tintedRgb(base, hexCivPop, civs, h, amount = TINT_AMOUNT) {
  const mix = civMix(hexCivPop, civs, h);
  if (!mix) return [base[0], base[1], base[2]];
  return [0, 1, 2].map((k) => Math.round(base[k] * (1 - amount) + mix[k] * amount));
}

let neighbourCache = { cols: -1, rows: -1, table: null };
function neighbourTable(cols, rows) {
  if (neighbourCache.cols !== cols || neighbourCache.rows !== rows) {
    neighbourCache = { cols, rows, table: buildNeighbourTable(cols, rows) };
  }
  return neighbourCache.table;
}

const holds = (hexCivPop, civs, h, civ) => h >= 0 && hexCivPop[h * civs + civ] > 0;

/**
 * The outer edges of everything civ holds: h * 6 + k for each hex h it holds
 * whose neighbour in direction k (sim/hex.js DIRECTIONS) it does not hold or is
 * off the map. Edges between two of its hexes are left out. Ascending order.
 */
export function territoryEdges(hexCivPop, civs, cols, rows, civ) {
  const nb = neighbourTable(cols, rows);
  const out = [];
  for (let h = 0; h < cols * rows; h++) {
    if (!holds(hexCivPop, civs, h, civ)) continue;
    for (let k = 0; k < 6; k++) {
      if (!holds(hexCivPop, civs, nb[h * 6 + k], civ)) out.push(h * 6 + k);
    }
  }
  return out;
}

/** How far civ's outline sits inside the territory edge (to the middle of its line), in world units. */
export function outlineInset(civ) {
  return OUTLINE_WIDTH / 2 + (civ % OUTLINE_SLOTS) * OUTLINE_WIDTH;
}

/**
 * Civ's territory outline as flat segments [x0, y0, x1, y1, ...] in world
 * units, each outer edge moved `inset` inside the territory. Corners are moved
 * along the bisector of the boundary there (towards the held hexes around the
 * corner), so the segments of one outline meet end to end, around convex and
 * concave corners alike.
 *
 * Edge k of a hex runs from its corner k + 1 to corner k + 2 (corners clockwise
 * from the top, as hexCorners). Corner j is shared with the neighbours in
 * directions j - 1 and j - 2.
 */
export function outlineSegments(hexCivPop, civs, cols, rows, civ, inset = outlineInset(civ)) {
  const nb = neighbourTable(cols, rows);
  const edges = territoryEdges(hexCivPop, civs, cols, rows, civ);
  const out = new Float32Array(edges.length * 4);
  // A corner moves inset / sin 60° along the bisector; the sum of unit vectors
  // to the held hex centres around it is that bisector, already of length 1
  // (one held hex, or two at 120°).
  const reach = (2 * inset) / SQRT3 / HEX_SIZE;
  const hw = (SQRT3 / 2) * HEX_SIZE;
  const cornerX = [0, hw, hw, 0, -hw, -hw];
  const cornerY = [-HEX_SIZE, -HEX_SIZE / 2, HEX_SIZE / 2, HEX_SIZE, HEX_SIZE / 2, -HEX_SIZE / 2];
  const corner = (h, cx, cy, j, o) => {
    const vx = cx + cornerX[j];
    const vy = cy + cornerY[j];
    let dx = cx - vx;
    let dy = cy - vy;
    for (const d of [(j + 5) % 6, (j + 4) % 6]) {
      const n = nb[h * 6 + d];
      if (!holds(hexCivPop, civs, n, civ)) continue;
      const c = hexCentre(cols, n);
      dx += c.x - vx;
      dy += c.y - vy;
    }
    out[o] = vx + dx * reach;
    out[o + 1] = vy + dy * reach;
  };
  for (let e = 0; e < edges.length; e++) {
    const h = Math.floor(edges[e] / 6);
    const k = edges[e] % 6;
    const c = hexCentre(cols, h);
    corner(h, c.x, c.y, (k + 1) % 6, e * 4);
    corner(h, c.x, c.y, (k + 2) % 6, e * 4 + 2);
  }
  return out;
}
