// Setup parameters: defaults, presets, randomise and validation.
// Params are plain JSON so they can be saved, shared and sent to a worker.
// The map parameters (MAP_KEYS) alone decide the map.

import { randomSeedString } from './rng.js';
import { CIV_TYPES, defaultCivType } from './civTypes.js';
import { TRAITS } from './traits.js';
import { PEOPLES, PEOPLE_IDS, DEFAULT_PEOPLES, CUSTOM, people, peopleTraits } from './peoples.js';

/**
 * End conditions a run can have, in the order they are checked. None ticked
 * is Sandbox (no end). Total extinction always ends the run and is not a setting.
 */
export const END_CONDITIONS = ['lastCiv', 'kingdom', 'dominance', 'years'];
/** The conditions randomise drew before First to Kingdom existed (drawn first, so their draws are unchanged). */
const OLDER_END_CONDITIONS = ['lastCiv', 'dominance', 'years'];
/** Year limits offered on the setup screen (any other value in range is "custom"). */
export const YEAR_LIMIT_CHOICES = Object.freeze([1000, 2500, 5000, 10000]);
/** Lowland terrain weights, in the order they appear on the map-generation screen. */
export const LOWLAND_KEYS = ['plains', 'forest', 'desert', 'tundra'];
/** Land shapes: one continent in the middle of the map, or a scatter of islands. */
export const LAND_SHAPES = ['continent', 'islands'];
export const MAP_KEYS = ['seed', 'size', 'water', 'mountains', 'rivers', ...LOWLAND_KEYS, 'landShape'];

/** Civ colours to pick from (their RGB values are in render/civStyle.js CIV_COLOURS). */
export const COLOUR_COUNT = 12;

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
  dominanceShare: { min: 0.25, max: 1 },
  dominanceYears: { min: 10, max: 10000 },
  civCount: { min: 1, max: 8 },
  startPop: { min: 2, max: 200 },
  mutation: { min: 0, max: 0.1 },
  trait: { min: 0, max: 1 },
  seedLength: 64,
  civNameLength: 24,
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
  landShape: 'continent',
  // Game settings: civilisations placed at the start and people in each.
  civCount: 3,
  // One type per civ (Civ 1 first); the default order gives every civ a different one.
  civTypes: Object.freeze(['expansionist', 'aggressive', 'cooperative']),
  // Per civ: its people (or Custom with a typed name), starting traits, and its own
  // mutation and starting people (null: the game settings below), and colour.
  civs: Object.freeze(DEFAULT_PEOPLES.slice(0, 3).map((id, k) => Object.freeze({
    people: id, name: '', traits: peopleTraits(id), mutation: null, startPop: null, colour: k }))),
  startPop: 20,
  // Largest change a trait can take from parent to child (± this, uniform).
  mutation: 0.03,
  // End conditions ticked (none = sandbox) and their numbers.
  endConditions: Object.freeze([]),
  endTicks: 2500,
  dominanceShare: 0.6,
  dominanceYears: 300,
  // Starting hex per civ (hex index), or −1 to place that civ automatically. Not a map key: the map is the same either way.
  starts: Object.freeze([]),
});

/** The end settings every preset starts from (sandbox); presets override some. */
const END_DEFAULTS = { endConditions: [], endTicks: 2500, dominanceShare: 0.6, dominanceYears: 300 };
/** A preset's civs: these peoples, each with its own history's traits and type. */
const civsOf = (ids) => ids.map((id) => ({ people: id }));
/** Mutation every preset uses. */
const MUTATION = { mutation: 0.03 };

