// The yearly life cycle: founding the civs, eating, food regrowth, deaths and births.
// Every number here is listed in RULES.md ("People" and "Traits").
//
// Birth chance, old age and food need come from each person's traits
// (traits.js); the base* values below are what a person with every trait at
// 0.5 gets.
//
// Each step decides first and applies after, reading only state fixed before
// the step, so the order people are visited in never changes who eats, dies
// or gives birth.

import { DEEP_WATER, DESERT, TUNDRA, MOUNTAIN } from './terrain.js';
import { NO_PARENT } from './people.js';
import { indexToAxial, distance } from './hex.js';
import {
  TRAIT_COUNT, TRAIT_RULES, FERTILITY, LIFE_EXPECTANCY, METABOLISM, HEAT_TOLERANCE, COLD_TOLERANCE,
  birthChance, oldAgeStart, hungerBurden, climateFactor, traitValues, clamp01,
} from './traits.js';

export const LIFE = Object.freeze({
  /** Food a person with metabolism 0.5 eats a year (see foodNeed in traits.js). */
  foodPerPerson: 1,
  /** Share of a hex's food capacity that grows back each year (never above capacity). */
  foodRegrowth: 0.5,
  healthMax: 100,
  /** Health gained in a year with food; lost in a year without, × hunger burden × climate (see hungryLoss). At 0 a person dies of starvation. */
  healthFedGain: 25,
  healthHungryLoss: 35,
  /** Fertile age window, inclusive. */
  fertileMin: 16,
  fertileMax: 40,
  /** Yearly birth chance with fertility and metabolism 0.5 (see birthChance in traits.js). */
  baseBirthChance: 0.05,
  /** Old-age start with life expectancy 0.5 (see oldAgeStart in traits.js); from it a person may die of old age each year … */
  baseOldAgeStart: 45,
  /** … with chance (age − start) ÷ span, so nobody lives past start + span. */
  oldAgeSpan: 40,
  /** Founders' ages are spread evenly over 0 to this − 1. */
  founderAgeMax: 40,
  /** Civs start at least this many steps apart when the land allows it. */
  startMinDistance: 3,
  /** Random positions: at most this many rounds of moving each civ to a hex farther from the others (spreadStarts). */
  spreadRounds: 20,
  /** Start hexes need at least this food capacity when the land allows it. */
  startMinFood: 40,
});

export const DEATH_OLD_AGE = 0;
export const DEATH_STARVATION = 1;
/** Killed in a fight (contact.js). */
export const DEATH_WAR = 2;

/**
 * Starting hex for each civ. fixed[c] (optional) is a hex chosen on the setup
 * screen: it is used when it is land and no earlier civ already starts there;
 * otherwise (or with −1) the civ is placed automatically. Automatic placement
 * draws from good hexes (food capacity ≥ startMinFood; any land if none):
 * each is a random one at least startMinDistance from every start so far
 * (chosen ones included), or the farthest if there is none. Returns
 * hex indices; fewer than `civs` only if there is no land.
 */
export function pickStarts(map, civs, rng, fixed = []) {
  const land = [];
  const good = [];
  for (let i = 0; i < map.count; i++) {
    if (map.terrain[i] === DEEP_WATER) continue;
    land.push(i);
    if (map.foodCap[i] >= LIFE.startMinFood) good.push(i);
  }
  const pool = good.length ? good : land;
  const starts = [];
  if (!pool.length) return starts;
  // Chosen starts first, so the automatic ones keep their distance from them.
  const chosen = new Array(civs).fill(-1);
  for (let c = 0; c < civs; c++) {
    const h = fixed[c] ?? -1;
    if (h >= 0 && h < map.count && map.terrain[h] !== DEEP_WATER && !chosen.includes(h)) chosen[c] = h;
  }
  const placed = chosen.filter((h) => h >= 0);
  const ax = pool.map((i) => indexToAxial(i, map.cols));
  const nearest = (k) => {
    let best = Infinity;
    for (const s of placed) {
      const b = indexToAxial(s, map.cols);
      best = Math.min(best, distance(ax[k].q, ax[k].r, b.q, b.r));
    }
    return best;
  };
  for (let c = 0; c < civs; c++) {
    if (chosen[c] >= 0) { starts.push(chosen[c]); continue; }
    const far = [];
    let bestK = 0;
    let bestD = -1;
    for (let k = 0; k < pool.length; k++) {
      const d = nearest(k);
      if (d >= LIFE.startMinDistance) far.push(k);
      if (d > bestD) { bestD = d; bestK = k; }
    }
    const h = pool[far.length ? far[rng.int(far.length)] : bestK];
    starts.push(h);
    placed.push(h);
  }
  return starts;
}

