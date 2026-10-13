// Buildings and wonders. Every number here is listed in RULES.md ("Buildings
// and wonders").
//
// Each era (levels 1 to 4) every civ type has its own building, optional: its
// bonus helps, but a civ can climb without it; each era also has one wonder
// that only the first civ to finish it gets. A building or wonder stands in one
// hex and lasts while its civ keeps people there. Their bonuses are civ-wide.
//
// Run once a year inside the levels step (levels.js), from the counts taken at
// the end of last year, after gathering and before levelling. Nothing here uses
// randomness: sites, decisions, completions and captures are all settled by
// fixed rules (most people, then the lower civ number or hex index).

import { MATERIAL_COUNT, MATERIAL_IDS, MATERIAL_NAMES, COST_EPS } from './materials.js';
import { DEEP_WATER, HILLS, MOUNTAIN, DESERT, TUNDRA } from './terrain.js';

/** Eras with a building and a wonder: levels 1 (Foragers) to 4 (Organised). */
export const ERAS = 4;

const mats = (o) => Object.freeze(MATERIAL_IDS.map((id) => o[id] ?? 0));

/**
 * What an era's building costs (every type the same) and the years of work it takes.
 * A year counts as work only while the building's hex holds at least the people per
 * hex the civ's next level asks for (levels.js REQUIREMENTS perHex).
 */
export const BUILDING_COST = Object.freeze([
  Object.freeze({ materials: mats({ wood: 40, stone: 30, clay: 15 }), years: 30 }),
  Object.freeze({ materials: mats({ wood: 100, stone: 80, clay: 50, copper: 15 }), years: 50 }),
  Object.freeze({ materials: mats({ stone: 150, copper: 40, iron: 30, salt: 20 }), years: 80 }),
  Object.freeze({ materials: mats({ iron: 80, gold: 15, gemstones: 8, spices: 10 }), years: 120 }),
]);

/**
 * Bonus kinds, all civ-wide while the building stands:
 * birth (birth chance, + percentage points as a share), food (food capacity of every hex it
 * lives in), foodHarsh (the same on hills, mountain, desert and tundra), gather (gathering yield),
 * gatherRare (yield of uncommon and exotic materials), strength (in fights), defence (added to the
 * defence bonus of hexes it holds in a fight), warLoss (fewer of its people die when it loses a
 * fight), oldAge (years later), hunger (less health lost in a hungry year), loyalty (its people
 * switch away less), attract (people of other civs sharing a hex with it switch to it more), move (movement points; only walkers, the Nomadic, use them), land (fewer
 * hexes and people needed for levels), cost (fewer materials for levels and buildings), years
 * (fewer years needed at a level).
 */
export const EFFECT_KEYS = Object.freeze(['birth', 'food', 'foodHarsh', 'gather', 'gatherRare', 'strength', 'defence',
  'warLoss', 'oldAge', 'hunger', 'loyalty', 'attract', 'move', 'land', 'cost', 'years']);

const b = (id, name, effects) => Object.freeze({ id, name, effects: Object.freeze(effects) });

/** BUILDINGS[type][era − 1]. */
export const BUILDINGS = Object.freeze({
  expansionist: Object.freeze([
    b('trailhead', 'Trailhead Lodge', { birth: 0.0025 }),
    b('granary', 'Granary', { food: 0.05 }),
    b('roads', 'Road Network', { land: 0.1 }),
    b('colonialOffice', 'Colonial Office', { food: 0.05, birth: 0.0025 }),
  ]),
  aggressive: Object.freeze([
    b('warTotem', 'War Totem', { strength: 0.25, warLoss: 0.2 }),
    b('barracks', 'Barracks', { warLoss: 0.5 }),
    b('forge', 'Forge', { strength: 0.25 }),
    b('citadel', 'Citadel', { defence: 0.5, strength: 0.15 }),
  ]),
  cooperative: Object.freeze([
    b('councilFire', 'Council Fire', { gather: 0.2 }),
    b('market', 'Market', { loyalty: 0.5, attract: 0.5 }),
    b('guildHall', 'Guild Hall', { cost: 0.15, defence: 0.25 }),
    b('senate', 'Senate', { birth: 0.005, attract: 0.5 }),
  ]),
  isolationist: Object.freeze([
    b('ancestorShrine', 'Ancestor Shrine', { oldAge: 4 }),
    b('terraces', 'Terraces', { foodHarsh: 0.25 }),
    b('walls', 'Walls', { defence: 0.75 }),
    b('observatory', 'Observatory', { gather: 0.3, years: 0.1 }),
  ]),
  nomadic: Object.freeze([
    b('tentCircle', 'Tent Circle', { hunger: 0.25 }),
    b('caravanserai', 'Caravanserai', { gatherRare: 0.3 }),
    b('horsePaddock', 'Horse Paddock', { move: 1, strength: 0.1 }),
    b('khansCourt', "Khan's Court", { strength: 0.15, hunger: 0.25 }),
  ]),
});

