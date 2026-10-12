// Gathering, stores and levels 1 to 5. Every number here is listed in
// RULES.md ("Gathering and levels" and "Settlements").
//
// Once a year, first thing, from the counts taken at the end of last year:
// settlements are updated (who holds each hex, its tier, each civ's capital);
// civs whose food is secure send a share of their adults to gather the
// deposits in the hexes they hold, favouring what their next spend needs; the
// yield goes into that hex's store. Settlements build, the civ's era building,
// wonder and level are paid from its capital's store, each civ levels up or
// falls back, Kingdoms absorb every other civ's people in the hexes they
// enclose, food capacities follow levels, tiers and buildings, and last the
// supply routes carry food and materials to where they are wanted.
//
// The per-hex people per civ and each civ's hungry people come from the
// Simulation's end-of-year count; the people are scanned again (for the
// gatherers' cooperation) only in a year some civ gathers, and to absorb.
// Everything reads that one
// snapshot, so the order people and hexes are visited in never changes the
// outcome. Neither gathering nor absorbing uses randomness.

import { WINTER_YIELD, winterClosedMask } from './calendar.js';
import { MATERIAL_COUNT, MATERIAL_TIER, MATERIAL_IDS } from './materials.js';
import { PLAINS, DEEP_WATER, TERRAIN_COUNT } from './terrain.js';
import { COOPERATION } from './traits.js';
import { Buildings, ERAS, WONDERS, reduce } from './buildings.js';
import { Settlements, TIERS, SETTLE } from './settlements.js';

// Tundra and mountains are closed in winter, so they gather for three seasons of four.
const WINTER_SHUT = winterClosedMask(TERRAIN_COUNT);

const SETTLE_CARRY_COST = SETTLE.carryGatherCost;

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
  /** From level 2, rafts: migration may cross up to raftRange sea or lake hexes in a row. */
  raftLevel: 2,
  raftRange: 1,
  /** From level 4, boats: up to boatRange water hexes in a row. Each water hex costs boatCost movement points (walkers). */
  boatLevel: 4,
  boatRange: 3,
  boatCost: 1,
  /** At level 5: every hex + this share of food capacity, and old age starts this many years later. */
  kingdomBonus: 0.25,
  oldAgeDelay: 5,
  /** The top level, Kingdom (the same as MAX_LEVEL). */
  kingdomLevel: 5,
  /** A Kingdom's strength in a fight against a civ that is not a Kingdom is multiplied by this. */
  kingdomStrength: 3,
  /** A civ below its level's minimum population this many years in a row drops one level. */
  fallBackYears: 100,
});

/** Land needs for levels never exceed this share of the land a civ can reach (rounded up). */
export const REACHABLE_SHARE = 0.9;

/** Water hexes a civ at `level` may sail across in a row (0: no boats). */
export function boatRange(level) {
  const e = LEVEL_EFFECTS;
  return level >= e.boatLevel ? e.boatRange : level >= e.raftLevel ? e.raftRange : 0;
}

