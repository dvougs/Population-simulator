// Fractal value noise: random values on a lattice, blended with smoothstep.
// No trigonometry or exponentials, so every engine gives bit-identical maps.

/**
 * Builds a noise function over [0, 1] × [0, 1]. `baseCells` lattice cells span
 * the unit square at the first octave; each further octave doubles the cells
 * and halves the weight. Output is in [0, 1).
 */
export function makeNoise(rng, baseCells, octaves) {
  const layers = [];
  let cells = baseCells;
  let amp = 1;
  let ampSum = 0;
  for (let o = 0; o < octaves; o++) {
    const gw = cells + 2;
    const grid = new Float64Array(gw * gw);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    layers.push({ cells, gw, grid, amp });
    ampSum += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return (u, v) => {
    let sum = 0;
    for (const { cells: c, gw, grid, amp: a } of layers) {
      const fx = clamp01(u) * c;
      const fy = clamp01(v) * c;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const i = y0 * gw + x0;
      const top = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const bottom = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * tx;
      sum += (top + (bottom - top) * ty) * a;
    }
    return sum / ampSum;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
