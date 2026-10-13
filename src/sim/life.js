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
  /** Ages at which a woman can have a child, inclusive. */
  fertileMin: 15,
  fertileMax: 49,
  /** A woman's birth chance at each age, by 5-year group from fertileMin, as a share of her best years' (the natural-fertility curve). */
  fertileCurve: Object.freeze([0.45, 0.95, 1, 0.93, 0.8, 0.45, 0.08]),
  /** A woman's yearly chance at her best ages = this × her birthChance (traits.js) plus her civ's bonus: 30% with every trait at 0.5. */
  birthScale: 6,
  /** Years after a birth before a woman can have another child. */
  birthRest: 1,
  /** A father is a man of the mother's civ at least this old, in her hex or a hex next to it. */
  fatherMin: 16,
  /** Share of babies that are girls (105 boys to 100 girls). */
  girlShare: 0.488,
  /** Share of births that are twins. */
  twinChance: 0.015,
  /** Share of births the mother dies of. */
  childbirthDeath: 0.01,
  /** Yearly chance a child dies, at age 1 (the first year of life), at 2 to 5 and at 6 to 15. */
  infantDeath: 0.2,
  smallChildDeath: 0.03,
  childDeath: 0.005,
  /** Yearly birth chance of a woman at her best ages, every trait 0.5, level 1 (see womanBirthChance). */
  baseBirthChance: 0.3,
  /** Old-age start with life expectancy 0.5 (see oldAgeStart in traits.js); from it a person may die of old age each year … */
  baseOldAgeStart: 45,
  /** … with chance (age − start) ÷ span, so nobody lives past start + span. */
  oldAgeSpan: 40,
  /** Founders' ages are spread evenly over founderAgeMin to founderAgeMax, inclusive. */
  founderAgeMin: 14,
  founderAgeMax: 31,
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
/** A child who died before 16. */
export const DEATH_CHILDHOOD = 3;
/** A mother who died giving birth. */
export const DEATH_CHILDBIRTH = 4;
export const DEATH_CAUSES = 5;

/** A woman's birth chance at an age, as a share of her best years' (0 outside the fertile years). */
export function fertileFactor(age) {
  if (age < LIFE.fertileMin || age > LIFE.fertileMax) return 0;
  return LIFE.fertileCurve[Math.floor((age - LIFE.fertileMin) / 5)];
}

/** A woman's yearly birth chance at an age, from her fertility and metabolism plus her civ's bonus (levels and buildings). */
export const womanBirthChance = (age, f, m, bonus = 0) => LIFE.birthScale * fertileFactor(age) * (birthChance(f, m) + bonus);

/** Yearly chance a child of this age dies (0 from 16). */
export function childDeathChance(age) {
  if (age < 1 || age > 15) return 0;
  return age === 1 ? LIFE.infantDeath : age <= 5 ? LIFE.smallChildDeath : LIFE.childDeath;
}

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
 * then: optional { rng, onDeath, delay } to age everyone a year first and run deaths()
 * in the same pass (the Simulation's year; one pass over everyone instead of three).
 */
export function eat(people, map, rng, pop, seen, picked, needSum, eaten, shelter = null, hungerMul = null, then = null) {
  const { alive, hex, health, hunger, need, traits, civ, age, female, rest } = people;
  const life = traits[LIFE_EXPECTANCY];
  // With then.births (a BirthScratch), the survivors are also counted for births() here.
  const bs = then?.births ?? null;
  let nWomen = 0;
  let nMen = 0;
  if (bs) {
    bs.fit(people.capacity);
    bs.men.fill(0, 0, map.count * bs.civs);
    bs.pop.fill(0);
  }
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
    if (then && age[i] < 65535) age[i]++;
    pop[hex[i]]++;
    needSum[hex[i]] += need[i];
  }
  // How many eat in each hex, once per hex (needSum is not needed after this).
  for (let h = 0; h < map.count; h++) {
    const n = pop[h];
    needSum[h] = food[h] >= needSum[h] ? n : Math.min(n, Math.floor((food[h] * n) / needSum[h]));
  }
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    const h = hex[i];
    const n = pop[h];
    const k = needSum[h];
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
    if (!then) continue;
    // Deaths in the same pass: each depends only on the person's own state after eating,
    // and each step draws from its own stream in the same order, so this is the same as
    // eating for everyone first.
    const cause = deathCause(age[i], health[i], life[i], then.delay ? then.delay[civ[i]] : 0, then.rng);
    if (cause >= 0) {
      then.onDeath(i, cause);
      people.remove(i);
      continue;
    }
    if (!bs) continue;
    // births()'s own first pass, for this survivor (see there).
    bs.pop[h]++;
    if (female[i]) {
      if (rest[i] > 0 && --rest[i] > 0) continue;
      if (hunger[i] === 0 && age[i] >= LIFE.fertileMin && age[i] <= LIFE.fertileMax) bs.women[nWomen++] = i;
    } else if (age[i] >= LIFE.fatherMin) {
      bs.men[h * bs.civs + civ[i]]++;
      bs.fathers[nMen++] = i;
    }
  }
  if (bs) {
    bs.nWomen = nWomen;
    bs.nMen = nMen;
    bs.collected = true;
  }
  for (let h = 0; h < map.count; h++) if (picked[h]) food[h] = Math.max(0, food[h] - eaten[h]);
}