/**
 * Random positions (the setup screen's button): one good start hex per civ, spread so the
 * gaps between civs are as even as possible. The first civ starts on a random good hex and
 * each next one on the good hex farthest from those placed (the farthest-point rule); then,
 * for up to spreadRounds rounds, each civ in turn moves to the good hex whose nearest other
 * civ is farthest away, while that raises the smallest gap. Ties are broken by `random`
 * (the SimHost passes the browser's random numbers: a new spread each press; this never runs during a game).
 */
export function spreadStarts(map, civs, random) {
  const pool = [];
  const land = [];
  for (let i = 0; i < map.count; i++) {
    if (map.terrain[i] === DEEP_WATER) continue;
    land.push(i);
    if (map.foodCap[i] >= LIFE.startMinFood) pool.push(i);
  }
  const hexes = pool.length >= civs ? pool : land;
  if (!hexes.length || civs <= 0) return [];
  const ax = hexes.map((i) => indexToAxial(i, map.cols));
  const dist = (a, b) => distance(ax[a].q, ax[a].r, ax[b].q, ax[b].r);
  const at = [Math.floor(random() * hexes.length)];
  // Distance from hex k to the nearest placed civ other than civ `skip`.
  const gap = (k, skip) => {
    let best = Infinity;
    for (let c = 0; c < at.length; c++) if (c !== skip) best = Math.min(best, dist(k, at[c]));
    return best;
  };
  // The hex farthest from the others (skip: the civ being moved), ties at random.
  const farthest = (skip) => {
    let bestD = -1;
    let pick = [];
    for (let k = 0; k < hexes.length; k++) {
      if (at.includes(k) && at[skip] !== k) continue;
      const d = gap(k, skip);
      if (d > bestD) { bestD = d; pick = [k]; } else if (d === bestD) pick.push(k);
    }
    return { k: pick[Math.floor(random() * pick.length)], d: bestD };
  };
  while (at.length < civs && at.length < hexes.length) at.push(farthest(-1).k);
  for (let round = 0; round < LIFE.spreadRounds; round++) {
    let moved = false;
    for (let c = 0; c < at.length; c++) {
      const now = gap(at[c], c);
      const best = farthest(c);
      if (best.d > now) { at[c] = best.k; moved = true; }
    }
    if (!moved) break;
  }
  const out = at.map((k) => hexes[k]);
  // Fewer hexes than civs: the rest share the first ones.
  for (let c = out.length; c < civs; c++) out.push(out[c % at.length]);
  return out;
}

/** Old-age death chance this year at a given age, for life expectancy l, with old age starting `delay` years later. */
export function oldAgeChance(age, l = TRAIT_RULES.base, delay = 0) {
  const start = oldAgeStart(l) + delay;
  if (age < start) return 0;
  return Math.min(1, (age - start) / LIFE.oldAgeSpan);
}

/** Health lost in a year without food, in a hex of the given terrain (× shelter: 1, or less with a civ's shelter there). */
export function hungryLoss(f, m, h, c, terrain, shelter = 1) {
  return Math.round(LIFE.healthHungryLoss * hungerBurden(f, m) * climateFactor(terrain, h, c) * shelter);
}

/** Terrain where shelter (from level 3) softens hunger. */
export const isHarsh = (t) => t === DESERT || t === TUNDRA || t === MOUNTAIN;

