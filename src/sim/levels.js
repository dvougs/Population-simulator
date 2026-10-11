// Gathering, stockpiles and levels 1 to 5. Every number here is listed in
// RULES.md ("Gathering and levels").
//
// Once a year, first thing, from the counts taken at the end of last year:
// civs whose food is secure send a share of their adults to gather the
// deposits in their hexes, favouring what their next level needs; the yield
// goes into a civ-wide stockpile that never decays and is spent only on
// levelling. Then each civ levels up or falls back, Kingdoms absorb every
// other civ's people in the hexes they enclose, and food capacities follow
// the levels of the civs living in each hex.
//
// The per-hex people per civ and each civ's hungry people come from the
// Simulation's end-of-year count; the people are scanned again (for the
// gatherers' cooperation) only in a year some civ gathers, and to absorb.
// Everything reads that one
// snapshot, so the order people and hexes are visited in never changes the
// outcome. Neither gathering nor absorbing uses randomness.

import { MATERIAL_COUNT, MATERIAL_TIER, MATERIAL_IDS } from './materials.js';
import { PLAINS, DEEP_WATER } from './terrain.js';
import { COOPERATION } from './traits.js';

export const LEVEL_NAMES = Object.freeze(['Foragers', 'Farmers', 'Builders', 'Organised', 'Kingdom']);
export const MAX_LEVEL = 5;

/**
 * What it takes to reach each level from the one below: REQUIREMENTS[L − 2]
 * is the step from L − 1 to L. Hexes are a share (in whole percent) of the
 * land per civ, so the ladder fits any map size and civ count; people are so
 * many per required hex, below the ~22 a full map settles at, so the land is
 * what binds (see levelMinimums). Materials use MATERIAL_IDS order.
 */
export const REQUIREMENTS = Object.freeze([
  Object.freeze({ years: 150, landPct: 15, perHex: 10, materials: Object.freeze([80, 30, 30, 0, 0, 0, 0, 0, 0]) }),
  Object.freeze({ years: 300, landPct: 30, perHex: 12, materials: Object.freeze([200, 150, 100, 30, 0, 0, 0, 0, 0]) }),
  Object.freeze({ years: 500, landPct: 50, perHex: 14, materials: Object.freeze([0, 300, 0, 80, 60, 40, 0, 0, 0]) }),
  Object.freeze({ years: 800, landPct: 75, perHex: 16, materials: Object.freeze([0, 0, 0, 0, 150, 0, 30, 15, 20]) }),
]);

export const GATHER = Object.freeze({
  /**
   * Food is secure when at most this % of the civ's people went hungry last year. A full map always
   * has some hunger (about 5% at level 2 rising to 17% at level 4, as births grow with level), so
   * asking for none (or for no starvation, or spare food) stops gathering for good.
   */
  secureHungryPct: 20,
  /** Share of a secure civ's adults (in hexes with a deposit it wants) that gather. */
  gatherShare: 0.2,
  /** Adults are people of this age or older. */
  adultAge: 16,
  /** A gatherer's yield is multiplied by (personBase + their cooperation): 1 at cooperation 0.5. */
  personBase: 0.5,
  /** Yield per gatherer a year, and the most one deposit gives in a year (all civs together), by tier. */
  yield: Object.freeze({ common: 0.5, uncommon: 0.5, exotic: 0.125 }),
  cap: Object.freeze({ common: 10, uncommon: 10, exotic: 2.5 }),
});

/** Per-type changes to levelling and gathering, in whole percent. */
export const TYPE_LEVEL_RULES = Object.freeze({
  nomadic: Object.freeze({ yearsPct: 125 }),
  isolationist: Object.freeze({ yearsPct: 80, materialsPct: 125 }),
  cooperative: Object.freeze({ gatherPct: 125 }),
});

