// Peoples: the historical civilisations a civ can be. Each is one of the 5
// civ types (its behaviour, civTypes.js) plus its own 8 starting traits, all
// bought from the same trait budget so none starts stronger, only different.
// Every number here is listed in RULES.md ("Peoples").

import { TRAITS, TRAIT_RULES } from './traits.js';

/** A civ that is no historical people: its name is typed, its traits start at 0.5. */
export const CUSTOM = 'custom';

const t = (fertility, lifeExpectancy, strength, aggression, cooperation, metabolism, heatTolerance, coldTolerance) => Object.freeze({
  fertility, lifeExpectancy, strength, aggression, cooperation, metabolism, heatTolerance, coldTolerance,
});

/** Earliest first. `about` is the one line of history shown with the picker. */
export const PEOPLES = Object.freeze([
  { id: 'sumerians', name: 'Sumerians', type: 'isolationist', about: 'The first cities, between the Tigris and the Euphrates (from about 4500 BC).',
    traits: t(0.5, 0.5, 0.45, 0.45, 0.6, 0.5, 0.65, 0.4) },
  { id: 'egyptians', name: 'Egyptians', type: 'isolationist', about: 'Three thousand years of pharaohs along the Nile (from about 3100 BC).',
    traits: t(0.5, 0.65, 0.4, 0.4, 0.5, 0.5, 0.6, 0.35) },
  { id: 'akkadians', name: 'Akkadians', type: 'expansionist', about: 'Sargon\'s empire, the first to rule many cities at once (about 2300 BC).',
    traits: t(0.5, 0.35, 0.65, 0.6, 0.55, 0.5, 0.55, 0.45) },
  { id: 'maya', name: 'Maya', type: 'isolationist', about: 'Jungle city-states with writing and calendars (about 2000 BC to AD 900).',
    traits: t(0.5, 0.55, 0.4, 0.5, 0.55, 0.5, 0.6, 0.35) },
  { id: 'babylonians', name: 'Babylonians', type: 'cooperative', about: 'Hammurabi\'s laws, star charts and great walls (from about 1900 BC).',
    traits: t(0.5, 0.6, 0.35, 0.4, 0.65, 0.5, 0.5, 0.5) },
  { id: 'hittites', name: 'Hittites', type: 'aggressive', about: 'Chariots and early iron in the hills of Anatolia (about 1600 to 1180 BC).',
    traits: t(0.5, 0.4, 0.7, 0.6, 0.4, 0.5, 0.45, 0.6) },
  { id: 'phoenicians', name: 'Phoenicians', type: 'cooperative', about: 'Sea traders who carried the alphabet around the Mediterranean (about 1500 to 300 BC).',
    traits: t(0.5, 0.5, 0.4, 0.35, 0.7, 0.5, 0.55, 0.45) },
  { id: 'assyrians', name: 'Assyrians', type: 'aggressive', about: 'Iron-armed armies feared across the Near East (about 900 to 600 BC).',
    traits: t(0.5, 0.45, 0.65, 0.75, 0.35, 0.5, 0.55, 0.45) },
  { id: 'scythians', name: 'Scythians', type: 'nomadic', about: 'Horse riders of the steppe north of the Black Sea (about 900 to 200 BC).',
    traits: t(0.5, 0.4, 0.55, 0.6, 0.45, 0.45, 0.5, 0.55) },
  { id: 'greeks', name: 'Greeks', type: 'cooperative', about: 'City-states of thinkers, athletes and sailors (about 800 to 146 BC).',
    traits: t(0.5, 0.6, 0.4, 0.45, 0.6, 0.5, 0.5, 0.45) },
  { id: 'romans', name: 'Romans', type: 'expansionist', about: 'Roads, law and legions around the Mediterranean (753 BC to AD 476).',
    traits: t(0.5, 0.4, 0.65, 0.55, 0.6, 0.5, 0.45, 0.5) },
  { id: 'persians', name: 'Persians', type: 'expansionist', about: 'The Achaemenid empire, from the Aegean to the Indus (550 to 330 BC).',
    traits: t(0.5, 0.5, 0.4, 0.45, 0.65, 0.5, 0.6, 0.4) },
  { id: 'han', name: 'Han Chinese', type: 'expansionist', about: 'A farming empire of tens of millions (206 BC to AD 220).',
    traits: t(0.5, 0.55, 0.4, 0.4, 0.6, 0.5, 0.5, 0.55) },
  { id: 'vikings', name: 'Vikings', type: 'aggressive', about: 'Seafaring raiders and settlers from the cold north (AD 793 to 1066).',
    traits: t(0.5, 0.5, 0.65, 0.7, 0.4, 0.5, 0.4, 0.65) },
  { id: 'mongols', name: 'Mongols', type: 'nomadic', about: 'Horse archers who built the largest land empire (AD 1206 to 1368).',
    traits: t(0.5, 0.4, 0.55, 0.6, 0.4, 0.45, 0.5, 0.55) },
  { id: 'aztecs', name: 'Aztecs', type: 'aggressive', about: 'A warrior empire ruled from Tenochtitlan, on its lake (AD 1428 to 1521).',
    traits: t(0.5, 0.5, 0.6, 0.7, 0.4, 0.5, 0.5, 0.5) },
  { id: 'incas', name: 'Incas', type: 'isolationist', about: 'A mountain empire of terraces and roads in the Andes (AD 1438 to 1533).',
    traits: t(0.5, 0.5, 0.4, 0.45, 0.6, 0.5, 0.45, 0.65) },
].map((p) => Object.freeze(p)));