/** WONDERS[era − 1]: one per era for the whole world. */
export const WONDERS = Object.freeze([
  Object.freeze({ id: 'sunCircle', name: 'Sun Circle', materials: mats({ wood: 160, stone: 120, clay: 80 }), years: 40,
    effects: Object.freeze({ birth: 0.01, loyalty: 0.5 }) }),
  Object.freeze({ id: 'hangingGardens', name: 'Hanging Gardens', materials: mats({ stone: 250, clay: 150, copper: 60, gold: 10 }), years: 70,
    effects: Object.freeze({ food: 0.3 }) }),
  Object.freeze({ id: 'greatWall', name: 'Great Wall', materials: mats({ stone: 400, copper: 80, iron: 80, gemstones: 15 }), years: 100,
    effects: Object.freeze({ defence: 1, strength: 0.5 }) }),
  Object.freeze({ id: 'grandLibrary', name: 'Grand Library', materials: mats({ iron: 200, gold: 40, gemstones: 30, spices: 30 }), years: 120,
    effects: Object.freeze({ gather: 1, years: 0.3 }) }),
]);

export const WONDER_RULES = Object.freeze({
  /** How strongly each type leans towards a wonder (the go-for-it score's first factor). */
  lean: Object.freeze({ expansionist: 0.75, aggressive: 0.8, cooperative: 1.2, isolationist: 1.3, nomadic: 1 }),
  /** The score is multiplied by this once for each wonder the civ already owns, so wonders spread out. */
  perOwned: 0.7,
  /** The land factor (hexes held ÷ hexes the next level needs) counts at most this. */
  landCap: 1.5,
  /** A civ commits when the score is at least this. */
  commitScore: 1,
  /** A civ that has not committed checks again this many years later. */
  checkYears: 25,
  /** A committed civ that has not started gives up when its safety falls below this … */
  giveUpSafety: 0.5,
  /** … or after this many years without starting. */
  giveUpYears: 200,
  /** Share of their materials the other builders get back when someone else finishes first. */
  refund: 0.5,
});

/** Loyalty, war-loss and hunger bonuses add up to at most this share. */
export const MAX_SHARE = 0.75;
const CAPPED = ['loyalty', 'warLoss', 'hunger'];

/** Site choice: own people × (1 + this × own land neighbours) … */
export const SITE = Object.freeze({ neighbourWeight: 0.2, sharedFactor: 0.5, threatFactor: 0.25 });

/** Building states (per civ per era) and wonder attempts (per civ per era). */
export const NONE = 0;
export const BUILDING = 1;
export const STANDING = 2;
/** A civ going for a wonder: committed and gathering, then building. */
export const COMMITTED = 1;

const isHarshFood = (t) => t === HILLS || t === MOUNTAIN || t === DESERT || t === TUNDRA;
const pctOff = (share) => 100 - Math.round(share * 100);
/** Materials after a reduction in whole percent, rounded up: ⌈v × pct ÷ 100⌉. */
export const reduce = (v, pct) => Math.floor((v * pct + 99) / 100);

/** The building of civ type `type` for era `era` (1 to 4). */
export const buildingOf = (type, era) => BUILDINGS[type]?.[era - 1] ?? null;

