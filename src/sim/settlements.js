// Settlements: every lived-in hex is a camp, village, town, city, metropolis or
// megapolis, with its own store of materials, its own buildings and supply
// routes to the hexes around it. Every number here is listed in RULES.md
// ("Settlements").
//
// Run once a year inside the levels step (levels.js), from the counts taken at
// the end of last year. Nothing here uses randomness: holders, tiers, capitals,
// what to build and who supplies whom are settled by fixed rules. Supply is
// decided demander by demander, biggest settlement first; ties between equal
// settlements rotate every year (a hash of hex and year), so no corner of the
// map is always served first.

import { MATERIAL_COUNT, MATERIAL_IDS, MATERIAL_NAMES, MATERIAL_TIER } from './materials.js';
import { DEEP_WATER, PLAINS, COAST } from './terrain.js';

const mats = (o) => Object.freeze(MATERIAL_IDS.map((id) => o[id] ?? 0));

export const TIER_NAMES = Object.freeze(['Camp', 'Village', 'Town', 'City', 'Metropolis', 'Megapolis']);
export const CAMP = 0;
export const VILLAGE = 1;
export const TOWN = 2;
export const CITY = 3;
export const METROPOLIS = 4;
export const MEGAPOLIS = 5;
export const TIER_COUNT = 6;

/**
 * TIERS[t]: the lowest civ level that allows it (camp and village at level 1, town at 2 …
 * megapolis at 5); people (all civs) in the hex to reach it; housing; building slots; store
 * cap per material; food capacity bonus (share of the hex's base capacity); supply reach in steps.
 */
export const TIERS = Object.freeze([
  Object.freeze({ level: 1, people: 1, housing: 25, slots: 1, store: 60, food: 0, reach: 1 }),
  Object.freeze({ level: 1, people: 12, housing: 45, slots: 2, store: 250, food: 0, reach: 2 }),
  Object.freeze({ level: 2, people: 30, housing: 80, slots: 3, store: 450, food: 0.04, reach: 3 }),
  Object.freeze({ level: 3, people: 60, housing: 140, slots: 5, store: 700, food: 0.08, reach: 4 }),
  Object.freeze({ level: 4, people: 100, housing: 220, slots: 7, store: 1000, food: 0.12, reach: 5 }),
  Object.freeze({ level: 5, people: 160, housing: 320, slots: 9, store: 1500, food: 0.16, reach: 6 }),
]);

export const SETTLE = Object.freeze({
  /** A settlement drops a tier after this many years in a row below shrinkShare of its people threshold. */
  shrinkYears: 20,
  shrinkShare: 0.85,
  /** Buildings and the store of a hex nobody lives in are lost after this many years. */
  ruinYears: 30,
  /** Another civ takes a hex from its holder with this many times the holder's people there (or by winning a fight there). */
  takeOver: 1.25,
  /** Share of the store lost (looted) when a hex changes hands. */
  looted: 0.5,
  /** Stock above a store's cap loses this share a year. */
  overCapDecay: 0.2,
  /** The capital moves when another hex the civ holds has at least this many times its people. */
  capitalSwitch: 1.5,
  /** The capital's store holds this many times its tier's cap … */
  capitalStore: 1.5,
  /** … and never less than this many times the largest cost of one material for its civ's next level and era building together, or the era's wonder. */
  capitalNeed: 1.1,
  /** Share of the people in a hex who may go hungry while it still gathers (its food is secure). */
  secureHungry: 0.2,
  /** Units of goods (food and materials together) a hex can send a year, per person living there. */
  carryPerPerson: 0.5,
  /** A hex that sends its whole carrying capacity gathers this much less (carriers do not gather). */
  carryGatherCost: 0.25,
  /** A settlement asks for food only when at least this share of its people went hungry last year. */
  askHungry: 0.1,
  /** A hex sends food only when it has at least this much to spare (a cart load). */
  minLoad: 5,
  /** Food loses this share of what was sent for every step it is carried. */
  spoilPerStep: 0.1,
  /** A hex keeps this many years' food for its own people before it gives any away, and a settlement asks for this much. */
  foodKeep: 1.1,
  /** Food carried in counts towards a hex's support smoothed: this share of this year's, the rest last year's average. */
  importSmooth: 0.2,
  /** A settlement re-decides what to build every this many years (staggered by hex). */
  planEvery: 5,
  /** A plan whose materials have not come in this many years is dropped, and nothing is planned there for blockYears. */
  planYears: 40,
  blockYears: 25,
});

/** Hand gathering per gatherer a year, and the most a deposit gives a year, by material tier. */
export const HAND = Object.freeze({
  yield: Object.freeze({ common: 0.5, uncommon: 0.25, exotic: 0.0625 }),
  cap: Object.freeze({ common: 10, uncommon: 5, exotic: 1.25 }),
});

/**
 * The settlement buildings, one of each per hex. kind: housing, food, industry, trade, civic,
 * defence. tier: the lowest tier that can build it; level: the lowest level of the civ holding
 * the hex. site: an extra condition ('farm': plains, coast or river; 'water': next to sea or
 * lake; 'capital': the civ's capital; 'deposit': a deposit of one of its materials). Effects:
 * housing (flat), housingPct (share of the tier's housing), food (share of base capacity),
 * foodFlat, industry ({ materials, yield, cap } per gatherer and per deposit a year), store
 * (cap ×), carry (capacity ×), progress, defence.
 */
const s = (id, name, kind, tier, cost, years, effects, site = null, level = 1) =>
  Object.freeze({ id, name, kind, tier, level, cost: mats(cost), years, effects: Object.freeze(effects), site });
const works = (materials, y, cap) => Object.freeze({ materials: Object.freeze(materials), yield: y, cap });

