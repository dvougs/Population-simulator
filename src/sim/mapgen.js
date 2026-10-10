// Seeded terrain generation: fractal value noise for elevation and moisture,
// then rank-based classification so the terrain mix is hit exactly.

import { WATER, DESERT, PLAINS, FERTILE, MOUNTAIN, FOOD_CAP, FOOD_REGEN } from './constants.js';

function valueNoise(rng, width, height, octaves = 4, baseCells = 4) {
  const out = new Float32Array(width * height);
  let amp = 1;
  let ampSum = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const gw = cells + 2;
    const grid = new Float32Array(gw * gw);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    const sx = cells / width;
    const sy = cells / height;
    for (let y = 0; y < height; y++) {
      const fy = y * sy;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < width; x++) {
        const fx = x * sx;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * gw + x0];
        const b = grid[y0 * gw + x0 + 1];
        const c = grid[(y0 + 1) * gw + x0];
        const d = grid[(y0 + 1) * gw + x0 + 1];
        const top = a + (b - a) * tx;
        const bottom = c + (d - c) * tx;
        out[y * width + x] += (top + (bottom - top) * ty) * amp;
      }
    }
    ampSum += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= ampSum;
  return out;
}

/** Indices sorted by value, ties broken by index so the order is fully determined. */
function rankOrder(values, indices) {
  return indices.slice().sort((a, b) => values[a] - values[b] || a - b);
}

export function generateTerrain(world, params, rng) {
  const { width, height, size } = world;
  const elevation = valueNoise(rng, width, height, 4, 3);
  const moisture = valueNoise(rng, width, height, 3, 4);
  const mix = params.terrainMix;

  const all = Array.from({ length: size }, (_, i) => i);
  const byElevation = rankOrder(elevation, all);
  const waterCount = Math.round(mix.water * size);
  const mountainCount = Math.round(mix.mountain * size);
  for (let r = 0; r < size; r++) {
    const i = byElevation[r];
    if (r < waterCount) world.terrain[i] = WATER;
    else if (r >= size - mountainCount) world.terrain[i] = MOUNTAIN;
    else world.terrain[i] = PLAINS;
  }

  const lowland = byElevation.slice(waterCount, size - mountainCount);
  const byMoisture = rankOrder(moisture, lowland);
  const restShare = mix.desert + mix.plains + mix.fertile;
  const desertCount = restShare > 0 ? Math.round((mix.desert / restShare) * lowland.length) : 0;
  const fertileCount = restShare > 0 ? Math.round((mix.fertile / restShare) * lowland.length) : 0;
  for (let r = 0; r < byMoisture.length; r++) {
    const i = byMoisture[r];
    if (r < desertCount) world.terrain[i] = DESERT;
    else if (r >= byMoisture.length - fertileCount) world.terrain[i] = FERTILE;
    else world.terrain[i] = PLAINS;
  }

  for (let i = 0; i < size; i++) {
    const t = world.terrain[i];
    const jitter = 0.8 + 0.4 * rng.next();
    world.foodCap[i] = FOOD_CAP[t] * params.abundance * jitter;
    world.food[i] = world.foodCap[i];
    world.capacity[i] = FOOD_REGEN[t] * world.foodCap[i];
  }
}

export function countTerrain(world) {
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < world.size; i++) counts[world.terrain[i]]++;
  return counts;
}