export const PEOPLE_IDS = Object.freeze(PEOPLES.map((p) => p.id));
const BY_ID = new Map(PEOPLES.map((p) => [p.id, p]));
export const people = (id) => BY_ID.get(id) ?? null;

/**
 * The people civ k gets by default (Civ 1 first). Their types follow the old
 * default type order (Expansionist, Aggressive, Cooperative, Isolationist, Nomadic).
 */
export const DEFAULT_PEOPLES = Object.freeze(['romans', 'assyrians', 'babylonians', 'egyptians', 'mongols', 'persians', 'vikings', 'greeks']);

/**
 * Budget points per 0.1 above 0.5 (below 0.5 gives the points back), priced by
 * how much each trait moved a civ's share of the world in balance test games:
 * fertility by far the most, then metabolism (more births) and heat tolerance
 * (most maps are warm). A civ's budget is the sum over its traits.
 */
export const TRAIT_COSTS = Object.freeze({
  fertility: 25, lifeExpectancy: 4, strength: 4, aggression: 2, cooperation: 4, metabolism: 5, heatTolerance: 4, coldTolerance: 2,
});
/**
 * Budget points a civ may spend before the setup screen warns. Every people is
 * within it; the Nomadic peoples are below 0, since their type is worth more.
 */
export const BUDGET_SLACK = 5;

/** Budget points spent by a set of traits (an object by trait id; missing traits count as 0.5). */
export function traitBudget(traits) {
  let sum = 0;
  for (const k of TRAITS) sum += TRAIT_COSTS[k] * ((traits?.[k] ?? TRAIT_RULES.base) - TRAIT_RULES.base) * 10;
  return Math.round(sum * 10) / 10;
}

/** All traits at the base value: a Custom civ's start. */
export const BASE_TRAITS = Object.freeze(Object.fromEntries(TRAITS.map((k) => [k, TRAIT_RULES.base])));

/** Starting traits of a people (Custom and unknown ids: all 0.5). */
export const peopleTraits = (id) => people(id)?.traits ?? BASE_TRAITS;

/**
 * Names to show for civs: a historical civ is its people's name, a Custom civ
 * its typed name. A name used again gets " 2", " 3"… so every civ reads apart.
 */
export function civNames(civs) {
  const seen = new Map();
  return civs.map((c) => {
    const base = c.people === CUSTOM ? (c.name || 'Custom civ') : (people(c.people)?.name ?? 'Civ');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}