export const LEVEL_EFFECTS = Object.freeze({
  /** Birth chance + this per level above 1 (0.005 = 0.5 percentage points). */
  birthPerLevel: 0.005,
  /** From level 2: plains and river hexes get + this share of food capacity. */
  farmLevel: 2,
  farmBonus: 0.25,
  /** From level 3: hunger's health loss in desert, tundra and mountain is multiplied by this. */
  shelterLevel: 3,
  shelterFactor: 0.5,
  /** From level 4: migration may cross one sea or lake hex, costing this many movement points. */
  boatLevel: 4,
  boatCost: 1,
  /** At level 5: every hex + this share of food capacity, and old age starts this many years later. */
  kingdomBonus: 0.25,
  oldAgeDelay: 5,
  /** The top level, Kingdom (the same as MAX_LEVEL). */
  kingdomLevel: 5,
  /** A Kingdom's strength in a fight against a civ that is not a Kingdom is multiplied by this. */
  kingdomStrength: 5,
  /** A civ below its level's minimum population this many years in a row drops one level. */
  fallBackYears: 100,
});

const MATERIAL_YIELD = MATERIAL_TIER.map((t) => GATHER.yield[t]);
const MATERIAL_CAP = MATERIAL_TIER.map((t) => GATHER.cap[t]);

/**
 * Hexes and people needed to reach `level` (2 to 5) on a map with `land` land
 * hexes started by `civs` civs: hexes = landPct % of land ÷ civs, rounded
 * (half up), at least 1; people = perHex × those hexes.
 */
export function levelMinimums(level, land, civs) {
  const r = REQUIREMENTS[level - 2];
  if (!r) return { hexes: 0, pop: 0 };
  const hexes = Math.max(1, Math.round((r.landPct * land) / (100 * Math.max(1, civs))));
  return { hexes, pop: r.perHex * hexes };
}

/** Years civ type `type` must spend at `level` before the next (rounded up). */
export function yearsNeeded(level, type) {
  const r = REQUIREMENTS[level - 1];
  if (!r) return null;
  const pct = TYPE_LEVEL_RULES[type]?.yearsPct ?? 100;
  return Math.ceil((r.years * pct) / 100);
}

/** Materials civ type `type` spends to go from `level` to the next (rounded up), MATERIAL_IDS order; null at level 5. */
export function materialsNeeded(level, type) {
  const r = REQUIREMENTS[level - 1];
  if (!r) return null;
  const pct = TYPE_LEVEL_RULES[type]?.materialsPct ?? 100;
  return r.materials.map((v) => Math.ceil((v * pct) / 100));
}

/** Food capacity multiplier of a hex whose highest civ level is `level`. */
export function capacityFactor(level, terrain, river) {
  let f = 1;
  if (level >= LEVEL_EFFECTS.farmLevel && (terrain === PLAINS || river)) f += LEVEL_EFFECTS.farmBonus;
  if (level >= MAX_LEVEL) f += LEVEL_EFFECTS.kingdomBonus;
  return f;
}