/** Plain words for a set of effects, one phrase per bonus. */
export function effectText(effects) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const out = [];
  for (const k of EFFECT_KEYS) {
    const v = effects[k];
    if (!v) continue;
    if (k === 'birth') out.push(`birth chance +${Math.round(v * 10000) / 100} pt`);
    else if (k === 'food') out.push(`food capacity +${pct(v)} in every hex it lives in`);
    else if (k === 'foodHarsh') out.push(`food capacity +${pct(v)} on hills, mountain, desert and tundra`);
    else if (k === 'gather') out.push(v >= 1 ? `gathering ×${1 + v}` : `gathering +${pct(v)}`);
    else if (k === 'gatherRare') out.push(`gathering of uncommon and exotic materials +${pct(v)}`);
    else if (k === 'strength') out.push(`strength in fights +${pct(v)}`);
    else if (k === 'defence') out.push(`defence +${pct(v)} in every hex it holds`);
    else if (k === 'warLoss') out.push(`${pct(v)} fewer war deaths when it loses a fight`);
    else if (k === 'oldAge') out.push(`old age starts ${v} years later`);
    else if (k === 'hunger') out.push(`hunger's health loss −${pct(v)}`);
    else if (k === 'loyalty') out.push(`its people switch to other civs ${pct(v)} less often`);
    else if (k === 'attract') out.push(`people of other civs in its hexes join it ${pct(v)} more often`);
    else if (k === 'move') out.push(`+${v} movement point${v > 1 ? 's' : ''} (for walkers, the Nomadic)`);
    else if (k === 'land') out.push(`hexes and people needed for levels −${pct(v)}`);
    else if (k === 'cost') out.push(`materials for levels and buildings −${pct(v)}`);
    else if (k === 'years') out.push(`years needed at a level −${pct(v)}`);
  }
  return out;
}

/** Plain words for a material list (MATERIAL_IDS order). */
export function materialText(list) {
  return list.map((v, m) => (v > 0 ? `${v} ${MATERIAL_NAMES[m].toLowerCase()}` : null)).filter(Boolean).join(', ');
}

export class Buildings {
  /** types[c]: civ c's type id. */
  constructor(map, types) {
    const civs = types.length;
    this.civs = civs;
    this.types = types.slice();
    const E = ERAS;
    // Each civ's era buildings, [civ × ERAS + era − 1].
    this.state = new Uint8Array(civs * E);
    this.hex = new Int32Array(civs * E).fill(-1);
    this.work = new Int32Array(civs * E);
    this.destroyed = new Int32Array(civs * E);
    // Each civ's go at each era's wonder, same indexing.
    this.attempt = new Uint8Array(civs * E);
    this.aHex = new Int32Array(civs * E).fill(-1);
    this.aWork = new Int32Array(civs * E);
    this.aSince = new Int32Array(civs * E);
    this.aCheck = new Int32Array(civs * E).fill(-1000000);
    // The wonders: owner (−1: abandoned or not built), hex, the civ that finished it, the year, captures.
    this.wOwner = new Int32Array(E).fill(-1);
    this.wHex = new Int32Array(E).fill(-1);
    this.wBuilder = new Int32Array(E).fill(-1);
    this.wYear = new Int32Array(E).fill(-1);
    this.wCaptures = new Int32Array(E);
    // Per-civ totals of the bonuses of everything it has standing.
    this.eff = {};
    for (const k of EFFECT_KEYS) this.eff[k] = new Float64Array(civs);
    this.terrain = map.terrain;
    this.neighbours = map.neighbours;
    this.n = map.count;
    this.scratch = new Float64Array(MATERIAL_COUNT);
  }

  /** Era building of civ c for era e (1 to 4) is standing. */
  standing(c, e) { return this.state[c * ERAS + e - 1] === STANDING; }

  /** Whole-percent factor (100 = none) a civ's materials are multiplied by (Guild Hall). */
  costPct(c) { return pctOff(this.eff.cost[c]); }

