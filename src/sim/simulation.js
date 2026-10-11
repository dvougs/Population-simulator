// Simulation: owns the map, the people and the clock. The only entry point the
// UI, the headless runner and the tests use. One tick is one year:
// birthdays, eating, deaths, births, migration, food regrowth, then the
// year's stats are recorded.

import { normalizeParams, mapParams } from './params.js';
import { generateMap, countTerrain, hashMap, fnv } from './mapgen.js';
import { indexToAxial } from './hex.js';
import { Rng } from './rng.js';
import { People, NO_PARENT } from './people.js';
import { pickStarts, found, eat, deaths, births, regrow } from './life.js';
import { buildReach, migrate } from './migration.js';
import { CivStats } from './civStats.js';
import { Records, FAMINE } from './records.js';
import {
  DEEP_WATER, TERRAIN_IDS, TERRAIN_NAMES, MOVE_COST, DEFENCE_BONUS,
} from './terrain.js';
import { MATERIAL_COUNT, MATERIAL_IDS } from './materials.js';
import { TRAITS, TRAIT_COUNT } from './traits.js';

export class Simulation {
  constructor(params) {
    this.params = normalizeParams(params);
    this.map = generateMap(this.params);
    this.terrainCounts = countTerrain(this.map);
    this.tickCount = 0;
    this.finished = false;
    this.endReason = null;
    /** How the run ended ('extinction', 'lastCiv', 'dominance', 'years', 'player') and the winning civ, if any. */
    this.endKind = null;
    this.winner = null;
    /** Set by Keep watching: no end condition applies any more, not even extinction. */
    this.sandbox = false;

    const map = this.map;
    const civs = this.params.civCount;
    const rng = new Rng(`${this.params.seed}:people`);
    // One stream per subsystem, so extra draws in one never reshuffle another.
    this.rng = {
      eat: rng.fork('eat'),
      death: rng.fork('death'),
      birth: rng.fork('birth'),
      migration: rng.fork('migration'),
    };
    const placement = rng.fork('placement');
    // Founders' trait spread and every child's mutation; forked last so the other streams are as before traits.
    this.rng.traits = rng.fork('traits');
    this.starts = pickStarts(map, civs, placement);
    this.civCount = civs;
    // Room for every hex filled to capacity, so the pool rarely has to grow.
    let capSum = 0;
    for (let h = 0; h < map.count; h++) capSum += map.foodCap[h];
    this.people = new People(Math.max(civs * this.params.startPop, Math.ceil(capSum * 1.25)));
    found(this.people, this.starts, this.params.startPop, placement, this.rng.traits);
    this.reach = buildReach(map);

    // Scratch arrays, allocated once (per-person ones again only if the pool grows).
    const n = map.count;
    this.hexPop = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.picked = new Int32Array(n);
    this.needSum = new Float64Array(n);
    this.eaten = new Float64Array(n);
    /** Sum, then average, of each trait per civ: civTraits[civ × TRAIT_COUNT + trait]. */
    this.civTraits = new Float64Array(civs * TRAIT_COUNT);
    this.spare = new Float64Array(n);
    this.civHex = new Uint8Array(n * civs);
    this.civHeld = new Uint8Array(n * civs);
    /** People of each civ in each hex at the end of the last year: hexCivPop[hex × civs + civ]. */
    this.hexCivPop = new Int32Array(n * civs);
    this.civPop = new Int32Array(civs);
    this.civHexes = new Int32Array(civs);
    this.civOldest = new Int32Array(civs);
    /** Years in a row each civ has held at least the dominance share of the land. */
    this.dominanceStreak = new Int32Array(civs);
    this.landHexes = n - this.terrainCounts[DEEP_WATER];
    this.allocPersonScratch();

    this.civStats = new CivStats(civs);
    const people = this.people;
    const st = this.civStats;
    this.records = new Records(civs, this.starts.length * this.params.startPop);
    this.records.founders(people);
    const rec = this.records;
    this.onDeath = (i, cause) => { st.death(people.civ[i], cause, people.age[i]); rec.death(i, people, cause, this.tickCount); };
    this.onBirth = (i) => { st.birth(people.civ[i]); rec.birth(i, people, this.tickCount); };
    this.recordYear();
  }

  allocPersonScratch() {
    this.parents = new Int32Array(this.people.capacity);
    this.dest = new Int32Array(this.people.capacity);
  }

  /** One year of the life cycle (see RULES.md "A year"). */
  year() {
    const people = this.people;
    const { alive, age } = people;
    for (let i = 0; i < people.high; i++) if (alive[i] && age[i] < 65535) age[i]++;
    eat(people, this.map, this.rng.eat, this.hexPop, this.seen, this.picked, this.needSum, this.eaten);
    deaths(people, this.rng.death, this.onDeath);
    births(people, this.map, this.rng.birth, this.hexPop, this.parents, this.onBirth, this.rng.traits, this.params.mutation);
    if (this.dest.length < people.capacity) this.allocPersonScratch();
    migrate(people, this.map, this.reach, this.rng.migration, this.hexPop, this.spare, this.dest, this.civHeld);
    regrow(this.map);
  }