export class Levels {
  /** types[c]: civ c's type id. map: the generated map (its foodCap is taken as the base capacity). */
  constructor(map, types) {
    const n = map.count;
    const civs = types.length;
    this.civs = civs;
    this.types = types.slice();
    let land = 0;
    for (let h = 0; h < n; h++) if (map.terrain[h] !== DEEP_WATER) land++;
    this.land = land;
    /** Hexes and people needed to reach each level: minHex[level], minPeople[level] (0 at level 1). */
    this.minHex = new Int32Array(6);
    this.minPeople = new Int32Array(6);
    for (let L = 2; L <= MAX_LEVEL; L++) {
      const m = levelMinimums(L, land, civs);
      this.minHex[L] = m.hexes;
      this.minPeople[L] = m.pop;
    }
    this.level = new Uint8Array(civs).fill(1);
    this.yearsAt = new Int32Array(civs);
    this.belowYears = new Int32Array(civs);
    /** stock[civ × MATERIAL_COUNT + material]. */
    this.stock = new Float64Array(civs * MATERIAL_COUNT);
    /** First year each civ reached each level: reached[civ × 6 + level], −1 if never (level 1 is year 0). */
    this.reached = new Int32Array(civs * 6).fill(-1);
    for (let c = 0; c < civs; c++) this.reached[c * 6 + 1] = 0;
    /** First civ to reach Kingdom, and the year (−1 until one does). */
    this.kingdomCiv = -1;
    this.kingdomYear = -1;
    this.secure = new Uint8Array(civs);
    /** Filled at the end of each year by the Simulation: people of each civ who went hungry that year. */
    this.hungry = new Int32Array(civs);
    this.gatherPct = new Int32Array(civs);
    for (let c = 0; c < civs; c++) this.gatherPct[c] = TYPE_LEVEL_RULES[types[c]]?.gatherPct ?? 100;
    /** Per civ, what each step costs it: needYears[civ × 6 + level], needMat[(civ × 6 + level) × MATERIAL_COUNT + material]. */
    this.needYears = new Int32Array(civs * 6);
    this.needMat = new Float64Array(civs * 6 * MATERIAL_COUNT);
    for (let c = 0; c < civs; c++) {
      for (let L = 1; L < MAX_LEVEL; L++) {
        this.needYears[c * 6 + L] = yearsNeeded(L, types[c]);
        this.needMat.set(materialsNeeded(L, types[c]), (c * 6 + L) * MATERIAL_COUNT);
      }
    }
    this.raised = false;
    /** Per-civ effects read by eating, deaths, births and migration. */
    this.birthBonus = new Float64Array(civs);
    /** Multiplier of hunger's health loss in desert, tundra and mountain (1, or shelterFactor from level 3). */
    this.shelter = new Float64Array(civs).fill(1);
    this.oldAgeDelay = new Int32Array(civs);
    this.boats = new Uint8Array(civs);
    this.baseCap = Float32Array.from(map.foodCap);
    /** Σ (personBase + cooperation) over each gathering civ's adults per hex, [hex × civs + civ]. */
    this.effort = new Float64Array(n * civs);
    /** True when the Simulation has filled effort (for every civ) in its end-of-year count, saving a pass over everyone. */
    this.effortGiven = false;
    // Scratch.
    this.cnt = null;
    this.pop = new Int32Array(n);
    /** Last gathering, per (hex × civs + civ): materials gathered (bitmask), gatherers and amount gathered. */
    this.gatherMask = new Uint16Array(n * civs);
    this.gatherers = new Float32Array(n * civs);
    this.gathered = new Float32Array(n * civs);
    this.civPop = new Int32Array(civs);
    this.civHexes = new Int32Array(civs);
    this.nextMask = new Uint16Array(civs);
    this.laterMask = new Uint16Array(civs);
    this.raw = new Float64Array(MATERIAL_COUNT);
    this.heads = new Int32Array(MATERIAL_COUNT);
    /**
     * The Kingdom enclosing each hex, or −1: one with people (at the end of last year) in every land
     * neighbour. Other civs' people there join it, and no other civ may move in (see migration, fleeing).
     */
    this.inside = new Int8Array(n).fill(-1);
    this.hexLevel = new Uint8Array(n);
    this.setEffects();
  }