export const PRESETS = {
  default: { label: 'Small world', params: { civs: civsOf(['romans', 'assyrians', 'babylonians']), ...MUTATION, ...END_DEFAULTS } },
  continent: { label: 'Continent', params: {
    seed: 'continent', size: 30, water: 0.2, mountains: 0.12, rivers: 6, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 4, civs: civsOf(['romans', 'assyrians', 'babylonians', 'egyptians']), startPop: 30, ...MUTATION, ...END_DEFAULTS, endConditions: ['kingdom', 'dominance', 'years'], endTicks: 5000 } },
  archipelago: { label: 'Archipelago', params: {
    seed: 'islands', size: 30, water: 0.6, landShape: 'islands', mountains: 0.08, rivers: 2, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 5, civs: civsOf(['mongols', 'persians', 'sumerians', 'phoenicians', 'vikings']), startPop: 20, ...MUTATION, ...END_DEFAULTS, endConditions: ['lastCiv', 'years'], endTicks: 10000 } },
  highlands: { label: 'Highlands', params: {
    seed: 'peaks', size: 20, water: 0.15, mountains: 0.3, rivers: 5, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 3, civs: civsOf(['incas', 'hittites', 'mongols']), startPop: 20, ...MUTATION, ...END_DEFAULTS, endConditions: ['years'] } },
  large: { label: 'Large world', params: {
    seed: 'vast', size: 50, water: 0.3, mountains: 0.12, rivers: 12, plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15,
    civCount: 6, civs: civsOf(['romans', 'assyrians', 'babylonians', 'egyptians', 'mongols', 'aztecs']), startPop: 40, ...MUTATION, ...END_DEFAULTS, endConditions: ['lastCiv', 'dominance'] } },
};

export function presetParams(key) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  // Types come from the preset's peoples, not from the default civs.
  return normalizeParams({ ...DEFAULT_PARAMS, civTypes: [], ...preset.params });
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
  p.landShape = LAND_SHAPES.includes(input.landShape) ? input.landShape : d.landShape;
  p.civCount = Math.round(range(input.civCount, 'civCount', d.civCount));
  p.civs = normalizeCivs(input.civs, input.civTypes, p.civCount);
  p.civTypes = normalizeTypes(input.civTypes, p.civCount, p.civs);
  p.startPop = Math.round(range(input.startPop, 'startPop', d.startPop));
  p.mutation = Math.round(range(input.mutation, 'mutation', d.mutation) * 100) / 100;
  p.endConditions = normalizeEnds(input);
  p.endTicks = Math.round(range(input.endTicks, 'endTicks', d.endTicks));
  p.dominanceShare = Math.round(range(input.dominanceShare, 'dominanceShare', d.dominanceShare) * 100) / 100;
  p.dominanceYears = Math.round(range(input.dominanceYears, 'dominanceYears', d.dominanceYears));
  p.starts = normalizeStarts(input.starts, p.civCount, p.size);
  return p;
}

/**
 * One entry per civ: a hex index on the size × size map, or −1 (placed
 * automatically). All −1 is stored as [] so ordinary params stay as before.
 * Whether a chosen hex is land is checked when the game starts (see pickStarts).
 */
function normalizeStarts(starts, count, size) {
  const list = Array.isArray(starts) ? starts : [];
  const out = Array.from({ length: count }, (_, k) => {
    const raw = list[k];
    const v = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
    return Number.isInteger(v) && v >= 0 && v < size * size ? v : -1;
  });
  return out.some((v) => v >= 0) ? out : [];
}

/**
 * Known end conditions, each once, in END_CONDITIONS order. The old single
 * choice (endCondition 'ticks') still reads as a year limit.
 */
function normalizeEnds(input) {
  const ticked = Array.isArray(input.endConditions) ? input.endConditions : [];
  return END_CONDITIONS.filter((k) => ticked.includes(k) || (k === 'years' && input.endCondition === 'ticks'));
}

/**
 * One known type per civ: civCount decides how many; a missing or unknown
 * entry takes its people's type (a Custom civ: the default type for that civ
 * number, see defaultCivType).
 */