  /** Era-e building cost for civ c (after its cost bonus), into out. */
  buildingCost(c, e, out) {
    const pct = this.costPct(c);
    const base = BUILDING_COST[e - 1].materials;
    for (let m = 0; m < MATERIAL_COUNT; m++) out[m] = reduce(base[m], pct);
    return out;
  }

  /** Something (a building, a wonder, or work on either) is in hex h. */
  occupied(h) {
    for (let k = 0; k < this.hex.length; k++) if (this.hex[k] === h || this.aHex[k] === h) return true;
    for (let e = 0; e < ERAS; e++) if (this.wHex[e] === h) return true;
    return false;
  }

  /**
   * The hex civ c builds in: a free land hex where it has at least `need` people
   * (or, with none, its biggest), scored by its people × (1 + 0.2 × its land
   * neighbours holding its people), × 0.5 if another civ lives there, × 0.25 if a
   * hostile civ lives in it or next to it; lowest index on ties. −1 if none.
   */
  site(c, cnt, need, hostile) {
    const civs = this.civs;
    const { terrain, neighbours } = this;
    let best = -1;
    let bestScore = -1;
    let bestOk = false;
    for (let h = 0; h < this.n; h++) {
      const own = cnt[h * civs + c];
      if (own === 0 || terrain[h] === DEEP_WATER || this.occupied(h)) continue;
      const ok = own >= need;
      if (bestOk && !ok) continue;
      let mates = 0;
      let threat = false;
      let shared = false;
      for (let o = 0; o < civs; o++) {
        if (o === c || cnt[h * civs + o] === 0) continue;
        shared = true;
        if (hostile & (1 << o)) threat = true;
      }
      for (let d = 0; d < 6; d++) {
        const t = neighbours[h * 6 + d];
        if (t < 0 || terrain[t] === DEEP_WATER) continue;
        if (cnt[t * civs + c] > 0) mates++;
        if (!threat && hostile) for (let o = 0; o < civs; o++) if ((hostile & (1 << o)) && cnt[t * civs + o] > 0) { threat = true; break; }
      }
      let s = own * (1 + SITE.neighbourWeight * mates);
      if (shared) s *= SITE.sharedFactor;
      if (threat) s *= SITE.threatFactor;
      if ((ok && !bestOk) || s > bestScore) { best = h; bestScore = s; bestOk = ok; }
    }
    return best;
  }

  /**
   * Safety of civ c: 1 − the share of its hexes that hold, or touch a hex holding,
   * people of a civ in `danger` (threats it does not beat). 1 with no hexes.
   */
  safety(c, cnt, danger) {
    if (!danger) return 1;
    const civs = this.civs;
    const { terrain, neighbours } = this;
    let held = 0;
    let exposed = 0;
    const near = (h) => { for (let o = 0; o < civs; o++) if ((danger & (1 << o)) && cnt[h * civs + o] > 0) return true; return false; };
    for (let h = 0; h < this.n; h++) {
      if (cnt[h * civs + c] === 0) continue;
      held++;
      let bad = near(h);
      for (let d = 0; d < 6 && !bad; d++) {
        const t = neighbours[h * 6 + d];
        if (t >= 0 && terrain[t] !== DEEP_WATER && near(t)) bad = true;
      }
      if (bad) exposed++;
    }
    return held === 0 ? 1 : 1 - exposed / held;
  }