const MATERIAL_RARE = MATERIAL_TIER.map((t) => (t === 'common' ? 0 : 1));

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
  /** types[c]: civ c's type id. map: the generated map (its foodCap is taken as the base capacity). seed: names settlements. */
  constructor(map, types, seed = '') {
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
    /** Most hexes a civ's level needs can ask for: REACHABLE_SHARE of the land it can reach (set by the Simulation). */
    this.reachHex = new Int32Array(civs).fill(0x7fffffff);
    this.level = new Uint8Array(civs).fill(1);
    /** Progress at the current level: + 1 a year, more with civic buildings (Settlements.progress). */
    this.yearsAt = new Float64Array(civs);
    this.belowYears = new Int32Array(civs);
    /**
     * stock[civ × MATERIAL_COUNT + material]: the civ's capital store while its spending is
     * worked out each year (copied in before, written back after), otherwise its last value.
     */
    this.stock = new Float64Array(civs * MATERIAL_COUNT);
    /** Each civ's materials in all the stores of the hexes it holds (what it gathers against). */
    this.held = new Float64Array(civs * MATERIAL_COUNT);
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
    this.wantMask = new Uint16Array(civs);
    this.planWant = new Uint16Array(civs);
    this.neighbours = map.neighbours;
    this.laterMask = new Uint16Array(civs);
    /**
     * The Kingdom enclosing each hex, or −1: one with people (at the end of last year) in every land
     * neighbour. Other civs' people there join it, and no other civ may move in (see migration, fleeing).
     */
    this.inside = new Int8Array(n).fill(-1);
    this.hexLevel = new Uint8Array(n);
    /** Each civ's era buildings and the wonders (buildings.js). */
    this.buildings = new Buildings(map, types);
    /** Every lived-in hex's settlement, store, buildings and supply routes (settlements.js). */
    this.settlements = new Settlements(map, types, seed);
    this.settlements.boats = this.boats;
    /** Filled at the end of each year by the Simulation: people who went hungry in each hex that year. */
    this.hungryHex = new Int32Array(n);
    this.onSettle = null;
    /** What each civ gathers for, in spending order (buildings.js "Gathering order"): target[civ × MATERIAL_COUNT + material]. */
    this.target = new Float64Array(civs * MATERIAL_COUNT);
    this.later = new Float64Array(civs * MATERIAL_COUNT);
    this.costScratch = new Float64Array(MATERIAL_COUNT);
    this.reserve = new Float64Array(civs * MATERIAL_COUNT);
    /** What each civ's capital collects: this era's wonder (if committed and not started), next level and era building (if not started) together. */
    this.capWant = new Float64Array(civs * MATERIAL_COUNT);
    /** Per-civ effects of buildings and wonders, read by eating, contact and capacities. */
    this.hungerMul = new Float64Array(civs).fill(1);
    this.setEffects();
    for (let c = 0; c < civs; c++) this.targets(c);
    // A capital keeps what its civ is saving for when other settlements ask it for materials.
    this.settlements.keep = this.capWant;
    this.capitalNeeds();
  }

  /** People per hex the step up from level `level` asks for (work on that era's building and wonder needs as many). */
  perHexFor(level) { return REQUIREMENTS[level - 1]?.perHex ?? 0; }

  /** Whole-percent factor (100 = none) of civ c's hex and people minimums (Road Network). */
  landPct(c) { return 100 - Math.round(this.buildings.eff.land[c] * 100); }

  /** Civ c can reach `land` land hexes (its start's landmass and what its boats add). */
  setReachable(c, land) {
    this.reachHex[c] = Math.max(1, Math.ceil(REACHABLE_SHARE * land));
  }

  /** Hexes `level` asks of civ c before its bonuses: the map's need, at most what it can reach. */
  baseHexes(c, level) { return Math.min(this.minHex[level], this.reachHex[c]); }

  /** Hexes civ c needs to reach `level`, after its bonuses (rounded up, at least 1). */
  minHexesFor(c, level) {
    if (level <= 1) return 0;
    return Math.max(1, reduce(this.baseHexes(c, level), this.landPct(c)));
  }

  /** People civ c needs to reach (and keep) `level`, after its bonuses. */
  minPopFor(c, level) {
    if (level <= 1) return 0;
    return reduce(REQUIREMENTS[level - 2].perHex * this.baseHexes(c, level), this.landPct(c));
  }

  /** Years civ c needs at its level `level`, after its bonuses (rounded up). */
  yearsFor(c, level) {
    return reduce(this.needYears[c * 6 + level], 100 - Math.round(this.buildings.eff.years[c] * 100));
  }

  /** Material m civ c spends to leave `level`, after its bonuses. */
  levelCost(c, level, m) {
    return reduce(this.needMat[(c * 6 + level) * MATERIAL_COUNT + m], this.buildings.costPct(c));
  }

  /**
   * What civ c gathers for, in spending order: the era's wonder first if it is committed and
   * has not started it (its level waits for that), then its next level, then its era building
   * (optional; unless it is standing or being built). target: the first of those still to be
   * paid for; later: all of them plus every later level and its building.
   */
  targets(c) {
    const L = this.level[c];
    const bd = this.buildings;
    const base = c * MATERIAL_COUNT;
    const { target, later, capWant } = this;
    const cost = this.costScratch;
    for (let m = 0; m < MATERIAL_COUNT; m++) { target[base + m] = 0; later[base + m] = 0; capWant[base + m] = 0; }
    if (L >= MAX_LEVEL) return;
    let first = true;
    let now = true;
    const take = (list) => {
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        later[base + m] += list[m];
        if (first) target[base + m] = list[m];
        if (now) capWant[base + m] += list[m];
      }
      first = false;
    };
    for (let l = L; l < MAX_LEVEL; l++) {
      now = l === L;
      if (l === L && bd.waitingForWonder(c, L)) take(WONDERS[L - 1].materials);
      for (let m = 0; m < MATERIAL_COUNT; m++) cost[m] = this.levelCost(c, l, m);
      take(cost);
      if (l <= ERAS && bd.state[c * ERAS + l - 1] === 0) take(bd.buildingCost(c, l, cost));
    }
  }

  /** Into reserve: what civ c keeps in its capital store for its next level before it starts its era building. */
  reserveFor() {
    const r = this.reserve;
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      for (let m = 0; m < MATERIAL_COUNT; m++) r[c * MATERIAL_COUNT + m] = L < MAX_LEVEL ? this.levelCost(c, L, m) : 0;
    }
  }

  setEffects() {
    const e = LEVEL_EFFECTS;
    const eff = this.buildings.eff;
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      this.birthBonus[c] = e.birthPerLevel * (L - 1) + eff.birth[c];
      this.shelter[c] = L >= e.shelterLevel ? e.shelterFactor : 1;
      this.hungerMul[c] = 1 - eff.hunger[c];
      this.oldAgeDelay[c] = (L >= MAX_LEVEL ? e.oldAgeDelay : 0) + eff.oldAge[c];
      this.boats[c] = boatRange(L);
    }
  }

  /** Fills out[c] with the materials civ c's next level still needs (bitmask; 0 for a Kingdom). */
  wanted(out) {
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      let mask = 0;
      if (L < MAX_LEVEL) {
        const b = c * MATERIAL_COUNT;
        for (let m = 0; m < MATERIAL_COUNT; m++) if (this.held[b + m] < this.target[b + m]) mask |= 1 << m;
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
  year(people, map, year, cnt, fightWinner, onLevel, onSwitch, hostile = null, beats = null, onBuild = null) {
    const civs = this.civs;
    const n = map.count;
    const { pop, stock } = this;
    const st = this.settlements;
    this.cnt = cnt;
    hostile = hostile ?? this.noMask();
    beats = beats ?? this.noMask();

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
    st.update(cnt, fightWinner, this.level, year, this.onSettle);
    st.totals(this.held);
    for (let c = 0; c < civs; c++) {
      this.secure[c] = this.civPop[c] > 0 && this.hungry[c] * 100 <= GATHER.secureHungryPct * this.civPop[c] ? 1 : 0;
      this.nextMask[c] = 0;
      this.laterMask[c] = 0;
      this.targets(c);
      if (this.level[c] >= MAX_LEVEL) continue;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const have = this.held[c * MATERIAL_COUNT + m];
        if (have < this.target[c * MATERIAL_COUNT + m]) this.nextMask[c] |= 1 << m;
        if (have < this.later[c * MATERIAL_COUNT + m]) this.laterMask[c] |= 1 << m;
      }
    }

    for (let c = 0; c < civs; c++) this.wantMask[c] = this.nextMask[c] | this.laterMask[c];
    st.choose(year, map.deposits, this.level, this.wantMask, this.hungryHex, (h, c) => this.threatNear(h, c, hostile[c] & ~beats[c]));
    // Materials any of a civ's settlements is saving for: its hexes with those deposits gather them too.
    this.planWant.fill(0);
    for (let h = 0; h < n; h++) if (st.holder[h] >= 0) this.planWant[st.holder[h]] |= st.planMask(h);
    this.gather(people, map, fightWinner);
    st.build(year, this.onSettle);
    // Era buildings, wonders and levels are paid from each civ's capital store.
    this.loadStock();
    this.reserveFor();
    this.buildings.year(this, cnt, year, hostile, beats, onBuild);
    let kingdom = false;
    for (let c = 0; c < civs; c++) {
      if (this.civPop[c] === 0) continue;
      this.yearsAt[c] += 1 + st.progress[c];
      const L = this.level[c];
      if (L < MAX_LEVEL && this.canLevel(c)) {
        for (let m = 0; m < MATERIAL_COUNT; m++) stock[c * MATERIAL_COUNT + m] -= this.levelCost(c, L, m);
        this.setLevel(c, L + 1, year, onLevel);
        if (L + 1 === MAX_LEVEL && this.kingdomCiv < 0) kingdom = true;
        continue;
      }
      if (L > 1 && this.civPop[c] < this.minPopFor(c, L)) {
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
    this.saveStock();
    this.setEffects();
    // Spending this year may have moved what each civ gathers for (read by migration).
    for (let c = 0; c < civs; c++) this.targets(c);
    this.enclose(map);
    this.absorb(people, onSwitch);
    this.capacities(map);
    this.capitalNeeds();
    st.carry(map, this.capWant, year);
    st.totals(this.held);
    return kingdom;
  }

  /**
   * The least each civ's capital store holds of any one material: capitalNeed × the largest cost of
   * one material among its next level and era building together, and the era's wonder (while nobody
   * has finished it).
   */
  capitalNeeds() {
    const bd = this.buildings;
    const cost = this.costScratch;
    for (let c = 0; c < this.civs; c++) {
      const L = this.level[c];
      let top = 0;
      if (L < MAX_LEVEL) {
        if (L <= ERAS) bd.buildingCost(c, L, cost);
        else cost.fill(0);
        // The level and the era building together, since the building waits for both to fit.
        for (let m = 0; m < MATERIAL_COUNT; m++) top = Math.max(top, this.levelCost(c, L, m) + cost[m]);
        if (L <= ERAS) {
          if (bd.wYear[L - 1] < 0) for (let m = 0; m < MATERIAL_COUNT; m++) top = Math.max(top, WONDERS[L - 1].materials[m]);
        }
      }
      this.settlements.capitalMin[c] = SETTLE.capitalNeed * top;
    }
  }

  /** Copy each civ's capital store into stock (empty for a civ with no capital). */
  loadStock() {
    const st = this.settlements;
    for (let c = 0; c < this.civs; c++) {
      const h = st.capital[c];
      for (let m = 0; m < MATERIAL_COUNT; m++) this.stock[c * MATERIAL_COUNT + m] = h >= 0 ? st.store[h * MATERIAL_COUNT + m] : 0;
    }
  }

  /** Write stock back into each civ's capital store (up to its cap; refunds above it are lost). */
  saveStock() {
    const st = this.settlements;
    for (let c = 0; c < this.civs; c++) {
      const h = st.capital[c];
      if (h < 0) continue;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const v = this.stock[c * MATERIAL_COUNT + m];
        st.store[h * MATERIAL_COUNT + m] = v > st.storeCap[h] ? st.storeCap[h] : v < 0 ? 0 : v;
      }
    }
  }

  /** A civ in `danger` (bitmask) has people in hex h or next to it. */
  threatNear(h, c, danger) {
    if (!danger) return false;
    const civs = this.civs;
    const { cnt } = this;
    const near = (x) => { for (let o = 0; o < civs; o++) if ((danger & (1 << o)) && cnt[x * civs + o] > 0) return true; return false; };
    if (near(h)) return true;
    const nb = this.neighbours;
    for (let d = 0; d < 6; d++) {
      const t = nb[h * 6 + d];
      if (t >= 0 && near(t)) return true;
    }
    return false;
  }

  canLevel(c) {
    const L = this.level[c];
    if (this.yearsAt[c] < this.yearsFor(c, L)) return false;
    if (this.civPop[c] < this.minPopFor(c, L + 1) || this.civHexes[c] < this.minHexesFor(c, L + 1)) return false;
    // A civ going for the era's wonder starts it first (the era building is not needed).
    if (L <= ERAS && this.buildings.waitingForWonder(c, L)) return false;
    for (let m = 0; m < MATERIAL_COUNT; m++) if (this.stock[c * MATERIAL_COUNT + m] < this.levelCost(c, L, m)) return false;
    return true;
  }

  noMask() {
    if (!this.zeroMask) this.zeroMask = new Int32Array(this.civs);
    return this.zeroMask;
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
   * In each hex, the civ that holds it (settlements.js) gathers, if its food is secure: its
   * gatherers work the deposits there that its next spend or any of its settlements' planned
   * buildings still needs (or, with none of those, the ones a later spend needs), split equally. A deposit
   * yields min(cap, gatherers × yield), by hand or with an industry building, into the hex's
   * store. Hexes that carried goods last year gather less (their carriers did not gather).
   */
  gather(people, map, fightWinner) {
    const civs = this.civs;
    const st = this.settlements;
    const { cnt, effort, gatherMask, gatherers, gathered } = this;
    gatherMask.fill(0); gatherers.fill(0); gathered.fill(0);
    if (!this.effortGiven) {
      effort.fill(0);
      const { alive, hex, civ, age } = people;
      const coop = people.traits[COOPERATION];
      for (let i = 0; i < people.high; i++) {
        if (!alive[i] || age[i] < GATHER.adultAge) continue;
        effort[hex[i] * civs + civ[i]] += GATHER.personBase + coop[i];
      }
    }
    for (let h = 0; h < map.count; h++) {
      const dep = map.deposits[h];
      const c = st.holder[h];
      // A hex gathers while its food is secure: few of its people went hungry last year.
      if (dep === 0 || c < 0 || this.hungryHex[h] > SETTLE.secureHungry * this.pop[h]) continue;
      const b0 = h * civs;
      let mask = dep & (this.nextMask[c] | this.planWant[c]);
      if (!mask) mask = dep & this.laterMask[c];
      if (!mask || effort[b0 + c] === 0) continue;
      const g = (GATHER.gatherShare * effort[b0 + c] * this.gatherPct[c] * (1 + this.buildings.eff.gather[c])
        * (1 - SETTLE_CARRY_COST * st.used[h]) * (WINTER_SHUT[map.terrain[h]] ? WINTER_YIELD : 1)) / 100;
      const rare = 1 + this.buildings.eff.gatherRare[c];
      let k = 0;
      for (let m = 0; m < MATERIAL_COUNT; m++) if (mask & (1 << m)) k++;
      let got = 0;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        if (!(mask & (1 << m))) continue;
        const raw = (st.yieldOf(h, m) * g * (MATERIAL_RARE[m] ? rare : 1)) / k;
        const y = Math.min(st.capOf(h, m), raw);
        got += st.put(h, m, y);
      }
      gatherMask[b0 + c] = mask;
      gatherers[b0 + c] = g;
      gathered[b0 + c] = got;
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
   * there (counted when the step started), its settlement tier and buildings,
   * and the civs' building and wonder bonuses. Food above a lowered capacity is lost.
   */
  capacities(map) {
    const civs = this.civs;
    const bd = this.buildings;
    const st = this.settlements;
    let fed = false;
    for (let c = 0; c < civs; c++) if (bd.eff.food[c] > 0 || bd.eff.foodHarsh[c] > 0) fed = true;
    const { foodCap, food, terrain, river } = map;
    for (let h = 0; h < map.count; h++) {
      if (terrain[h] === DEEP_WATER) continue;
      let L = 1;
      let extra = 0;
      if (this.pop[h] > 0) {
        const b0 = h * civs;
        for (let c = 0; c < civs; c++) {
          if (this.cnt[b0 + c] === 0) continue;
          if (this.level[c] > L) L = this.level[c];
          // Building and wonder food bonuses: the best of the civs living here.
          if (fed) { const x = bd.foodShare(c, terrain[h]); if (x > extra) extra = x; }
        }
      }
      this.hexLevel[h] = L;
      const cap = this.baseCap[h] * (capacityFactor(L, terrain[h], river[h]) + extra + st.foodShare[h]) + st.foodFlat[h];
      foodCap[h] = cap;
      if (food[h] > foodCap[h]) food[h] = foodCap[h];
    }
  }

  /** Plain data for civ c: level, stockpile and progress towards the next level. */
  summary(c) {
    const L = this.level[c];
    const stockpile = {};
    const out = {
      level: L,
      levelName: LEVEL_NAMES[L - 1],
      foodSecure: this.secure[c] === 1,
      yearsAtLevel: Math.floor(this.yearsAt[c]),
      yearsBelowMinimum: this.belowYears[c],
      minPop: this.minPopFor(c, L),
      stockpile,
      reached: Array.from({ length: MAX_LEVEL }, (_, k) => (this.reached[c * 6 + k + 1] >= 0 ? this.reached[c * 6 + k + 1] : null)),
      next: null,
    };
    // The capital's store pays for levels, era buildings and wonders; held is everything in the civ's stores.
    const st = this.settlements;
    const cap = st.capital[c];
    const held = {};
    for (let m = 0; m < MATERIAL_COUNT; m++) {
      stockpile[MATERIAL_IDS[m]] = cap >= 0 ? st.store[cap * MATERIAL_COUNT + m] : 0;
      held[MATERIAL_IDS[m]] = this.held[c * MATERIAL_COUNT + m];
    }
    out.held = held;
    out.capital = cap >= 0 ? st.describeBrief(cap) : null;
    out.progressBonus = st.progress[c];
    if (L < MAX_LEVEL) {
      const need = Object.fromEntries(MATERIAL_IDS.map((id, m) => [id, this.levelCost(c, L, m)]));
      out.next = {
        level: L + 1,
        levelName: LEVEL_NAMES[L],
        years: this.yearsFor(c, L),
        pop: this.minPopFor(c, L + 1),
        hexes: this.minHexesFor(c, L + 1),
        materials: need,
        /** The era building (optional; null for none), and whether the civ waits to start the era's wonder. */
        building: L <= ERAS ? this.buildings.summary(c).eras[L - 1].building.name : null,
        buildingStanding: L <= ERAS ? this.buildings.standing(c, L) : true,
        waitingForWonder: this.buildings.waitingForWonder(c, L),
      };
    }
    out.buildings = this.buildings.summary(c);
    return out;
  }
}