  setEffects() {
    const e = LEVEL_EFFECTS;
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      this.birthBonus[c] = e.birthPerLevel * (L - 1);
      this.shelter[c] = L >= e.shelterLevel ? e.shelterFactor : 1;
      this.oldAgeDelay[c] = L >= MAX_LEVEL ? e.oldAgeDelay : 0;
      this.boats[c] = L >= e.boatLevel ? 1 : 0;
    }
  }

  /** Fills out[c] with the materials civ c's next level still needs (bitmask; 0 for a Kingdom). */
  wanted(out) {
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      let mask = 0;
      if (L < MAX_LEVEL) {
        const b = (c * 6 + L) * MATERIAL_COUNT;
        for (let m = 0; m < MATERIAL_COUNT; m++) if (this.stock[c * MATERIAL_COUNT + m] < this.needMat[b + m]) mask |= 1 << m;
      }
      out[c] = mask;
    }
  }

  /** Population and hex minimum to hold `level` (those needed to reach it); 0 at level 1. */
  minPop(level) { return level <= 1 ? 0 : this.minPeople[level]; }
  minHexes(level) { return level <= 1 ? 0 : this.minHex[level]; }

  /**
   * One year of gathering, levelling, absorbing and capacities, from last
   * year's end: cnt[hex × civs + civ] people (the Simulation's hexCivPop), the
   * effort and hungry counts above, starved[c] each civ's starvation deaths last
   * year, fightWinner last year's winner per hex (−1 for none).
   * onLevel(civ, from, to, year), onSwitch(from, to) report changes. Returns true if a civ became the first Kingdom.
   */
  year(people, map, year, cnt, fightWinner, onLevel, onSwitch) {
    const civs = this.civs;
    const n = map.count;
    const { pop, stock } = this;
    this.cnt = cnt;

    // Per civ: people and hexes held.
    this.civPop.fill(0); this.civHexes.fill(0);
    for (let h = 0; h < n; h++) {
      const b0 = h * civs;
      let p = 0;
      for (let c = 0; c < civs; c++) p += cnt[b0 + c];
      pop[h] = p;
      if (p === 0) continue;
      for (let c = 0; c < civs; c++) {
        const k = cnt[b0 + c];
        if (k === 0) continue;
        this.civPop[c] += k;
        this.civHexes[c]++;
      }
    }
    for (let c = 0; c < civs; c++) {
      this.secure[c] = this.civPop[c] > 0 && this.hungry[c] * 100 <= GATHER.secureHungryPct * this.civPop[c] ? 1 : 0;
      this.nextMask[c] = 0;
      this.laterMask[c] = 0;
      if (!this.secure[c] || this.level[c] >= MAX_LEVEL) continue;
      const L = this.level[c];
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const have = stock[c * MATERIAL_COUNT + m];
        let later = 0;
        for (let l = L; l < MAX_LEVEL; l++) {
          const need = this.needMat[(c * 6 + l) * MATERIAL_COUNT + m];
          later += need;
          if (l === L && have < need) this.nextMask[c] |= 1 << m;
        }
        if (have < later) this.laterMask[c] |= 1 << m;
      }
    }

    this.gather(people, map, fightWinner);
    let kingdom = false;
    for (let c = 0; c < civs; c++) {
      if (this.civPop[c] === 0) continue;
      this.yearsAt[c]++;
      const L = this.level[c];
      if (L < MAX_LEVEL && this.canLevel(c)) {
        const b = (c * 6 + L) * MATERIAL_COUNT;
        for (let m = 0; m < MATERIAL_COUNT; m++) stock[c * MATERIAL_COUNT + m] -= this.needMat[b + m];
        this.setLevel(c, L + 1, year, onLevel);
        if (L + 1 === MAX_LEVEL && this.kingdomCiv < 0) kingdom = true;
        continue;
      }
      if (L > 1 && this.civPop[c] < this.minPop(L)) {
        if (++this.belowYears[c] >= LEVEL_EFFECTS.fallBackYears) this.setLevel(c, L - 1, year, onLevel);
      } else this.belowYears[c] = 0;
    }
    if (kingdom) {
      // The first Kingdom; several in the same year: most people, then the lower civ number.
      let best = -1;
      for (let c = 0; c < civs; c++) {
        if (this.level[c] !== MAX_LEVEL || this.reached[c * 6 + MAX_LEVEL] !== year) continue;
        if (best < 0 || this.civPop[c] > this.civPop[best]) best = c;
      }
      this.kingdomCiv = best;
      this.kingdomYear = year;
    }
    this.setEffects();
    this.enclose(map);
    this.absorb(people, onSwitch);
    this.capacities(map);
    return kingdom;
  }

  canLevel(c) {
    const L = this.level[c];
    if (this.yearsAt[c] < this.needYears[c * 6 + L]) return false;
    if (this.civPop[c] < this.minPop(L + 1) || this.civHexes[c] < this.minHexes(L + 1)) return false;
    const b = (c * 6 + L) * MATERIAL_COUNT;
    for (let m = 0; m < MATERIAL_COUNT; m++) if (this.stock[c * MATERIAL_COUNT + m] < this.needMat[b + m]) return false;
    return true;
  }

  setLevel(c, to, year, onLevel) {
    const from = this.level[c];
    this.level[c] = to;
    this.yearsAt[c] = 0;
    this.belowYears[c] = 0;
    if (this.reached[c * 6 + to] < 0) this.reached[c * 6 + to] = year;
    onLevel?.(c, from, to, year);
  }

  /**
   * Each secure civ's gatherers in a hex work the deposits there its next
   * level still needs (or, with none of those, the ones a later level needs),
   * split equally. A deposit yields min(cap, Σ gatherers × yield), shared by
   * headcount among the civs working it, or all to the hex's fight winner.
   */
  gather(people, map, fightWinner) {
    const civs = this.civs;
    const { cnt, effort, raw, heads, stock, gatherMask, gatherers, gathered } = this;
    gatherMask.fill(0); gatherers.fill(0); gathered.fill(0);
    let anyone = false;
    for (let c = 0; c < civs; c++) if (this.nextMask[c] || this.laterMask[c]) anyone = true;
    if (!anyone) return;
    if (!this.effortGiven) {
      effort.fill(0);
      const { alive, hex, civ, age } = people;
      const coop = people.traits[COOPERATION];
      for (let i = 0; i < people.high; i++) {
        if (!alive[i] || age[i] < GATHER.adultAge) continue;
        const c = civ[i];
        if (this.nextMask[c] || this.laterMask[c]) effort[hex[i] * civs + c] += GATHER.personBase + coop[i];
      }
    }
    for (let h = 0; h < map.count; h++) {
      const dep = map.deposits[h];
      if (dep === 0 || this.pop[h] === 0) continue;
      const b0 = h * civs;
      let any = false;
      raw.fill(0); heads.fill(0);
      for (let c = 0; c < civs; c++) {
        if (cnt[b0 + c] === 0 || !this.secure[c]) continue;
        let mask = dep & this.nextMask[c];
        if (!mask) mask = dep & this.laterMask[c];
        if (!mask || effort[b0 + c] === 0) continue;
        const g = (GATHER.gatherShare * effort[b0 + c] * this.gatherPct[c]) / 100;
        let k = 0;
        for (let m = 0; m < MATERIAL_COUNT; m++) if (mask & (1 << m)) k++;
        for (let m = 0; m < MATERIAL_COUNT; m++) {
          if (!(mask & (1 << m))) continue;
          raw[m] += (MATERIAL_YIELD[m] * g) / k;
          heads[m] += cnt[b0 + c];
        }
        gatherMask[b0 + c] = mask;
        gatherers[b0 + c] = g;
        any = true;
      }
      if (!any) continue;
      const w = fightWinner[h];
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        if (raw[m] <= 0) continue;
        const y = Math.min(MATERIAL_CAP[m], raw[m]);
        if (w >= 0) { stock[w * MATERIAL_COUNT + m] += y; gathered[b0 + w] += y; continue; }
        for (let c = 0; c < civs; c++) {
          if (!(gatherMask[b0 + c] & (1 << m))) continue;
          const share = (y * cnt[b0 + c]) / heads[m];
          stock[c * MATERIAL_COUNT + m] += share;
          gathered[b0 + c] += share;
        }
      }
    }
  }

  /**
   * Marks the hexes each Kingdom encloses: land hexes with at least one land
   * neighbour whose every land neighbour held the Kingdom's people at the end
   * of last year. Enclosed by several Kingdoms: the one with the most people,
   * then the lower civ number.
   */
  enclose(map) {
    const civs = this.civs;
    const { inside, cnt, level, civPop } = this;
    inside.fill(-1);
    let anyKingdom = false;
    for (let c = 0; c < civs; c++) if (level[c] === MAX_LEVEL && civPop[c] > 0) anyKingdom = true;
    if (!anyKingdom) return;
    const { terrain, neighbours } = map;
    for (let h = 0; h < map.count; h++) {
      if (terrain[h] === DEEP_WATER) continue;
      for (let k = 0; k < civs; k++) {
        if (level[k] !== MAX_LEVEL || civPop[k] === 0) continue;
        let land = 0;
        let held = 0;
        for (let d = 0; d < 6; d++) {
          const t = neighbours[h * 6 + d];
          if (t < 0 || terrain[t] === DEEP_WATER) continue;
          land++;
          if (cnt[t * civs + k] > 0) held++;
        }
        if (land === 0 || held < land) continue;
        const best = inside[h];
        if (best < 0 || civPop[k] > civPop[best]) inside[h] = k;
      }
    }
  }

  /**
   * Every person of a civ that is not a Kingdom, in a hex a Kingdom encloses,
   * joins that Kingdom. Other Kingdoms' people are not absorbed: a Kingdom
   * falls only to fights.
   */
  absorb(people, onSwitch) {
    const { inside, level } = this;
    let any = false;
    for (let h = 0; h < inside.length; h++) if (inside[h] >= 0) { any = true; break; }
    if (!any) return;
    const { alive, hex, civ } = people;
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const to = inside[hex[i]];
      const c = civ[i];
      if (to < 0 || c === to || level[c] === MAX_LEVEL) continue;
      onSwitch?.(c, to);
      civ[i] = to;
    }
  }

  /**
   * Food capacity of each land hex from the highest level of the civs living
   * there (counted when the step started). Food above a lowered capacity is lost.
   */
  capacities(map) {
    const civs = this.civs;
    let top = 1;
    for (let c = 0; c < civs; c++) if (this.level[c] > top) top = this.level[c];
    // Nothing to do while every civ is at level 1 and no hex was ever raised.
    if (top === 1 && !this.raised) return;
    this.raised = true;
    const { foodCap, food, terrain, river } = map;
    for (let h = 0; h < map.count; h++) {
      let L = 1;
      if (this.pop[h] > 0) {
        const b0 = h * civs;
        for (let c = 0; c < civs; c++) if (this.cnt[b0 + c] > 0 && this.level[c] > L) L = this.level[c];
      }
      this.hexLevel[h] = L;
      const cap = this.baseCap[h] * capacityFactor(L, terrain[h], river[h]);
      foodCap[h] = cap;
      if (food[h] > foodCap[h]) food[h] = foodCap[h];
    }
  }

  /** Plain data for civ c: level, stockpile and progress towards the next level. */
  summary(c) {
    const L = this.level[c];
    const t = this.types[c];
    const stockpile = {};
    const out = {
      level: L,
      levelName: LEVEL_NAMES[L - 1],
      foodSecure: this.secure[c] === 1,
      yearsAtLevel: this.yearsAt[c],
      yearsBelowMinimum: this.belowYears[c],
      minPop: this.minPop(L),
      stockpile,
      reached: Array.from({ length: MAX_LEVEL }, (_, k) => (this.reached[c * 6 + k + 1] >= 0 ? this.reached[c * 6 + k + 1] : null)),
      next: null,
    };
    for (let m = 0; m < MATERIAL_COUNT; m++) stockpile[MATERIAL_IDS[m]] = this.stock[c * MATERIAL_COUNT + m];
    if (L < MAX_LEVEL) {
      const need = Object.fromEntries(MATERIAL_IDS.map((id, m) => [id, materialsNeeded(L, t)[m]]));
      out.next = {
        level: L + 1,
        levelName: LEVEL_NAMES[L],
        years: yearsNeeded(L, t),
        pop: this.minPop(L + 1),
        hexes: this.minHexes(L + 1),
        materials: need,
      };
    }
    return out;
  }
}