  /**
   * The year's buildings step. lv: the Levels (stock, levels, civ people and hexes,
   * minimums). cnt[hex × civs + civ]: people at the end of last year. hostile[c]
   * and beats[c]: bitmasks of the civs threatening c and of those it beats (from
   * last year's migration step). onEvent(kind, civ, era, year, other) reports
   * 'built', 'destroyed', 'wonder', 'captured' and 'abandoned'.
   */
  year(lv, cnt, year, hostile, beats, onEvent) {
    const civs = this.civs;
    const E = ERAS;
    const stock = lv.stock;
    const cost = this.scratch;
    // 1. Losses and captures: a civ with nobody left in a hex loses what stands or is being built there.
    for (let c = 0; c < civs; c++) {
      for (let e = 0; e < E; e++) {
        const k = c * E + e;
        if (this.state[k] !== NONE && cnt[this.hex[k] * civs + c] === 0) {
          if (this.state[k] === STANDING) { this.destroyed[k]++; onEvent?.('destroyed', c, e + 1, year, -1); }
          this.state[k] = NONE; this.hex[k] = -1; this.work[k] = 0;
        }
        if (this.aHex[k] >= 0 && cnt[this.aHex[k] * civs + c] === 0) {
          this.attempt[k] = NONE; this.aHex[k] = -1; this.aWork[k] = 0;
        }
      }
    }
    // A finished wonder belongs to whoever holds its hex's settlement (−1: nobody lives there).
    const holder = lv.settlements?.holder ?? null;
    for (let e = 0; e < E; e++) {
      const h = this.wHex[e];
      if (h < 0) continue;
      const o = this.wOwner[e];
      let to = -1;
      if (holder) to = holder[h];
      else if (o >= 0 && cnt[h * civs + o] > 0) to = o;
      else for (let c = 0; c < civs; c++) if (cnt[h * civs + c] > 0 && (to < 0 || cnt[h * civs + c] > cnt[h * civs + to])) to = c;
      if (to === o) continue;
      this.wOwner[e] = to;
      if (to >= 0) { this.wCaptures[e]++; onEvent?.('captured', to, e + 1, year, o); }
      else onEvent?.('abandoned', o, e + 1, year, -1);
    }

    // 2. Work: a year counts while the hex holds the people per hex of the civ's next level.
    for (let c = 0; c < civs; c++) {
      for (let e = 0; e < E; e++) {
        const k = c * E + e;
        const need = lv.perHexFor(e + 1);
        if (this.state[k] === BUILDING && cnt[this.hex[k] * civs + c] >= need) {
          if (++this.work[k] >= BUILDING_COST[e].years) { this.state[k] = STANDING; onEvent?.('built', c, e + 1, year, -1); }
        }
        if (this.aHex[k] >= 0 && cnt[this.aHex[k] * civs + c] >= need) this.aWork[k]++;
      }
    }
    // A wonder goes to the first to finish; several in the same year: most people, then the lower civ number.
    for (let e = 0; e < E; e++) {
      if (this.wYear[e] >= 0) continue;
      let win = -1;
      for (let c = 0; c < civs; c++) {
        const k = c * E + e;
        if (this.aHex[k] < 0 || this.aWork[k] < WONDERS[e].years) continue;
        if (win < 0 || lv.civPop[c] > lv.civPop[win]) win = c;
      }
      if (win < 0) continue;
      const kw = win * E + e;
      this.wOwner[e] = win; this.wBuilder[e] = win; this.wHex[e] = this.aHex[kw]; this.wYear[e] = year;
      this.attempt[kw] = NONE; this.aHex[kw] = -1; this.aWork[kw] = 0;
      onEvent?.('wonder', win, e + 1, year, -1);
      for (let c = 0; c < civs; c++) {
        const k = c * E + e;
        if (this.attempt[k] === NONE) continue;
        // Builders get part of their materials back; civs still gathering for it just stop.
        if (this.aHex[k] >= 0) {
          const w = WONDERS[e].materials;
          for (let m = 0; m < MATERIAL_COUNT; m++) stock[c * MATERIAL_COUNT + m] += w[m] * WONDER_RULES.refund;
        }
        this.attempt[k] = NONE; this.aHex[k] = -1; this.aWork[k] = 0;
      }
    }

    // 3. Decide and start, for each civ: its current era's building, and wonders of its era or earlier.
    for (let c = 0; c < civs; c++) {
      const L = lv.level[c];
      if (lv.civPop[c] === 0) continue;
      const k = c * E + L - 1;
      const need = lv.perHexFor(L);
      const danger = hostile[c] & ~beats[c];
      // The era building is optional: it waits until the capital also keeps what the next level costs.
      if (L <= E && this.state[k] === NONE && this.affords(stock, c, this.buildingCost(c, L, cost), lv.reserve)) {
        const h = this.site(c, cnt, need, hostile[c]);
        if (h >= 0) {
          for (let m = 0; m < MATERIAL_COUNT; m++) stock[c * MATERIAL_COUNT + m] -= cost[m];
          this.state[k] = BUILDING; this.hex[k] = h; this.work[k] = 0;
        }
      }
      // Wonders: any unfinished one of its era or an earlier one, one at a time, the earliest first.
      const busy = this.attemptOf(c);
      for (let e = 1; e <= Math.min(L, E); e++) {
        if (this.wYear[e - 1] >= 0) continue;
        const ka = c * E + e - 1;
        if (busy >= 0 && busy !== e) continue;
        if (this.attempt[ka] === NONE) {
          if (year - this.aCheck[ka] < WONDER_RULES.checkYears) continue;
          this.aCheck[ka] = year;
          if (this.score(c, L, cnt, danger, lv) >= WONDER_RULES.commitScore) { this.attempt[ka] = COMMITTED; this.aSince[ka] = year; }
          break;
        }
        if (this.aHex[ka] >= 0) break;
        // Committed, not started: give up, or start once the materials are in.
        if (year - this.aSince[ka] >= WONDER_RULES.giveUpYears
          || ((year - this.aSince[ka]) % WONDER_RULES.checkYears === 0 && this.safety(c, cnt, danger) < WONDER_RULES.giveUpSafety)) {
          this.attempt[ka] = NONE; this.aCheck[ka] = year;
          break;
        }
        if (!this.affords(stock, c, WONDERS[e - 1].materials)) break;
        const h = this.site(c, cnt, lv.perHexFor(e), hostile[c]);
        if (h < 0) break;
        const w = WONDERS[e - 1].materials;
        for (let m = 0; m < MATERIAL_COUNT; m++) stock[c * MATERIAL_COUNT + m] -= w[m];
        this.aHex[ka] = h; this.aWork[ka] = 0;
        break;
      }
    }
    this.totals();
  }