/**
 * Everyone eats. A hex whose food covers the total need N of its n people
 * feeds everyone; otherwise exactly ⌊food × n ÷ N⌋ of them eat, chosen
 * uniformly at random (selection sampling per hex, which is fair whatever
 * order people are visited in). Food falls by the eaters' needs, never below 0.
 * Scratch arrays (per hex): pop (people in the hex, filled here), seen, picked,
 * and optionally needSum and eaten (Float64Array; allocated if absent).
 * shelter: optional per-civ multiplier of hunger's health loss in desert,
 * tundra and mountain (see levels.js); 1 for every civ when absent. hungerMul:
 * optional per-civ multiplier of hunger's health loss anywhere (buildings.js).
 */
export function eat(people, map, rng, pop, seen, picked, needSum, eaten, shelter = null, hungerMul = null) {
  const { alive, hex, health, hunger, need, traits, civ } = people;
  const fert = traits[FERTILITY];
  const meta = traits[METABOLISM];
  const heat = traits[HEAT_TOLERANCE];
  const cold = traits[COLD_TOLERANCE];
  const { food, terrain } = map;
  needSum ??= new Float64Array(map.count);
  eaten ??= new Float64Array(map.count);
  pop.fill(0);
  seen.fill(0);
  picked.fill(0);
  needSum.fill(0);
  eaten.fill(0);
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    pop[hex[i]]++;
    needSum[hex[i]] += need[i];
  }
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    const h = hex[i];
    const n = pop[h];
    const k = food[h] >= needSum[h] ? n : Math.min(n, Math.floor((food[h] * n) / needSum[h]));
    let fed;
    if (k >= n) fed = true;
    else fed = rng.next() * (n - seen[h]) < k - picked[h];
    seen[h]++;
    if (fed) {
      picked[h]++;
      eaten[h] += need[i];
      hunger[i] = 0;
      health[i] = Math.min(LIFE.healthMax, health[i] + LIFE.healthFedGain);
    } else {
      if (hunger[i] < 255) hunger[i]++;
      // Shelter (level 3) in harsh terrain, and buildings' hunger bonuses everywhere.
      const s = (shelter && isHarsh(terrain[h]) ? shelter[civ[i]] : 1) * (hungerMul ? hungerMul[civ[i]] : 1);
      health[i] = Math.max(0, health[i] - hungryLoss(fert[i], meta[i], heat[i], cold[i], terrain[h], s));
    }
  }
  for (let h = 0; h < map.count; h++) if (picked[h]) food[h] = Math.max(0, food[h] - eaten[h]);
}

/**
 * Deaths: starvation when health has reached 0, otherwise old age by chance.
 * A death depends only on the person's own state, so removing at once is the
 * same as deciding for everyone first. onDeath(slot, cause) records it.
 * delay: optional per-civ years added to the old-age start (Kingdoms).
 */
export function deaths(people, rng, onDeath, delay = null) {
  const { alive, age, health, civ } = people;
  const life = people.traits[LIFE_EXPECTANCY];
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    let cause = -1;
    if (health[i] === 0) cause = DEATH_STARVATION;
    else {
      const d = delay ? delay[civ[i]] : 0;
      if (age[i] >= oldAgeStart(life[i]) + d && rng.next() < oldAgeChance(age[i], life[i], d)) cause = DEATH_OLD_AGE;
    }
    if (cause < 0) continue;
    onDeath(i, cause);
    people.remove(i);
  }
}

const childTraits = new Float64Array(TRAIT_COUNT);

/**
 * Births: each fed person in the fertile window, in a hex with fewer people
 * than its food capacity, has a child with their birth chance. Decided
 * for everyone against the head count before any child is added. The child
 * starts at age 0, full health, in the parent's hex and civ, with the
 * parent's traits each moved by uniform(−mutation, +mutation) from traitRng,
 * clamped to 0 … 1 (copied exactly without traitRng or with mutation 0).
 * mutation is one number, or one per civ (the civ the child is born into).
 * parents: scratch Int32Array at least people.high long. bonus: optional
 * per-civ addition to the birth chance (levels). Returns births added.
 */