function normalizeTypes(types, count, civs) {
  const list = Array.isArray(types) ? types : [];
  return Array.from({ length: count }, (_, k) => (CIV_TYPES.includes(list[k]) ? list[k] : people(civs[k].people)?.type ?? defaultCivType(k)));
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * One entry per civ. A missing or unknown people is picked so civs differ:
 * the default people for that civ number when its type fits (the civ's type,
 * or the default type for its number), else the first people of the civ's type not already taken (default
 * peoples first), else the first not taken at all. Traits default to the
 * people's; mutation and startPop are null (use the game settings) or in range;
 * colours are distinct (a missing or taken one gets the first free colour from
 * the civ's number on).
 */
export function normalizeCivs(civs, types, count) {
  const list = Array.isArray(civs) ? civs : [];
  const typeList = Array.isArray(types) ? types : [];
  const out = [];
  const taken = new Set();
  const colours = new Set();
  const order = [...DEFAULT_PEOPLES, ...PEOPLE_IDS.filter((id) => !DEFAULT_PEOPLES.includes(id))];
  for (let k = 0; k < count; k++) {
    const c = list[k] && typeof list[k] === 'object' ? list[k] : {};
    let id = c.people === CUSTOM || PEOPLE_IDS.includes(c.people) ? c.people : null;
    if (!id) {
      const type = CIV_TYPES.includes(typeList[k]) ? typeList[k] : defaultCivType(k);
      const def = DEFAULT_PEOPLES[k % DEFAULT_PEOPLES.length];
      if (!taken.has(def) && people(def).type === type) id = def;
      else id = order.find((x) => !taken.has(x) && people(x).type === type)
        ?? order.find((x) => !taken.has(x)) ?? def;
    }
    taken.add(id);
    const base = peopleTraits(id);
    const given = c.traits && typeof c.traits === 'object' ? c.traits : {};
    const traits = Object.fromEntries(TRAITS.map((t) => [t, round2(range(given[t], 'trait', base[t]))]));
    const mutation = c.mutation === null || c.mutation === undefined || c.mutation === '' || !Number.isFinite(Number(c.mutation))
      ? null : round2(range(c.mutation, 'mutation', 0));
    const startPop = c.startPop === null || c.startPop === undefined || c.startPop === '' || !Number.isFinite(Number(c.startPop))
      ? null : Math.round(range(c.startPop, 'startPop', 0));
    let colour = Number.isInteger(c.colour) && c.colour >= 0 && c.colour < COLOUR_COUNT && !colours.has(c.colour) ? c.colour : -1;
    for (let j = 0; colour < 0 && j < COLOUR_COUNT; j++) if (!colours.has((k + j) % COLOUR_COUNT)) colour = (k + j) % COLOUR_COUNT;
    colours.add(colour);
    const name = id === CUSTOM ? String(c.name ?? '').trim().slice(0, LIMITS.civNameLength) : '';
    out.push({ people: id, name, traits, mutation, startPop, colour });
  }
  return out;
}

/** Each civ's starting people and mutation, with the game settings filled in. */
export const civStartPop = (p, c) => p.civs[c].startPop ?? p.startPop;
export const civMutation = (p, c) => p.civs[c].mutation ?? p.mutation;

/** Just the parameters that decide the map. */
export function mapParams(params) {
  const p = normalizeParams(params);
  return Object.fromEntries(MAP_KEYS.map((k) => [k, p[k]]));
}

const DOMINANCE_YEAR_CHOICES = [100, 200, 300, 500];

/** Random but sensible map and civs. Uses Math.random (UI only); the sim itself stays seeded. */
export function randomParams(random = Math.random) {
  const size = 10 + Math.floor(random() * 41);
  const p = {
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
    mutation: Math.floor(random() * 11) / 100,
    endConditions: OLDER_END_CONDITIONS.filter(() => random() < 0.5),
    endTicks: YEAR_LIMIT_CHOICES[Math.floor(random() * YEAR_LIMIT_CHOICES.length)],
    dominanceShare: 0.5 + random() * 0.3,
    dominanceYears: DOMINANCE_YEAR_CHOICES[Math.floor(random() * DOMINANCE_YEAR_CHOICES.length)],
  };
  // Drawn last so the other settings get the same draws as before types existed.
  // A people taken already gives way to the next one in the list, so civs differ.
  const picked = [];
  for (let k = 0; k < p.civCount; k++) {
    let j = Math.floor(random() * PEOPLES.length);
    while (picked.includes(PEOPLE_IDS[j])) j = (j + 1) % PEOPLES.length;
    picked.push(PEOPLE_IDS[j]);
  }
  p.civs = picked.map((id) => ({ people: id }));
  // First to Kingdom came later still, so it is drawn after the types.
  if (random() < 0.5) p.endConditions.push('kingdom');
  // Land shape came after that: islands one time in four.
  p.landShape = random() < 0.25 ? 'islands' : 'continent';
  return normalizeParams(p);
}