  /** Go-for-it score of civ c for era L's wonder: type lean × safety × land (capped) × 0.7 per wonder it owns. */
  score(c, L, cnt, danger, lv) {
    let lean = WONDER_RULES.lean[this.types[c]] ?? 1;
    for (let e = 0; e < ERAS; e++) if (this.wOwner[e] === c) lean *= WONDER_RULES.perOwned;
    const need = lv.minHexesFor(c, L + 1);
    const land = need > 0 ? Math.min(WONDER_RULES.landCap, lv.civHexes[c] / need) : WONDER_RULES.landCap;
    return lean * this.safety(c, cnt, danger) * land;
  }

  /** Civ c's stock holds list, beyond reserve[c × MATERIAL_COUNT + m] when given. */
  affords(stock, c, list, reserve = null) {
    for (let m = 0; m < MATERIAL_COUNT; m++) {
      const keep = reserve ? reserve[c * MATERIAL_COUNT + m] : 0;
      if (stock[c * MATERIAL_COUNT + m] - keep + COST_EPS < list[m]) return false;
    }
    return true;
  }

  /** Sum every civ's bonuses from what it has standing (its era buildings and the wonders it owns). */
  totals() {
    const civs = this.civs;
    for (const k of EFFECT_KEYS) this.eff[k].fill(0);
    const add = (c, effects) => { for (const k in effects) this.eff[k][c] += effects[k]; };
    for (let c = 0; c < civs; c++) {
      for (let e = 0; e < ERAS; e++) if (this.state[c * ERAS + e] === STANDING) add(c, buildingOf(this.types[c], e + 1).effects);
    }
    for (let e = 0; e < ERAS; e++) if (this.wOwner[e] >= 0) add(this.wOwner[e], WONDERS[e].effects);
    // Bonuses that take something away stop short of all of it.
    for (const k of CAPPED) for (let c = 0; c < civs; c++) if (this.eff[k][c] > MAX_SHARE) this.eff[k][c] = MAX_SHARE;
  }

