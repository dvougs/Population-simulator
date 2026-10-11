// Setup parameters: defaults, presets, randomise and validation.
// Params are plain JSON so they can be saved, shared and sent to a worker.
// The map parameters (MAP_KEYS) alone decide the map.

import { randomSeedString } from './rng.js';

export const END_CONDITIONS = ['none', 'ticks'];
/** Lowland terrain weights, in the order they appear on the map-generation screen. */
export const LOWLAND_KEYS = ['plains', 'forest', 'desert', 'tundra'];
export const MAP_KEYS = ['seed', 'size', 'water', 'mountains', 'rivers', ...LOWLAND_KEYS];

/** Valid ranges, shared by validation, the setup screens and RULES.md. */
export const LIMITS = Object.freeze({
  size: { min: 10, max: 50 },
  water: { min: 0, max: 0.7 },
  mountains: { min: 0, max: 0.4 },
  rivers: { min: 0, max: 20 },
  plains: { min: 0, max: 1 },
  forest: { min: 0, max: 1 },
  desert: { min: 0, max: 1 },
  tundra: { min: 0, max: 1 },
  endTicks: { min: 10, max: 100000 },
  civCount: { min: 1, max: 8 },
  startPop: { min: 2, max: 200 },
  seedLength: 64,
});

export const DEFAULT_PARAMS = Object.freeze({
  seed: 'pangaea',
  size: 10,
  water: 0.25,
  mountains: 0.12,
  rivers: 2,
  // Relative weights of the inland lowland; the defaults give 40 / 30 / 15 / 15 of it.
  plains: 0.4,
  forest: 0.3,
  desert: 0.15,
  tundra: 0.15,
  // Game settings: civilisations placed at the start and people in each.
  civCount: 3,
  startPop: 20,
  endCondition: 'none',
  endTicks: 1000,
});

export const PRESETS = {
  default: { label: 'Small world', params: {} },
  continent: { label: 'Continent', params: {
    seed: 'continent', size: 30, water: 0.2, mountains: 0.12, rivers: 6, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 4, startPop: 30 } },
  archipelago: { label: 'Archipelago', params: {
    seed: 'islands', size: 30, water: 0.6, mountains: 0.08, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 5, startPop: 20 } },
  highlands: { label: 'Highlands', params: {
    seed: 'peaks', size: 20, water: 0.15, mountains: 0.3, rivers: 5, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 3, startPop: 20 } },
  large: { label: 'Large world', params: {
    seed: 'vast', size: 50, water: 0.3, mountains: 0.12, rivers: 12, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 6, startPop: 40 } },
};

export function presetParams(key) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  return normalizeParams({ ...DEFAULT_PARAMS, ...preset.params });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);
const range = (v, key, fallback) => clamp(num(v, fallback), LIMITS[key].min, LIMITS[key].max);

/** Returns a complete, valid copy of params. Unknown or bad values fall back to defaults. */
export function normalizeParams(input = {}) {
  const d = DEFAULT_PARAMS;
  const p = {};
  p.seed = String(input.seed ?? d.seed).slice(0, LIMITS.seedLength) || d.seed;
  p.size = Math.round(range(input.size, 'size', d.size));
  // Shares are kept to whole percent so the same setting always gives the same map.
  p.water = Math.round(range(input.water, 'water', d.water) * 100) / 100;
  p.mountains = Math.round(range(input.mountains, 'mountains', d.mountains) * 100) / 100;
  p.rivers = Math.round(range(input.rivers, 'rivers', d.rivers));
  for (const k of LOWLAND_KEYS) p[k] = Math.round(range(input[k], k, d[k]) * 100) / 100;
  p.civCount = Math.round(range(input.civCount, 'civCount', d.civCount));
  p.startPop = Math.round(range(input.startPop, 'startPop', d.startPop));
  p.endCondition = END_CONDITIONS.includes(input.endCondition) ? input.endCondition : d.endCondition;
  p.endTicks = Math.round(range(input.endTicks, 'endTicks', d.endTicks));
  return p;
}

/** Just the parameters that decide the map. */
export function mapParams(params) {
  const p = normalizeParams(params);
  return Object.fromEntries(MAP_KEYS.map((k) => [k, p[k]]));
}

/** Random but sensible map and civs. Uses Math.random (UI only); the sim itself stays seeded. */
export function randomParams(random = Math.random) {
  const size = 10 + Math.floor(random() * 41);
  return normalizeParams({
    seed: randomSeedString(),
    size,
    water: 0.1 + random() * 0.5,
    mountains: 0.05 + random() * 0.25,
    rivers: Math.floor(random() * (Math.floor(size / 4) + 1)),
    plains: 0.2 + random() * 0.4,
    forest: 0.1 + random() * 0.4,
    desert: random() * 0.3,
    tundra: random() * 0.3,
    civCount: 2 + Math.floor(random() * 5),
    startPop: 10 + Math.floor(random() * 41),
    endCondition: 'none',
  });
}