export const SETTLEMENT_BUILDINGS = Object.freeze([
  s('huts', 'Huts', 'housing', CAMP, { wood: 10 }, 5, { housing: 15 }),
  s('houses', 'Houses', 'housing', TOWN, { wood: 30, clay: 20 }, 10, { housingPct: 0.25 }),
  s('fields', 'Fields', 'food', VILLAGE, { wood: 20 }, 10, { food: 0.05 }, 'farm'),
  s('fishingDock', 'Fishing dock', 'food', VILLAGE, { wood: 25 }, 10, { foodFlat: 5 }, 'water'),
  s('granary', 'Granary', 'food', TOWN, { wood: 40, clay: 30 }, 10, { food: 0.05 }),
  s('irrigation', 'Irrigation', 'food', CITY, { stone: 80, copper: 20 }, 20, { food: 0.1 }, 'farm'),
  s('woodcutter', 'Woodcutter', 'industry', CAMP, { wood: 15 }, 5, { industry: works(['wood'], 1, 20) }, 'deposit'),
  s('quarry', 'Quarry', 'industry', CAMP, { wood: 20 }, 5, { industry: works(['stone'], 1, 20) }, 'deposit'),
  s('clayPit', 'Clay pit', 'industry', CAMP, { wood: 15 }, 5, { industry: works(['clay'], 1, 20) }, 'deposit'),
  s('mine', 'Mine', 'industry', CAMP, { stone: 40, wood: 20 }, 15, { industry: works(['copper', 'iron', 'salt'], 1, 20) }, 'deposit', 2),
  s('deepMine', 'Deep mine', 'industry', CAMP, { stone: 60, iron: 20 }, 20, { industry: works(['gold', 'gemstones', 'spices'], 0.5, 5) }, 'deposit', 3),
  s('warehouse', 'Warehouse', 'trade', TOWN, { wood: 50, stone: 40 }, 10, { store: 1.5 }),
  s('market', 'Market', 'trade', TOWN, { wood: 40, clay: 30, salt: 10 }, 10, { carry: 1.5 }),
  s('shrine', 'Shrine', 'civic', VILLAGE, { stone: 20 }, 10, { progress: 0.02 }),
  s('school', 'School', 'civic', TOWN, { wood: 40, stone: 30 }, 15, { progress: 0.03 }),
  s('library', 'Library', 'civic', CITY, { stone: 60, copper: 20 }, 20, { progress: 0.05 }),
  s('palace', 'Palace', 'civic', METROPOLIS, { stone: 100, gold: 20 }, 25, { progress: 0.05, defence: 0.5 }, 'capital'),
  s('palisade', 'Palisade', 'defence', VILLAGE, { wood: 30 }, 5, { defence: 0.25 }),
  s('stoneWalls', 'Stone walls', 'defence', CITY, { stone: 100 }, 15, { defence: 0.75 }),
]);
export const SB_COUNT = SETTLEMENT_BUILDINGS.length;
export const SB_INDEX = Object.freeze(Object.fromEntries(SETTLEMENT_BUILDINGS.map((b, k) => [b.id, k])));

/** Progress bonuses from civic buildings add up to at most this (+20%) … */
export const MAX_PROGRESS_BONUS = 0.2;
/** … and each kind of civic building counts in at most this many of a civ's settlements. */
export const CIVIC_COUNTED = 5;

/** How a settlement scores what to build (see choose), and the type tilts. */
export const PLAN = Object.freeze({
  /** Housing counts when the people are at least this share of the housing. */
  housingFull: 0.9,
  /** Food counts when at least this share of the people there went hungry last year. */
  hungryShare: 0.1,
  scores: Object.freeze({ industryWanted: 4, housing: 3, food: 3, warehouse: 2, market: 2, defence: 2, industry: 1, civic: 1 }),
  /** Goods carried from or to a hex last year for a Market to count. */
  marketCarried: 10,
  /** Rarer materials' industry buildings score this much more (uncommon, exotic). */
  rarity: Object.freeze({ common: 0, uncommon: 0.25, exotic: 0.5 }),
  tilt: Object.freeze({
    isolationist: Object.freeze({ food: 1.3, industry: 1.3, defence: 1.3 }),
    cooperative: Object.freeze({ civic: 1.3, trade: 1.3 }),
    aggressive: Object.freeze({ defence: 1.5 }),
    expansionist: Object.freeze({ housing: 1.3 }),
  }),
  /** Nomadic settlements only plan something scoring at least this. */
  nomadicMin: 2,
});

const bit = (m) => 1 << m;
const HAND_YIELD = MATERIAL_TIER.map((t) => HAND.yield[t]);
const HAND_CAP = MATERIAL_TIER.map((t) => HAND.cap[t]);
// Per building: the materials it works (bitmask), its per-material yield and cap, its rarity bonus and its cost mask.
const IND_MASK = SETTLEMENT_BUILDINGS.map((b) => (b.effects.industry ? b.effects.industry.materials.reduce((a, id) => a | bit(MATERIAL_IDS.indexOf(id)), 0) : 0));
const IND_RARITY = SETTLEMENT_BUILDINGS.map((b) => {
  if (!b.effects.industry) return 0;
  let r = 0;
  for (const id of b.effects.industry.materials) r = Math.max(r, PLAN.rarity[MATERIAL_TIER[MATERIAL_IDS.indexOf(id)]]);
  return r;
});
const CIVIC_MASK = SETTLEMENT_BUILDINGS.reduce((a, b, k) => (b.effects.progress ? a | bit(k) : a), 0);
const COST_MASK = SETTLEMENT_BUILDINGS.map((b) => b.cost.reduce((a, v, m) => (v > 0 ? a | bit(m) : a), 0));