  /** Count people, hexes held, the oldest person and trait averages per civ, and append the year's stats row. */
  recordYear() {
    const p = this.people;
    const { alive, civ, hex, age } = p;
    const ct = this.civTraits;
    ct.fill(0);
    // Locals, not traits[t][i]: this loop runs over everyone every year.
    const [t0, t1, t2, t3, t4, t5, t6, t7] = p.traits;
    const n = this.map.count;
    this.civPop.fill(0);
    this.civHexes.fill(0);
    this.civOldest.fill(0);
    this.civHex.fill(0);
    this.hexCivPop.fill(0);
    const civs = this.civCount;
    for (let i = 0; i < p.high; i++) {
      if (!alive[i]) continue;
      const c = civ[i];
      this.civPop[c]++;
      this.hexCivPop[hex[i] * civs + c]++;
      if (age[i] > this.civOldest[c]) this.civOldest[c] = age[i];
      const k = c * n + hex[i];
      if (!this.civHex[k]) { this.civHex[k] = 1; this.civHexes[c]++; }
      const b = c * TRAIT_COUNT;
      ct[b] += t0[i]; ct[b + 1] += t1[i]; ct[b + 2] += t2[i]; ct[b + 3] += t3[i];
      ct[b + 4] += t4[i]; ct[b + 5] += t5[i]; ct[b + 6] += t6[i]; ct[b + 7] += t7[i];
    }
    for (let c = 0; c < civs; c++) {
      for (let t = 0; t < TRAIT_COUNT; t++) ct[c * TRAIT_COUNT + t] = this.civPop[c] > 0 ? ct[c * TRAIT_COUNT + t] / this.civPop[c] : NaN;
    }
    this.civStats.endYear(this.tickCount, this.civPop, this.civHexes, this.civOldest, ct);
    this.records.endYear(this.tickCount, this.civPop);
  }

  /** Advance n ticks (stops early when the end condition is met). Returns ticks run. */
  tick(n = 1) {
    let ran = 0;
    while (ran < n && !this.finished) {
      this.tickCount++;
      ran++;
      this.year();
      this.recordYear();
      this.checkEnd();
    }
    return ran;
  }

  /**
   * End conditions, checked after each year in this order (the first met
   * ends the run): total extinction, last civ standing, dominance, year limit.
   */
  checkEnd() {
    const p = this.params;
    const ends = p.endConditions;
    const civs = this.civCount;
    let alive = 0;
    let last = -1;
    // Integer test of hexes ÷ land ≥ share, so no rounding decides who dominates.
    const pct = Math.round(p.dominanceShare * 100);
    let dominant = -1;
    for (let c = 0; c < civs; c++) {
      if (this.civPop[c] > 0) { alive++; last = c; }
      if (this.landHexes > 0 && this.civHexes[c] * 100 >= pct * this.landHexes) this.dominanceStreak[c]++;
      else this.dominanceStreak[c] = 0;
      // Several civs can only qualify together at shares of 50% or less: most hexes, then the lower civ.
      if (this.dominanceStreak[c] >= p.dominanceYears && (dominant < 0 || this.civHexes[c] > this.civHexes[dominant])) dominant = c;
    }
    if (this.sandbox) return;
    if (alive === 0) this.end('extinction', null, 'Every civ died out');
    else if (ends.includes('lastCiv') && civs >= 2 && alive === 1) this.end('lastCiv', last, `Civ ${last + 1} is the last civ standing`);
    else if (ends.includes('dominance') && dominant >= 0) {
      this.end('dominance', dominant, `Civ ${dominant + 1} held ${pct}% of the land for ${p.dominanceYears} years`);
    } else if (ends.includes('years') && this.tickCount >= p.endTicks) this.end('years', null, `Reached year ${p.endTicks}`);
  }

  end(kind, winner, reason) {
    this.finished = true;
    this.endKind = kind;
    this.winner = winner;
    this.endReason = reason;
  }

  /** "End now": stop the run here, with no winner. */
  endNow() {
    if (!this.finished) this.end('player', null, 'Ended by the player');
  }

  /** "Keep watching": carry on after the end as a sandbox that never ends. */
  keepWatching() {
    this.sandbox = true;
    this.finished = false;
    this.endKind = null;
    this.winner = null;
    this.endReason = null;
  }

  stats() {
    return {
      tick: this.tickCount,
      totalPop: this.people.count,
      civs: this.civStats.summary(),
      terrainCounts: this.terrainCounts.slice(),
      finished: this.finished,
      endReason: this.endReason,
      endKind: this.endKind,
      winner: this.winner,
      sandbox: this.sandbox,
    };
  }

  /** Recorded per-civ history: plain data and typed arrays (see CivStats.historyData). */
  history() {
    return this.civStats.historyData();
  }