  /** Era (1 to 4) of the wonder civ c is going for (committed or building), or −1. */
  attemptOf(c) {
    for (let e = 0; e < ERAS; e++) if (this.attempt[c * ERAS + e] !== NONE || this.aHex[c * ERAS + e] >= 0) return e + 1;
    return -1;
  }

  /** Era of the wonder civ c is committed to and has not started (it gathers for it first), or −1. */
  committedEra(c) {
    for (let e = 0; e < ERAS; e++) if (this.attempt[c * ERAS + e] === COMMITTED && this.aHex[c * ERAS + e] < 0) return e + 1;
    return -1;
  }

  /** Civ c is committed to era L's wonder and has not started it (its level waits). */
  waitingForWonder(c, L) {
    if (L > ERAS) return false;
    const k = c * ERAS + L - 1;
    return this.attempt[k] === COMMITTED && this.aHex[k] < 0;
  }

  /** Extra food-capacity share hex terrain t gets from civ c's bonuses. */
  foodShare(c, t) {
    return this.eff.food[c] + (isHarshFood(t) ? this.eff.foodHarsh[c] : 0);
  }

  /** Every building and wonder on the map (standing, being built, or abandoned), as plain data. */
  list(cols) {
    const out = [];
    const at = (h) => ({ hex: h, col: h % cols, row: Math.floor(h / cols) });
    for (let c = 0; c < this.civs; c++) {
      for (let e = 0; e < ERAS; e++) {
        const k = c * ERAS + e;
        const def = buildingOf(this.types[c], e + 1);
        if (this.state[k] !== NONE) {
          out.push({ kind: 'building', id: def.id, name: def.name, era: e + 1, civ: c, ...at(this.hex[k]),
            status: this.state[k] === STANDING ? 'standing' : 'building', work: this.work[k], years: BUILDING_COST[e].years,
            bonuses: effectText(def.effects) });
        }
        if (this.aHex[k] >= 0) {
          const w = WONDERS[e];
          out.push({ kind: 'wonder', id: w.id, name: w.name, era: e + 1, civ: c, ...at(this.aHex[k]),
            status: 'building', work: this.aWork[k], years: w.years, bonuses: effectText(w.effects) });
        }
      }
    }
    for (let e = 0; e < ERAS; e++) {
      if (this.wHex[e] < 0) continue;
      const w = WONDERS[e];
      out.push({ kind: 'wonder', id: w.id, name: w.name, era: e + 1, civ: this.wOwner[e], builder: this.wBuilder[e], year: this.wYear[e],
        ...at(this.wHex[e]), status: this.wOwner[e] >= 0 ? 'standing' : 'abandoned', work: w.years, years: w.years,
        captures: this.wCaptures[e], bonuses: effectText(w.effects) });
    }
    return out;
  }

  /** Plain data for civ c: its era buildings and its wonders. */
  summary(c) {
    const eras = [];
    for (let e = 0; e < ERAS; e++) {
      const k = c * ERAS + e;
      const def = buildingOf(this.types[c], e + 1);
      const w = WONDERS[e];
      eras.push({
        era: e + 1,
        building: { id: def.id, name: def.name, bonuses: effectText(def.effects),
          status: ['none', 'building', 'standing'][this.state[k]], hex: this.hex[k], work: this.work[k], years: BUILDING_COST[e].years,
          cost: Object.fromEntries(MATERIAL_IDS.map((id, m) => [id, reduce(BUILDING_COST[e].materials[m], this.costPct(c))])),
          destroyed: this.destroyed[k] },
        wonder: { id: w.id, name: w.name, bonuses: effectText(w.effects),
          status: this.wOwner[e] === c ? 'owned' : this.aHex[k] >= 0 ? 'building' : this.attempt[k] === COMMITTED ? 'gathering' : this.wYear[e] >= 0 ? 'taken' : 'free',
          owner: this.wOwner[e], work: this.aHex[k] >= 0 ? this.aWork[k] : 0, years: w.years },
      });
    }
    const bonuses = {};
    for (const k of EFFECT_KEYS) if (this.eff[k][c]) bonuses[k] = this.eff[k][c];
    return { eras, bonuses, bonusText: effectText(bonuses) };
  }
}