/** A person's death this year, or −1: starvation at health 0, else childhood or old age by chance. */
function deathCause(age, health, life, delay, rng) {
  if (health === 0) return DEATH_STARVATION;
  if (age <= 15) return rng.next() < childDeathChance(age) ? DEATH_CHILDHOOD : -1;
  return age >= oldAgeStart(life) + delay && rng.next() < oldAgeChance(age, life, delay) ? DEATH_OLD_AGE : -1;
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
    const cause = deathCause(age[i], health[i], life[i], delay ? delay[civ[i]] : 0, rng);
    if (cause < 0) continue;
    onDeath(i, cause);
    people.remove(i);
  }
}

const childTraits = new Float64Array(TRAIT_COUNT);

/**
 * Scratch for births, kept on the Simulation so two games never share it: men of
 * each civ in each hex (men[hex × civs + civ]) and their slots bucketed by that key.
 */
export class BirthScratch {
  constructor(hexes, civs, capacity) {
    this.civs = civs;
    this.men = new Int32Array(hexes * civs);
    this.start = new Int32Array(hexes * civs + 1);
    this.fill = new Int32Array(hexes * civs);
    this.list = new Int32Array(capacity);
    this.fathers = new Int32Array(capacity);
    this.women = new Int32Array(capacity);
    /** People per hex after deaths, and the women and men who could have a child, when eat() collected them. */
    this.pop = new Int32Array(hexes);
    this.nWomen = 0;
    this.nMen = 0;
    this.collected = false;
  }

  /** Grows the per-person arrays to the pool's capacity. */
  fit(capacity) {
    if (this.list.length < capacity) {
      this.list = new Int32Array(capacity);
      this.fathers = new Int32Array(capacity);
      this.women = new Int32Array(capacity);
    }
  }
}

/** A random man of civ c in hex h, or in the hexes next to it when h has none (weighted by their men); −1 if none. */
function pickFather(s, map, h, c, rng) {
  const { men, start, list, civs } = s;
  let k = h * civs + c;
  if (men[k] > 0) return list[start[k] + rng.int(men[k])];
  let total = 0;
  for (let d = 0; d < 6; d++) {
    const t = map.neighbours[h * 6 + d];
    if (t >= 0) total += men[t * civs + c];
  }
  if (total === 0) return -1;
  let r = rng.int(total);
  for (let d = 0; d < 6; d++) {
    const t = map.neighbours[h * 6 + d];
    if (t < 0) continue;
    k = t * civs + c;
    if (r < men[k]) return list[start[k] + r];
    r -= men[k];
  }
  return -1;
}

/**
 * Births: each fed woman in her fertile years, rested since her last child, in a hex
 * with fewer people than its room and with a man of her civ (16 or older) in her hex
 * or a hex next to it, has a child with her womanBirthChance. Decided for everyone
 * against the counts before any child is added. The father is a random such man
 * (from her own hex when it has one). A birth is twins with twinChance; each child is
 * a girl with girlShare, starts at age 0 with full health in the mother's hex and
 * civ, and gets the average of the two parents' traits, each moved by
 * uniform(−mutation, +mutation) from traitRng and clamped to 0 … 1. mutation is one
 * number, or one per civ (the civ the child is born into). The mother dies with
 * childbirthDeath after the children are added (onDeath). parents: scratch Int32Array
 * at least people.high long. scratch: a BirthScratch. bonus: optional per-civ addition
 * to the birth chance (levels, buildings). Returns births added (twins count 2).
 */