  /**
   * Everything the end screen shows, from stats and records kept during the
   * run (plain data plus the history's typed arrays), so it costs one pass
   * over the living at most.
   */
  report() {
    const civs = this.civStats.summary();
    const deaths = { oldAge: 0, starvation: 0 };
    for (const c of civs) { deaths.oldAge += c.deaths.oldAge; deaths.starvation += c.deaths.starvation; }
    return {
      ...this.stats(),
      winnerName: this.winner === null ? null : `Civ ${this.winner + 1}`,
      endConditions: this.params.endConditions.slice(),
      landHexes: this.landHexes,
      deaths,
      famine: { ...FAMINE },
      history: this.history(),
      records: this.records.data(this.people, this.tickCount),
    };
  }

  /** Plain description of hex (col, row) with its people per civ, or null if it is off the map. */
  inspect(col, row) {
    const d = describeHex(this.map, col, row);
    if (!d) return null;
    const byCiv = new Array(this.civCount).fill(0);
    const p = this.people;
    for (let i = 0; i < p.high; i++) if (p.alive[i] && p.hex[i] === d.index) byCiv[p.civ[i]]++;
    d.people = byCiv.reduce((a, b) => a + b, 0);
    d.peopleByCiv = byCiv;
    return d;
  }

  /**
   * Where everyone is, for drawing: people per civ per hex and, per pool slot,
   * alive, id, hex and civ. Copies of the used part only (plain typed arrays).
   */
  population() {
    const p = this.people;
    const n = p.high;
    return {
      tick: this.tickCount,
      civs: this.civCount,
      hexCivPop: this.hexCivPop.slice(),
      high: n,
      alive: p.alive.slice(0, n),
      id: p.id.slice(0, n),
      hex: p.hex.slice(0, n),
      civ: p.civ.slice(0, n),
    };
  }

  /**
   * One person by pool slot and id (the id guards against a reused slot), or
   * null if that person is no longer alive. Children are counted on demand:
   * the living people whose parent is this person.
   */
  person(slot, id) {
    const p = this.people;
    if (!Number.isInteger(slot) || slot < 0 || slot >= p.high || !p.alive[slot] || p.id[slot] !== id) return null;
    const parent = p.parent[slot];
    let children = 0;
    let parentAlive = false;
    for (let i = 0; i < p.high; i++) {
      if (!p.alive[i]) continue;
      if (p.parent[i] === id) children++;
      if (parent !== NO_PARENT && p.id[i] === parent) parentAlive = true;
    }
    const h = p.hex[slot];
    const cols = this.map.cols;
    return {
      slot,
      id,
      age: p.age[slot],
      health: p.health[slot],
      hunger: p.hunger[slot],
      civ: p.civ[slot],
      civName: `Civ ${p.civ[slot] + 1}`,
      parent: parent === NO_PARENT ? null : parent,
      parentAlive: parent === NO_PARENT ? null : parentAlive,
      children,
      /** The 8 traits (0 … 1), keyed by trait id (see traits.js TRAITS). */
      traits: Object.fromEntries(TRAITS.map((k, t) => [k, p.traits[t][slot]])),
      hex: h,
      col: h % cols,
      row: Math.floor(h / cols),
    };
  }

  /** The living people in hex (col, row), lowest id first, at most `limit` of them, and how many there are. */
  hexPeople(col, row, limit = 100) {
    const d = describeHex(this.map, col, row);
    if (!d) return null;
    const p = this.people;
    const slots = [];
    for (let i = 0; i < p.high; i++) if (p.alive[i] && p.hex[i] === d.index) slots.push(i);
    slots.sort((a, b) => p.id[a] - p.id[b]);
    return {
      index: d.index,
      total: slots.length,
      people: slots.slice(0, Math.max(0, limit)).map((i) => ({
        slot: i, id: p.id[i], age: p.age[i], health: p.health[i], hunger: p.hunger[i], civ: p.civ[i],
      })),
    };
  }

  /** Map hash: depends only on the map parameters. */
  mapHash() {
    return hashMap(this.map);
  }

  /** Whole-state hash: the map, food stocks, every person and the year. */
  hash() {
    const m = this.map;
    return fnv([m.terrain, m.lake, m.river, m.riverTo, m.food, ...this.people.views(), new Uint32Array([this.tickCount])]);
  }

  get mapParams() { return mapParams(this.params); }
}

export function describeHex(map, col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) return null;
  const i = row * map.cols + col;
  const t = map.terrain[i];
  const water = t === DEEP_WATER;
  const { q, r } = indexToAxial(i, map.cols);
  return {
    index: i,
    col,
    row,
    q,
    r,
    terrain: TERRAIN_IDS[t],
    name: water && map.lake[i] ? 'Lake' : TERRAIN_NAMES[t],
    water,
    lake: map.lake[i] === 1,
    river: map.river[i] === 1,
    food: map.food[i],
    foodCap: map.foodCap[i],
    /** Material ids of the hex's deposits, in material order (wood first, spices last). */
    deposits: depositList(map.deposits[i]),
    moveCost: water ? null : MOVE_COST[t],
    defence: DEFENCE_BONUS[t],
  };
}

function depositList(bits) {
  const out = [];
  for (let m = 0; m < MATERIAL_COUNT; m++) if (bits & (1 << m)) out.push(MATERIAL_IDS[m]);
  return out;
}