export function births(people, map, rng, pop, parents, onBirth, traitRng = null, mutation = 0, bonus = null) {
  const { alive, age, hunger, hex, civ } = people;
  const fert = people.traits[FERTILITY];
  const meta = people.traits[METABOLISM];
  pop.fill(0);
  for (let i = 0; i < people.high; i++) if (alive[i]) pop[hex[i]]++;
  let n = 0;
  for (let i = 0; i < people.high; i++) {
    if (!alive[i] || hunger[i] !== 0) continue;
    if (age[i] < LIFE.fertileMin || age[i] > LIFE.fertileMax) continue;
    if (pop[hex[i]] >= room(map, hex[i])) continue;
    const chance = birthChance(fert[i], meta[i]) + (bonus ? bonus[civ[i]] : 0);
    if (rng.next() < chance) parents[n++] = i;
  }
  for (let k = 0; k < n; k++) {
    const p = parents[k];
    const gen = Math.min(65535, people.gen[p] + 1);
    const child = people.add(people.hex[p], people.civ[p], 0, LIFE.healthMax, people.id[p], gen, people.founder[p]);
    // people.add may have grown the arrays, so read them afresh.
    const tr = people.traits;
    const mu = typeof mutation === 'number' ? mutation : mutation[people.civ[p]];
    for (let t = 0; t < TRAIT_COUNT; t++) {
      const v = tr[t][p];
      childTraits[t] = traitRng && mu > 0 ? clamp01(v + traitRng.range(-mu, mu)) : v;
    }
    people.setTraits(child, childTraits);
    onBirth(child);
  }
  return n;
}

/**
 * Most people hex h has room for (births stop there): its food capacity plus twice the food
 * carried in this year (regrowth gives half the capacity a year, so imports count double),
 * and never above its settlement's housing (see settlements.js). A map without settlements
 * (tests, previews) uses the food capacity alone.
 */
export function room(map, h) {
  const support = map.imported ? map.foodCap[h] + 2 * map.imported[h] : map.foodCap[h];
  return map.housing && map.housing[h] < support ? map.housing[h] : support;
}

/**
 * The people above which hex h is crowded for a civ whose crowding share is `share`: share ×
 * (food capacity + twice the food carried in), and never above its housing.
 */
export function crowdLine(map, h, share) {
  const support = map.imported ? map.foodCap[h] + 2 * map.imported[h] : map.foodCap[h];
  const line = share * support;
  return map.housing && map.housing[h] < line ? map.housing[h] : line;
}

/**
 * Food grows back by share × foodRegrowth × capacity, never above capacity
 * (share 1: a whole year's regrowth). closed[terrain] = 1 skips that terrain
 * (winter on tundra and mountains, see calendar.js).
 */
export function regrow(map, share = 1, closed = null) {
  const { food, foodCap, terrain } = map;
  const add = share * LIFE.foodRegrowth;
  for (let h = 0; h < map.count; h++) {
    if (closed && closed[terrain[h]]) continue;
    if (food[h] < foodCap[h]) food[h] = Math.min(foodCap[h], food[h] + add * foodCap[h]);
  }
}

/**
 * Places each civ's founders on its start hex: pops[c] of them (a number is
 * the same for every civ), numbered on from the civs before, each founder its
 * own line's generation 1. Each founder's traits are their civ's starting
 * traits (traits[c]: an object by trait id or a TRAITS-order array; all 0.5
 * when absent) plus uniform(−founderSpread, +founderSpread) from traitRng,
 * clamped to 0 … 1 (exact values without traitRng).
 */
export function found(people, starts, pops, rng, traitRng = null, traits = null) {
  const spread = TRAIT_RULES.founderSpread;
  let id = 0;
  for (let c = 0; c < starts.length; c++) {
    const base = traitValues(traits?.[c]);
    const n = typeof pops === 'number' ? pops : pops[c];
    for (let k = 0; k < n; k++) {
      const i = people.add(starts[c], c, rng.int(LIFE.founderAgeMax), LIFE.healthMax, NO_PARENT, 1, id++);
      for (let t = 0; t < TRAIT_COUNT; t++) childTraits[t] = traitRng ? clamp01(base[t] + traitRng.range(-spread, spread)) : base[t];
      people.setTraits(i, childTraits);
    }
  }
}