export function births(people, map, rng, pop, parents, onBirth, traitRng = null, mutation = 0, bonus = null, scratch = null, onDeath = null) {
  const { alive, age, hunger, hex, civ, female, rest } = people;
  const fert = people.traits[FERTILITY];
  const meta = people.traits[METABOLISM];
  if (!scratch) {
    // Tests call births without a Simulation; size the scratch from the people.
    let civs = 1;
    for (let i = 0; i < people.high; i++) if (alive[i] && civ[i] >= civs) civs = civ[i] + 1;
    scratch = new BirthScratch(map.count, civs, people.capacity);
  }
  scratch.fit(people.capacity);
  const s = scratch;
  const C = s.civs;
  const keys = map.count * C;
  const { men, start, list, women, fathers } = s;
  let nMen = 0;
  let nWomen = 0;
  // eat() may already have made the first pass (the Simulation's year).
  const collected = s.collected;
  s.collected = false;
  if (collected) {
    pop = s.pop;
    nMen = s.nMen;
    nWomen = s.nWomen;
  } else {
    men.fill(0, 0, keys);
    pop.fill(0);
  }
  // One pass over everyone: head counts, rest years, and the men and the women who could have a child.
  for (let i = 0; i < (collected ? 0 : people.high); i++) {
    if (!alive[i]) continue;
    pop[hex[i]]++;
    if (female[i]) {
      if (rest[i] > 0 && --rest[i] > 0) continue;
      if (hunger[i] === 0 && age[i] >= LIFE.fertileMin && age[i] <= LIFE.fertileMax) women[nWomen++] = i;
    } else if (age[i] >= LIFE.fatherMin) {
      men[hex[i] * C + civ[i]]++;
      fathers[nMen++] = i;
    }
  }
  // The men bucketed by hex and civ, so a father can be drawn (fathers[] is free again after this).
  start[0] = 0;
  for (let k = 0; k < keys; k++) start[k + 1] = start[k] + men[k];
  s.fill.fill(0, 0, keys);
  for (let j = 0; j < nMen; j++) {
    const i = fathers[j];
    const k = hex[i] * C + civ[i];
    list[start[k] + s.fill[k]++] = i;
  }
  let n = 0;
  for (let j = 0; j < nWomen; j++) {
    const i = women[j];
    const h = hex[i];
    if (pop[h] >= room(map, h)) continue;
    const chance = womanBirthChance(age[i], fert[i], meta[i], bonus ? bonus[civ[i]] : 0);
    if (rng.next() >= chance) continue;
    const f = pickFather(s, map, h, civ[i], rng);
    if (f < 0) continue;
    fathers[n] = f;
    parents[n++] = i;
  }
  let born = 0;
  for (let k = 0; k < n; k++) {
    const p = parents[k];
    const f = fathers[k];
    const twins = rng.next() < LIFE.twinChance ? 2 : 1;
    const gen = Math.min(65535, Math.max(people.gen[p], people.gen[f]) + 1);
    const c = people.civ[p];
    const mu = typeof mutation === 'number' ? mutation : mutation[c];
    for (let b = 0; b < twins; b++) {
      const girl = rng.next() < LIFE.girlShare ? 1 : 0;
      const child = people.add(people.hex[p], c, 0, LIFE.healthMax, people.id[p], gen, people.founder[p], girl, people.id[f]);
      // people.add may have grown the arrays, so read them afresh.
      const tr = people.traits;
      for (let t = 0; t < TRAIT_COUNT; t++) {
        const v = (tr[t][p] + tr[t][f]) / 2;
        childTraits[t] = traitRng && mu > 0 ? clamp01(v + traitRng.range(-mu, mu)) : v;
      }
      people.setTraits(child, childTraits);
      onBirth(child);
      born++;
    }
    people.rest[p] = LIFE.birthRest + 1;
    people.kids[p] = Math.min(255, people.kids[p] + twins);
  }
  // Mothers who died giving birth, after every child is in (no slot is reused mid-step).
  for (let k = 0; k < n; k++) {
    if (rng.next() >= LIFE.childbirthDeath) continue;
    const p = parents[k];
    if (onDeath) onDeath(p, DEATH_CHILDBIRTH);
    people.remove(p);
  }
  return born;
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
    // Half women (the odd one out a woman), all of an age to start families.
    for (let k = 0; k < n; k++) {
      const a = LIFE.founderAgeMin + rng.int(LIFE.founderAgeMax - LIFE.founderAgeMin + 1);
      const i = people.add(starts[c], c, a, LIFE.healthMax, NO_PARENT, 1, id++, k % 2 === 0 ? 1 : 0);
      for (let t = 0; t < TRAIT_COUNT; t++) childTraits[t] = traitRng ? clamp01(base[t] + traitRng.range(-spread, spread)) : base[t];
      people.setTraits(i, childTraits);
    }
  }
}
