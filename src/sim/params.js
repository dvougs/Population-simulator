// Setup parameters: defaults, presets, randomise and validation.
// Params are plain JSON so they can be saved, shared and sent to a worker.

import { CIV_TYPE_IDS } from './civTypes.js';
import { randomSeedString } from './rng.js';

export const GRID_SIZES = [50, 75, 100, 150];
export const PLACEMENTS = ['spread', 'clustered', 'random'];
export const END_CONDITIONS = ['none', 'ticks', 'lastStanding'];
export const MAX_CIVS = 10;
export const MIN_CIVS = 1;

export const DEFAULT_PARAMS = Object.freeze({
  seed: 'pangaea',
  width: 100,
  height: 100,
  terrainMix: { water: 0.22, desert: 0.13, plains: 0.33, fertile: 0.2, mountain: 0.12 },
  civs: ['expansionist', 'cooperative', 'nomadic', 'isolationist', 'aggressive', 'expansionist'],
  startPop: 300,
  placement: 'spread',
  abundance: 1,
  endCondition: 'none',
  endTicks: 1000,
});

export const PRESETS = {
  balanced: { label: 'Balanced', params: {} },
  archipelago: {
    label: 'Archipelago',
    params: {
      seed: 'islands',
      terrainMix: { water: 0.5, desert: 0.05, plains: 0.2, fertile: 0.17, mountain: 0.08 },
    },
  },
  drylands: {
    label: 'Drylands',
    params: {
      seed: 'dune',
      terrainMix: { water: 0.08, desert: 0.45, plains: 0.25, fertile: 0.07, mountain: 0.15 },
      abundance: 0.8,
      civs: ['nomadic', 'nomadic', 'expansionist', 'isolationist', 'aggressive', 'cooperative'],
    },
  },
  crowded: {
    label: 'Crowded',
    params: {
      seed: 'crowd',
      width: 75,
      height: 75,
      civs: ['expansionist', 'cooperative', 'nomadic', 'isolationist', 'aggressive',
        'expansionist', 'cooperative', 'aggressive', 'nomadic', 'isolationist'],
      startPop: 150,
      placement: 'random',
    },
  },
};

export function presetParams(key) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  return normalizeParams({ ...structuredClone(DEFAULT_PARAMS), ...structuredClone(preset.params) });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Returns a complete, valid copy of params. Unknown or bad values fall back to defaults. */
export function normalizeParams(input = {}) {
  const d = DEFAULT_PARAMS;
  const p = {};
  p.seed = String(input.seed ?? d.seed).slice(0, 64) || d.seed;
  p.width = Math.round(clamp(num(input.width, d.width), 20, 200));
  p.height = Math.round(clamp(num(input.height, d.height), 20, 200));

  const mixIn = { ...d.terrainMix, ...(input.terrainMix || {}) };
  const mix = {};
  let total = 0;
  for (const k of Object.keys(d.terrainMix)) {
    mix[k] = clamp(num(mixIn[k], d.terrainMix[k]), 0, 1);
    total += mix[k];
  }
  // Need some land, and shares must sum to 1.
  if (total - mix.water <= 0.05) {
    mix.plains += 0.3;
    total += 0.3;
  }
  for (const k of Object.keys(mix)) mix[k] /= total;
  p.terrainMix = mix;

  const civs = Array.isArray(input.civs) ? input.civs.filter((t) => CIV_TYPE_IDS.includes(t)) : [...d.civs];
  p.civs = civs.slice(0, MAX_CIVS);
  if (p.civs.length < MIN_CIVS) p.civs = [...d.civs];

  p.startPop = Math.round(clamp(num(input.startPop, d.startPop), 10, 5000));
  p.placement = PLACEMENTS.includes(input.placement) ? input.placement : d.placement;
  p.abundance = clamp(num(input.abundance, d.abundance), 0.2, 3);
  p.endCondition = END_CONDITIONS.includes(input.endCondition) ? input.endCondition : d.endCondition;
  p.endTicks = Math.round(clamp(num(input.endTicks, d.endTicks), 10, 100000));
  return p;
}

/** Random but sensible params. Uses Math.random (UI only); the sim itself stays seeded. */
export function randomParams(random = Math.random) {
  const pick = (arr) => arr[Math.floor(random() * arr.length)];
  const count = 3 + Math.floor(random() * 6);
  const civs = Array.from({ length: count }, () => pick(CIV_TYPE_IDS));
  const size = pick(GRID_SIZES.slice(0, 3));
  return normalizeParams({
    seed: randomSeedString(),
    width: size,
    height: size,
    terrainMix: {
      water: 0.05 + random() * 0.4,
      desert: random() * 0.35,
      plains: 0.15 + random() * 0.35,
      fertile: 0.05 + random() * 0.25,
      mountain: random() * 0.2,
    },
    civs,
    startPop: 50 + Math.round(random() * 600),
    placement: pick(PLACEMENTS),
    abundance: 0.6 + random() * 1.2,
    endCondition: 'none',
  });
}