const SYL_A = ['Ar', 'Bel', 'Cor', 'Da', 'El', 'Fen', 'Gal', 'Hal', 'Ir', 'Kes', 'Lor', 'Mar', 'Nor', 'Os', 'Pel', 'Quar', 'Ros', 'Sel', 'Tor', 'Ul', 'Var', 'Wen', 'Yr', 'Zan'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou'];
const SYL_C = ['ble', 'dor', 'gard', 'holm', 'kesh', 'lin', 'mar', 'nath', 'ris', 'stead', 'thal', 'vik', 'wyn', 'ton', 'ford', 'mere'];

/** A settlement's name, from a hash of the seed and the hex: no random stream is used. */
export function settlementName(seed, hex) {
  let x = 0x811c9dc5;
  const str = `${seed}#${hex}`;
  for (let k = 0; k < str.length; k++) { x ^= str.charCodeAt(k); x = Math.imul(x, 0x01000193) >>> 0; }
  const a = SYL_A[x % SYL_A.length];
  x = Math.floor(x / SYL_A.length);
  const b = SYL_B[x % SYL_B.length];
  x = Math.floor(x / SYL_B.length);
  return `${a}${b}${SYL_C[x % SYL_C.length]}`;
}

/** The tier a hex of `people` reaches when held by a civ at `level` (−1 for nobody). */
export function tierFor(people, level) {
  let t = -1;
  for (let k = 0; k < TIER_COUNT; k++) if (TIERS[k].level <= level && people >= TIERS[k].people) t = k;
  return t;
}

// Highest tier each level allows, and each tier's people threshold, for the yearly loop.
const TOP_TIER = Array.from({ length: 7 }, (_, lv) => tierFor(1e9, lv));
const TIER_PEOPLE = TIERS.map((t) => t.people);

/** Plain words for a settlement building's effects. */
export function settlementEffectText(b) {
  const e = b.effects;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const out = [];
  if (e.housing) out.push(`housing +${e.housing}`);
  if (e.housingPct) out.push(`housing +${pct(e.housingPct)}`);
  if (e.food) out.push(`food capacity +${pct(e.food)}`);
  if (e.foodFlat) out.push(`food capacity +${e.foodFlat}`);
  if (e.industry) {
    const names = e.industry.materials.map((id) => MATERIAL_NAMES[MATERIAL_IDS.indexOf(id)].toLowerCase());
    out.push(`${names.join(', ')}: ${e.industry.yield} a gatherer, at most ${e.industry.cap} a deposit a year`);
  }
  if (e.store) out.push(`store holds ×${e.store}`);
  if (e.carry) out.push(`carrying ×${e.carry}`);
  if (e.progress) out.push(`progress +${pct(e.progress)}`);
  if (e.defence) out.push(`defence +${pct(e.defence)} here`);
  return out;
}

export class Settlements {
  /** map: the generated map; types[c]: civ type ids; seed: for names. */
  constructor(map, types, seed = '') {
    const n = map.count;
    const civs = types.length;
    this.n = n;
    this.civs = civs;
    this.types = types.slice();
    this.seed = String(seed);
    this.map = map;
    /** Civ that holds each hex (−1: nobody lives there). */
    this.holder = new Int8Array(n).fill(-1);
    /** Settlement tier per hex (−1: none). */
    this.tier = new Int8Array(n).fill(-1);
    this.below = new Int16Array(n);
    this.empty = new Int16Array(n);
    /** Highest tier each hex ever reached, the year, and its most people at that tier (end screen). */
    this.peakTier = new Int8Array(n).fill(-1);
    this.peakYear = new Int32Array(n);
    this.peakPeople = new Int32Array(n);
    this.store = new Float64Array(n * MATERIAL_COUNT);
    /** Standing settlement buildings per hex, bit k for SETTLEMENT_BUILDINGS[k]. */
    this.built = new Uint32Array(n);
    /** Planned building per hex (−1: none), whether it is started, years of work, years planned, and no plans before this year. */
    this.plan = new Int8Array(n).fill(-1);
    this.started = new Uint8Array(n);
    this.work = new Int16Array(n);
    this.planAge = new Int16Array(n);
    this.blockedTo = new Int32Array(n);
    this.capital = new Int32Array(civs).fill(-1);
    /** The least each civ's capital store must hold of one material (set by levels.js from its next spends). */
    this.capitalMin = new Float64Array(civs);
    /** Food carried into each hex this year; its smoothed average (support); goods sent and received. */
    this.carried = new Float32Array(n);
    this.imported = new Float32Array(n);
    this.sent = new Float32Array(n);
    this.received = new Float32Array(n);
    /** Share of its carrying capacity each hex used last year (it gathers that much less this year). */
    this.used = new Float32Array(n);
    /** 1 where some material hit its store cap last year. */
    this.full = new Uint8Array(n);
    /** Per-hex effects of tier and buildings, worked out each year. */
    this.housing = new Float32Array(n).fill(1e9);
    this.foodShare = new Float32Array(n);
    this.foodFlat = new Float32Array(n);
    this.defence = new Float32Array(n);
    this.storeCap = new Float32Array(n).fill(TIERS[0].store);
    this.carryMul = new Float32Array(n).fill(1);
    /** Store cap before the capital's share, progress from civic buildings, and the tier and buildings these were worked out for. */
    this.baseCap = new Float32Array(n).fill(TIERS[0].store);
    this.hexProgress = new Float32Array(n);
    this.civicCount = new Int32Array(civs * SB_COUNT);
    this.effTier = new Int8Array(n).fill(-1);
    this.effBuilt = new Uint32Array(n);
    /** Per hex and material: yield per gatherer and deposit cap with its industry buildings. */
    this.yieldPer = new Float32Array(n * MATERIAL_COUNT);
    this.capPer = new Float32Array(n * MATERIAL_COUNT);
    for (let h = 0; h < n; h++) this.setIndustry(h);
    /** Each civ's progress bonus from civic buildings (capped). */
    this.progress = new Float64Array(civs);
    /** Each civ's materials it holds anywhere or has a deposit of in a hex it holds (bitmask). */
    this.reachable = new Uint16Array(civs);
    this.topReach = new Int32Array(civs);
    /** Each civ's most populous hex this year (update's scratch for capitals). */
    this.capBest = new Int32Array(civs);
    this.pop = new Int32Array(n);
    // Routes this year: from, to, food, materials.
    this.routeCap = 8192;
    this.rFrom = new Int32Array(this.routeCap);
    this.rTo = new Int32Array(this.routeCap);
    this.rFood = new Float32Array(this.routeCap);
    this.rMat = new Float32Array(this.routeCap);
    this.routes = 0;
    // Scratch for the supply search.
    this.dist = new Int16Array(n).fill(-1);
    this.queue = new Int32Array(n);
    /** Water hexes in a row a search has sailed to reach each water hex. */
    this.sea = new Uint8Array(n);
    /** Per civ, water hexes in a row its boats cross (levels.js boatRange; set by Levels), 0 for none. */
    this.boats = null;
    this.left = new Float64Array(n);
    this.need = new Float64Array(MATERIAL_COUNT);
    this.civNeed = new Float64Array(MATERIAL_COUNT);
    this.order = new Int32Array(n);
    this.key = new Uint32Array(n);
    /** People who went hungry in each hex last year (set by choose). */
    this.hungry = null;
    // What each hex can spare this year, and each civ's totals, so searches stop when nothing is left.
    this.spareFood = new Float64Array(n);
    this.wantF = new Float64Array(n);
    this.rank = new Int32Array(n);
    this.pairKey = new Float64Array(4096);
    this.civFood = new Float64Array(civs);
    this.civMat = new Float64Array(civs * MATERIAL_COUNT);
    this.farm = new Uint8Array(n);
    this.water = new Uint8Array(n);
    const { terrain, river, neighbours } = map;
    for (let h = 0; h < n; h++) {
      if (terrain[h] === DEEP_WATER) continue;
      this.farm[h] = terrain[h] === PLAINS || terrain[h] === COAST || river[h] ? 1 : 0;
      for (let d = 0; d < 6; d++) {
        const t = neighbours[h * 6 + d];
        if (t >= 0 && terrain[t] === DEEP_WATER) this.water[h] = 1;
      }
    }
  }

  has(h, k) { return (this.built[h] & bit(k)) !== 0; }

  /** Yield per gatherer and deposit cap of each material in hex h, by hand or with its industry buildings. */
  setIndustry(h) {
    const b0 = h * MATERIAL_COUNT;
    for (let m = 0; m < MATERIAL_COUNT; m++) { this.yieldPer[b0 + m] = HAND_YIELD[m]; this.capPer[b0 + m] = HAND_CAP[m]; }
    const b = this.built[h];
    if (b === 0) return;
    for (let k = 0; k < SB_COUNT; k++) {
      if (!(b & bit(k)) || !IND_MASK[k]) continue;
      const w = SETTLEMENT_BUILDINGS[k].effects.industry;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        if (!(IND_MASK[k] & bit(m))) continue;
        if (w.yield > this.yieldPer[b0 + m]) this.yieldPer[b0 + m] = w.yield;
        if (w.cap > this.capPer[b0 + m]) this.capPer[b0 + m] = w.cap;
      }
    }
  }

  yieldOf(h, m) { return this.yieldPer[h * MATERIAL_COUNT + m]; }
  capOf(h, m) { return this.capPer[h * MATERIAL_COUNT + m]; }

  /**
   * Holders, tiers, capitals, ruins, store caps and building effects, from cnt[hex × civs + civ]
   * (people at the end of last year), fightWinner (last year's winners) and level[c].
   * onEvent(kind, civ, hex, year, other) reports 'tier' (a hex reached a new highest tier, from
   * city up; other = the tier) and 'taken' (a city or bigger changed hands; other = the civ it
   * was taken from).
   */
  update(cnt, fightWinner, level, year, onEvent = null) {
    const { n, civs, holder, tier, pop, capBest } = this;
    capBest.fill(-1);
    for (let h = 0; h < n; h++) {
      const b0 = h * civs;
      let p = 0;
      let best = -1;
      for (let c = 0; c < civs; c++) {
        const k = cnt[b0 + c];
        p += k;
        if (k > 0 && (best < 0 || k > cnt[b0 + best])) best = c;
      }
      pop[h] = p;
      const old = holder[h];
      // The holder keeps the hex unless it has left, lost a fight there, or is outnumbered takeOver to 1.
      let next = best;
      const w = fightWinner[h];
      if (w >= 0 && cnt[b0 + w] > 0) next = w;
      else if (old >= 0 && cnt[b0 + old] > 0 && cnt[b0 + best] < SETTLE.takeOver * cnt[b0 + old]) next = old;
      holder[h] = next;
      if (next >= 0) {
        const cb = capBest[next];
        if (cb < 0 || cnt[b0 + next] > cnt[cb * civs + next]) capBest[next] = h;
      }
      if (next < 0) {
        tier[h] = -1;
        this.below[h] = 0;
        if (this.built[h] !== 0 || this.plan[h] >= 0 || this.anyStore(h)) {
          if (++this.empty[h] >= SETTLE.ruinYears) this.ruin(h);
        }
        continue;
      }
      this.empty[h] = 0;
      if (old >= 0 && old !== next) {
        if (tier[h] >= CITY) onEvent?.('taken', next, h, year, old);
        const s0 = h * MATERIAL_COUNT;
        for (let m = 0; m < MATERIAL_COUNT; m++) this.store[s0 + m] *= 1 - SETTLE.looted;
        if (this.plan[h] >= 0) { this.plan[h] = -1; this.started[h] = 0; this.work[h] = 0; }
      }
      // Tier: up at once; down after shrinkYears below shrinkShare of the threshold; at once to the holder's cap.
      const lv = level[next];
      let t = tier[h];
      const top = TOP_TIER[lv];
      if (t > top) t = top;
      let reach = top;
      while (reach >= 0 && p < TIER_PEOPLE[reach]) reach--;
      if (reach > t) { t = reach; this.below[h] = 0; }
      else if (t > 0 && p < SETTLE.shrinkShare * TIERS[t].people) {
        if (++this.below[h] >= SETTLE.shrinkYears) { t--; this.below[h] = 0; }
      } else this.below[h] = 0;
      if (t < 0) t = 0;
      tier[h] = t;
      if (t > this.peakTier[h]) {
        this.peakTier[h] = t;
        this.peakYear[h] = year;
        this.peakPeople[h] = p;
        if (t >= CITY) onEvent?.('tier', next, h, year, t);
      } else if (t === this.peakTier[h] && p > this.peakPeople[h]) this.peakPeople[h] = p;
    }
    this.capitals(cnt);
    this.effects();
    this.capStores();
  }

  anyStore(h) {
    const b = h * MATERIAL_COUNT;
    for (let m = 0; m < MATERIAL_COUNT; m++) if (this.store[b + m] > 0) return true;
    return false;
  }

  ruin(h) {
    this.built[h] = 0;
    this.setIndustry(h);
    this.plan[h] = -1;
    this.started[h] = 0;
    this.work[h] = 0;
    this.empty[h] = 0;
    this.store.fill(0, h * MATERIAL_COUNT, (h + 1) * MATERIAL_COUNT);
  }

  /** Each civ's capital: kept while it holds it unless another of its hexes has capitalSwitch × the people (most people, then lower index). */
  capitals(cnt) {
    const { civs, holder } = this;
    for (let c = 0; c < civs; c++) {
      const best = this.capBest[c];
      const cur = this.capital[c];
      if (cur >= 0 && best >= 0 && holder[cur] === c && cnt[best * civs + c] < SETTLE.capitalSwitch * cnt[cur * civs + c]) continue;
      // The old capital's store goes back to its own cap.
      if (cur >= 0 && cur !== best) this.storeCap[cur] = this.baseCap[cur];
      this.capital[c] = best;
    }
  }

  /** Housing, food, store cap and carrying of each hex, and each civ's progress bonus, from tiers and buildings. */
  effects() {
    const { n, tier, built, holder, effTier, effBuilt, hexProgress, civicCount } = this;
    this.progress.fill(0);
    civicCount.fill(0);
    for (let h = 0; h < n; h++) {
      const t = tier[h];
      // Worked out again only when the tier or buildings changed.
      if (t !== effTier[h] || built[h] !== effBuilt[h]) {
        effTier[h] = t;
        effBuilt[h] = built[h];
        this.hexEffects(h, t);
      }
      if (t < 0 || hexProgress[h] <= 0) continue;
      const c = holder[h];
      const b = built[h] & CIVIC_MASK;
      for (let k = 0; k < SB_COUNT; k++) {
        if (!(b & bit(k)) || civicCount[c * SB_COUNT + k]++ >= CIVIC_COUNTED) continue;
        this.progress[c] += SETTLEMENT_BUILDINGS[k].effects.progress;
      }
    }
    // A capital's store cap: capitalStore × its own, and never below what its civ's next spends need.
    for (let c = 0; c < this.civs; c++) {
      if (this.progress[c] > MAX_PROGRESS_BONUS) this.progress[c] = MAX_PROGRESS_BONUS;
      const h = this.capital[c];
      if (h < 0) continue;
      let cap = this.baseCap[h] * SETTLE.capitalStore;
      if (cap < this.capitalMin[c]) cap = this.capitalMin[c];
      this.storeCap[h] = cap;
    }
  }

  hexEffects(h, t) {
    if (t < 0) {
      this.housing[h] = 1e9; this.foodShare[h] = 0; this.foodFlat[h] = 0; this.defence[h] = 0;
      this.baseCap[h] = this.storeCap[h] = TIERS[0].store; this.carryMul[h] = 1; this.hexProgress[h] = 0;
      return;
    }
    const T = TIERS[t];
    let housing = T.housing;
    let housingPct = 0;
    let food = T.food;
    let flat = 0;
    let defence = 0;
    let store = 1;
    let carry = 1;
    let progress = 0;
    const b = this.built[h];
    if (b !== 0) {
      for (let k = 0; k < SB_COUNT; k++) {
        if (!(b & bit(k))) continue;
        const e = SETTLEMENT_BUILDINGS[k].effects;
        if (e.housing) housing += e.housing;
        if (e.housingPct) housingPct += e.housingPct;
        if (e.food) food += e.food;
        if (e.foodFlat) flat += e.foodFlat;
        if (e.defence) defence += e.defence;
        if (e.store) store *= e.store;
        if (e.carry) carry *= e.carry;
        if (e.progress) progress += e.progress;
      }
    }
    this.housing[h] = housing + T.housing * housingPct;
    this.foodShare[h] = food;
    this.foodFlat[h] = flat;
    this.defence[h] = defence;
    this.baseCap[h] = this.storeCap[h] = T.store * store;
    this.carryMul[h] = carry;
    this.hexProgress[h] = progress;
  }

  /** Stock above a store's cap decays by overCapDecay a year (a lowered cap, a lost warehouse, a moved capital). */
  capStores() {
    const { n, store, storeCap } = this;
    for (let h = 0; h < n; h++) {
      const cap = storeCap[h];
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const i = h * MATERIAL_COUNT + m;
        if (store[i] > cap) { store[i] = cap + (store[i] - cap) * (1 - SETTLE.overCapDecay); this.full[h] = 1; }
      }
    }
  }

  /** Into out[c × MATERIAL_COUNT + m]: what each civ holds of each material, all its stores together. */
  totals(out) {
    out.fill(0);
    const { n, holder, store } = this;
    for (let h = 0; h < n; h++) {
      const c = holder[h];
      if (c < 0) continue;
      for (let m = 0; m < MATERIAL_COUNT; m++) out[c * MATERIAL_COUNT + m] += store[h * MATERIAL_COUNT + m];
    }
  }

  /** Bitmask of the materials hex h's unstarted plan still needs beyond its store. */
  planMask(h) {
    const k = this.plan[h];
    if (k < 0 || this.started[h]) return 0;
    const cost = SETTLEMENT_BUILDINGS[k].cost;
    let mask = 0;
    for (let m = 0; m < MATERIAL_COUNT; m++) if (this.store[h * MATERIAL_COUNT + m] < cost[m]) mask |= bit(m);
    return mask;
  }

  /** Whether building k can go in hex h (tier, the holder's level, site, not there yet). */
  eligible(h, k, deposits, level) {
    const b = SETTLEMENT_BUILDINGS[k];
    if (this.tier[h] < b.tier || this.has(h, k) || level[this.holder[h]] < b.level) return false;
    if (b.site === 'farm') return this.farm[h] === 1;
    if (b.site === 'water') return this.water[h] === 1;
    if (b.site === 'capital') return this.capital[this.holder[h]] === h;
    if (b.site === 'deposit') return (deposits[h] & IND_MASK[k]) !== 0;
    return true;
  }

  /** Buildings standing or planned in h. */
  slotsUsed(h) {
    let b = this.built[h];
    let k = 0;
    while (b) { k += b & 1; b >>>= 1; }
    return k + (this.plan[h] >= 0 ? 1 : 0);
  }

  /**
   * What each settlement with a free slot and no plan decides to build (every planEvery years,
   * staggered by hex), and plans that waited planYears are dropped. wanted[c]: bitmask of the
   * materials civ c gathers for. hungry[h]: people who went hungry in h last year.
   * threatNear(h, c): a threat it does not beat is in or next to h. A building needing a
   * material the civ has nowhere (no stock, no deposit in a hex it holds) is not planned.
   */
  choose(year, deposits, level, wanted, hungry, threatNear) {
    this.hungry = hungry;
    const { n, tier, holder } = this;
    // What each civ has, or can dig, anywhere.
    this.reachable.fill(0);
    for (let h = 0; h < n; h++) {
      const c = holder[h];
      if (c < 0) continue;
      let mask = deposits[h];
      for (let m = 0; m < MATERIAL_COUNT; m++) if (this.store[h * MATERIAL_COUNT + m] > 0) mask |= bit(m);
      this.reachable[c] |= mask;
    }
    for (let h = 0; h < n; h++) {
      const t = tier[h];
      if (t < 0) continue;
      if (this.plan[h] >= 0 && !this.started[h] && ++this.planAge[h] >= SETTLE.planYears) {
        this.plan[h] = -1;
        this.planAge[h] = 0;
        this.blockedTo[h] = year + SETTLE.blockYears;
      }
      if (this.plan[h] >= 0 || year < this.blockedTo[h] || (h + year) % SETTLE.planEvery !== 0) continue;
      if (this.slotsUsed(h) >= TIERS[t].slots) continue;
      const c = holder[h];
      const type = this.types[c];
      const tilt = PLAN.tilt[type] ?? null;
      const sc = PLAN.scores;
      const p = this.pop[h];
      let best = -1;
      let bestScore = 0;
      for (let k = 0; k < SB_COUNT; k++) {
        if (!this.eligible(h, k, deposits, level)) continue;
        if (COST_MASK[k] & ~this.reachable[c]) continue;
        const b = SETTLEMENT_BUILDINGS[k];
        let v = 0;
        if (b.kind === 'housing') v = p >= PLAN.housingFull * this.housing[h] ? sc.housing : 0;
        else if (b.kind === 'food') v = p > 0 && hungry[h] >= PLAN.hungryShare * p ? sc.food : 0;
        else if (b.kind === 'industry') v = ((deposits[h] & IND_MASK[k] & wanted[c]) ? sc.industryWanted : sc.industry) + IND_RARITY[k];
        else if (b.id === 'warehouse') v = this.full[h] ? sc.warehouse : 0;
        else if (b.id === 'market') v = this.sent[h] + this.received[h] >= PLAN.marketCarried ? sc.market : 0;
        else if (b.kind === 'defence') v = threatNear(h, c) ? sc.defence : 0;
        else if (b.kind === 'civic') v = sc.civic;
        if (v === 0) continue;
        if (tilt && tilt[b.kind]) v *= tilt[b.kind];
        if (v > bestScore) { bestScore = v; best = k; }
      }
      if (best < 0 || (type === 'nomadic' && bestScore < PLAN.nomadicMin)) continue;
      this.plan[h] = best;
      this.started[h] = 0;
      this.work[h] = 0;
      this.planAge[h] = 0;
    }
    this.full.fill(0);
  }

  /** Start planned buildings whose store holds the cost, and count a year of work on started ones. */
  build(year, onEvent = null) {
    const { n, tier } = this;
    for (let h = 0; h < n; h++) {
      const k = this.plan[h];
      if (k < 0 || tier[h] < 0) continue;
      const b = SETTLEMENT_BUILDINGS[k];
      if (!this.started[h]) {
        const base = h * MATERIAL_COUNT;
        let ok = true;
        for (let m = 0; m < MATERIAL_COUNT; m++) if (this.store[base + m] < b.cost[m]) { ok = false; break; }
        if (!ok) continue;
        for (let m = 0; m < MATERIAL_COUNT; m++) this.store[base + m] -= b.cost[m];
        this.started[h] = 1;
        this.work[h] = 0;
      }
      if (++this.work[h] >= b.years) {
        this.built[h] |= bit(k);
        this.plan[h] = -1;
        this.started[h] = 0;
        this.work[h] = 0;
        if (IND_MASK[k]) this.setIndustry(h);
        onEvent?.('built', this.holder[h], h, year, k);
      }
    }
  }

  /** Add y of material m to hex h's store, up to its cap; returns what fitted. */
  put(h, m, y) {
    const i = h * MATERIAL_COUNT + m;
    const room = this.storeCap[h] - this.store[i];
    if (room <= 0) { this.full[h] = 1; return 0; }
    if (y >= room) { this.store[i] = this.storeCap[h]; this.full[h] = 1; return room; }
    this.store[i] += y;
    return y;
  }

  /**
   * Supply routes for the year. Every settlement that wants something searches the hexes its civ
   * holds, over land it holds, nearest first (a ring in hex order), biggest settlement first
   * (tier, then people, then a hash of hex and year). It wants: food, when it holds less than
   * foodKeep years' food for its people; materials its planned building still needs; and, for a
   * capital, what its civ's next spend still needs (target[c × MATERIAL_COUNT + m]) beyond its
   * store. Food and plan materials come from hexes no farther than the larger of the two ends'
   * reach; a capital's civ materials from any hex it reaches over held land. Suppliers give food
   * they grow beyond what their people eat (and keep foodKeep years' food), materials beyond
   * their own plan (a capital never gives its own), within their carrying capacity. Food loses
   * spoilPerStep of what was sent per step.
   */
  carry(map, target, year) {
    const { n, holder, tier, pop, store, dist, queue, left, need, civNeed } = this;
    const { food, neighbours, terrain } = map;
    this.carried.fill(0);
    this.sent.fill(0);
    this.received.fill(0);
    this.routes = 0;
    this.topReach.fill(0);
    const { spareFood, civFood, civMat } = this;
    civFood.fill(0);
    civMat.fill(0);
    let count = 0;
    for (let h = 0; h < n; h++) {
      const c = holder[h];
      left[h] = c >= 0 ? SETTLE.carryPerPerson * pop[h] * this.carryMul[h] : 0;
      spareFood[h] = 0;
      if (left[h] > 0) {
        const f = Math.min(food[h] - SETTLE.foodKeep * pop[h], 0.5 * map.foodCap[h] - pop[h]);
        if (f >= SETTLE.minLoad) { spareFood[h] = f; civFood[c] += f; }
        const k = this.plan[h];
        const own = k >= 0 && !this.started[h] ? SETTLEMENT_BUILDINGS[k].cost : null;
        const isCap = this.capital[c] === h;
        const s0 = h * MATERIAL_COUNT;
        const c0 = c * MATERIAL_COUNT;
        for (let m = 0; m < MATERIAL_COUNT; m++) {
          const st = store[s0 + m];
          if (st <= 0) continue;
          const v = st - (own ? own[m] : 0) - (isCap ? this.civKeep(c, m) : 0);
          if (v > 0) civMat[c0 + m] += v;
        }
      }
      if (tier[h] < 0) continue;
      this.order[count++] = h;
      const r = TIERS[tier[h]].reach;
      if (r > this.topReach[holder[h]]) this.topReach[holder[h]] = r;
      this.key[h] = (Math.imul(h + 1, 0x9e3779b1) ^ Math.imul(year + 1, 0x85ebca6b)) >>> 0;
    }
    const ord = this.order.subarray(0, count);
    const key = this.key;
    ord.sort((a, b) => tier[b] - tier[a] || pop[b] - pop[a] || key[a] - key[b] || a - b);
    const { wantF, rank } = this;
    for (let i = 0; i < count; i++) {
      const h = ord[i];
      const c = holder[h];
      rank[h] = i;
      const isCap = this.capital[c] === h;
      let wantPlan = false;
      let wantCiv = false;
      need.fill(0);
      civNeed.fill(0);
      const s0 = h * MATERIAL_COUNT;
      if (this.plan[h] >= 0 && !this.started[h]) {
        const cost = SETTLEMENT_BUILDINGS[this.plan[h]].cost;
        for (let m = 0; m < MATERIAL_COUNT; m++) {
          const v = Math.min(cost[m] - store[s0 + m], civMat[c * MATERIAL_COUNT + m]);
          if (v > 0) { need[m] = v; wantPlan = true; }
        }
      }
      if (isCap) {
        for (let m = 0; m < MATERIAL_COUNT; m++) {
          let v = target[c * MATERIAL_COUNT + m] + need[m] - store[s0 + m];
          const room = this.storeCap[h] - store[s0 + m];
          if (v > room) v = room;
          v = Math.min(v - need[m], civMat[c * MATERIAL_COUNT + m] - need[m]);
          if (v > 0) { civNeed[m] = v; wantCiv = true; }
        }
      }
      // Food is asked for only where people went hungry last year.
      const f = this.hungry && this.hungry[h] >= SETTLE.askHungry * pop[h] ? SETTLE.foodKeep * pop[h] - food[h] : 0;
      wantF[h] = f > 0 && civFood[c] > 0 ? f : 0;
      if (!wantPlan && !wantCiv) continue;
      const myReach = TIERS[tier[h]].reach;
      const near = Math.max(myReach, this.topReach[c]);
      const range = this.boats ? this.boats[c] : 0;
      let head = 0;
      let tail = 0;
      let ringStart = 0;
      dist[h] = 0;
      queue[tail++] = h;
      while (head < tail && (wantPlan || wantCiv)) {
        if (head === ringStart) { sortRange(queue, ringStart, tail); ringStart = tail; }
        const sp = queue[head++];
        const d = dist[sp];
        if (sp !== h && left[sp] > 0) {
          const local = d <= myReach || (tier[sp] >= 0 && d <= TIERS[tier[sp]].reach);
          this.pull(map, h, sp, c, d, local, wantPlan, wantCiv, 0);
          if (wantPlan) wantPlan = anyLeft(need);
          if (wantCiv) wantCiv = anyLeft(civNeed);
        }
        // Past every reach that matters, only a capital's civ materials keep the search going.
        if (d >= near && !wantCiv) continue;
        // Over held land, and with boats across up to their range of water hexes in a row.
        const wet = terrain[sp] === DEEP_WATER;
        for (let k = 0; k < 6; k++) {
          const t = neighbours[sp * 6 + k];
          if (t < 0 || dist[t] >= 0) continue;
          if (terrain[t] === DEEP_WATER) {
            const run = wet ? this.sea[sp] + 1 : 1;
            if (run > range) continue;
            this.sea[t] = run;
          } else if (holder[t] !== c) continue;
          dist[t] = d + 1;
          queue[tail++] = t;
        }
      }
      for (let k = 0; k < tail; k++) dist[queue[k]] = -1;
    }
    this.carryFood(map, ord);
    // This year's use of each hex's carrying capacity (it gathers less next year), and the smoothed food imports.
    const a = SETTLE.importSmooth;
    for (let h = 0; h < n; h++) {
      const capH = holder[h] >= 0 ? SETTLE.carryPerPerson * pop[h] * this.carryMul[h] : 0;
      this.used[h] = capH > 0 ? Math.min(1, this.sent[h] / capH) : 0;
      this.imported[h] = holder[h] >= 0 ? (1 - a) * this.imported[h] + a * this.carried[h] : 0;
    }
  }

  /**
   * Food routes, after materials. Few hexes have food to spare, so the search starts from them:
   * each finds the hungry settlements of its civ within reach over held land, then the pairs are
   * served biggest settlement first (the order in `ord`), nearest supplier first, then by hex.
   */
  carryFood(map, ord) {
    const { n, holder, tier, dist, queue, spareFood, wantF, rank } = this;
    const { neighbours, terrain } = map;
    let pairs = 0;
    for (let s = 0; s < n; s++) {
      if (spareFood[s] <= 0) continue;
      const c = holder[s];
      const top = this.topReach[c];
      const rs = tier[s] >= 0 ? TIERS[tier[s]].reach : 0;
      let head = 0;
      let tail = 0;
      dist[s] = 0;
      queue[tail++] = s;
      while (head < tail) {
        const t = queue[head++];
        const d = dist[t];
        if (t !== s && wantF[t] > 0 && (d <= rs || d <= TIERS[tier[t]].reach)) {
          if (pairs === this.pairKey.length) this.growPairs();
          // One sortable number: demander's rank, then distance, then supplier.
          this.pairKey[pairs++] = (rank[t] * 64 + d) * n + s;
        }
        if (d >= top) continue;
        for (let k = 0; k < 6; k++) {
          const u = neighbours[t * 6 + k];
          if (u < 0 || dist[u] >= 0 || terrain[u] === DEEP_WATER || holder[u] !== c) continue;
          dist[u] = d + 1;
          queue[tail++] = u;
        }
      }
      for (let k = 0; k < tail; k++) dist[queue[k]] = -1;
    }
    const keys = this.pairKey.subarray(0, pairs);
    keys.sort();
    for (let i = 0; i < pairs; i++) {
      const key = keys[i];
      const s = key % n;
      const q = (key - s) / n;
      const d = q % 64;
      const h = ord[(q - d) / 64];
      if (wantF[h] <= 0 || spareFood[s] <= 0 || this.left[s] <= 0) continue;
      wantF[h] -= this.pull(map, h, s, holder[h], d, true, false, false, wantF[h]);
    }
    for (let h = 0; h < n; h++) wantF[h] = 0;
  }

  /** Room for more food pairs (rare: kept between years). */
  growPairs() {
    const next = new Float64Array(this.pairKey.length * 2);
    next.set(this.pairKey);
    this.pairKey = next;
  }

  /**
   * Demander h (civ c) takes from supplier s at d steps: materials for its plan (when s is
   * local) and for its civ (any distance), then food (when local). Returns the food that arrived.
   */
  pull(map, h, s, c, d, local, wantPlan, wantCiv, wantFood) {
    const { store, left, need, civNeed } = this;
    let food = 0;
    let sent = 0;
    let mat = 0;
    if ((wantPlan && local) || wantCiv) {
      for (let m = 0; m < MATERIAL_COUNT && left[s] > 0; m++) {
        const want = (wantPlan && local ? need[m] : 0) + (wantCiv ? civNeed[m] : 0);
        if (want <= 0) continue;
        const i = s * MATERIAL_COUNT + m;
        const spare = this.spare(s, c, m);
        if (spare <= 0) continue;
        let v = Math.min(spare, want, left[s]);
        v = this.put(h, m, v);
        if (v <= 0) continue;
        store[i] -= v;
        left[s] -= v;
        this.civMat[c * MATERIAL_COUNT + m] -= v;
        mat += v;
        // Plan first, then the civ.
        const fromPlan = wantPlan && local ? Math.min(need[m], v) : 0;
        need[m] -= fromPlan;
        civNeed[m] -= v - fromPlan;
      }
    }
    if (wantFood > 0 && local && left[s] > 0) {
      const spare = this.spareFood[s];
      const keep = 1 - SETTLE.spoilPerStep * d;
      if (spare > 0 && keep > 0) {
        const v = Math.min(spare, wantFood / keep, left[s]);
        map.food[s] -= v;
        this.spareFood[s] -= v;
        this.civFood[c] -= v;
        left[s] -= v;
        sent = v;
        food = v * keep;
        map.food[h] += food;
        this.carried[h] += food;
      }
    }
    if (food + mat <= 0) return 0;
    this.sent[s] += sent + mat;
    this.received[h] += food + mat;
    if (this.routes < this.routeCap) {
      const r = this.routes++;
      this.rFrom[r] = s; this.rTo[r] = h; this.rFood[r] = food; this.rMat[r] = mat;
    }
    return food;
  }

  /** Material m that hex s (civ c) can give: its store beyond its own planned building and, for a capital, what its civ is saving for. */
  spare(s, c, m) {
    const k = this.plan[s];
    const own = k >= 0 && !this.started[s] ? SETTLEMENT_BUILDINGS[k].cost[m] : 0;
    return this.store[s * MATERIAL_COUNT + m] - own - (this.capital[c] === s ? this.civKeep(c, m) : 0);
  }

  /** What civ c's capital keeps of material m when another settlement asks (set by levels.js). */
  civKeep(c, m) { return this.keep ? this.keep[c * MATERIAL_COUNT + m] : 0; }

  /** Name, tier and place of the settlement in hex h. */
  describeBrief(h) {
    const cols = this.map.cols;
    const t = this.tier[h];
    return { hex: h, col: h % cols, row: Math.floor(h / cols), name: settlementName(this.seed, h), tier: t, tierName: t >= 0 ? TIER_NAMES[t] : null };
  }

  /** Plain data for hex h, or null when nobody lives there. */
  describe(h, cols) {
    const t = this.tier[h];
    if (t < 0) return null;
    const store = {};
    for (let m = 0; m < MATERIAL_COUNT; m++) {
      const v = this.store[h * MATERIAL_COUNT + m];
      if (v >= 0.05) store[MATERIAL_IDS[m]] = v;
    }
    const buildings = [];
    for (let k = 0; k < SB_COUNT; k++) {
      if (this.has(h, k)) buildings.push({ id: SETTLEMENT_BUILDINGS[k].id, name: SETTLEMENT_BUILDINGS[k].name, kind: SETTLEMENT_BUILDINGS[k].kind, status: 'standing', bonuses: settlementEffectText(SETTLEMENT_BUILDINGS[k]) });
    }
    const k = this.plan[h];
    if (k >= 0) {
      const b = SETTLEMENT_BUILDINGS[k];
      buildings.push({ id: b.id, name: b.name, kind: b.kind, status: this.started[h] ? 'building' : 'planned', work: this.work[h], years: b.years,
        cost: Object.fromEntries(MATERIAL_IDS.map((id, m) => [id, b.cost[m]]).filter(([, v]) => v > 0)), bonuses: settlementEffectText(b) });
    }
    const routesIn = [];
    const routesOut = [];
    for (let r = 0; r < this.routes; r++) {
      const e = { food: this.rFood[r], materials: this.rMat[r] };
      if (this.rTo[r] === h) routesIn.push({ hex: this.rFrom[r], col: this.rFrom[r] % cols, row: Math.floor(this.rFrom[r] / cols), ...e });
      if (this.rFrom[r] === h) routesOut.push({ hex: this.rTo[r], col: this.rTo[r] % cols, row: Math.floor(this.rTo[r] / cols), ...e });
    }
    const c = this.holder[h];
    return {
      name: settlementName(this.seed, h),
      tier: t,
      tierName: TIER_NAMES[t],
      holder: c,
      capital: this.capital[c] === h,
      people: this.pop[h],
      housing: Math.round(this.housing[h]),
      slots: TIERS[t].slots,
      storeCap: Math.round(this.storeCap[h]),
      store,
      buildings,
      imported: this.imported[h],
      routesIn,
      routesOut,
    };
  }

  /** Every settlement for drawing: typed arrays of tier, holder, built bits, plan and started, capitals and this year's routes. */
  snapshot() {
    const n = this.routes;
    return {
      tier: this.tier.slice(),
      holder: this.holder.slice(),
      built: this.built.slice(),
      plan: this.plan.slice(),
      started: this.started.slice(),
      capital: Array.from(this.capital),
      routes: { from: this.rFrom.slice(0, n), to: this.rTo.slice(0, n), food: this.rFood.slice(0, n), materials: this.rMat.slice(0, n) },
    };
  }

  /** The biggest settlements ever (end screen): peak tier, then most people at it, at most `limit`. */
  greatest(cols, limit = 5) {
    const list = [];
    for (let h = 0; h < this.n; h++) if (this.peakTier[h] >= TOWN) list.push(h);
    list.sort((a, b) => this.peakTier[b] - this.peakTier[a] || this.peakPeople[b] - this.peakPeople[a] || a - b);
    return list.slice(0, limit).map((h) => ({
      hex: h, col: h % cols, row: Math.floor(h / cols), name: settlementName(this.seed, h),
      tier: this.peakTier[h], tierName: TIER_NAMES[this.peakTier[h]], people: this.peakPeople[h], year: this.peakYear[h],
      holder: this.holder[h], tierNow: this.tier[h],
    }));
  }
}

function anyLeft(a) {
  for (let m = 0; m < a.length; m++) if (a[m] > 1e-9) return true;
  return false;
}

/** Insertion sort of a[lo … hi) ascending (rings are a few dozen hexes at most). */
function sortRange(a, lo, hi) {
  for (let i = lo + 1; i < hi; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= lo && a[j] > v) { a[j + 1] = a[j]; j--; }
    a[j + 1] = v;
  }
}
