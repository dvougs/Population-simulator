// Simulation: owns the map, the people and the clock. The only entry point the
// UI, the headless runner and the tests use. One tick is one day (calendar.js):
// on the first day of the year come gathering and levels, birthdays, eating,
// deaths and births; each month a twelfth of the people may move; food grows
// back at the start of each season; on the last day come contact (fights and
// switching civ) and the year's stats. tickCount counts whole years begun, the
// unit every yearly rule is written in; dayCount counts days.

import { normalizeParams, mapParams } from './params.js';
import { generateMap, countTerrain, hashMap, fnv } from './mapgen.js';
import { indexToAxial } from './hex.js';
import { Rng } from './rng.js';
import { People, NO_PARENT } from './people.js';
import { pickStarts, found, eat, deaths, births, regrow } from './life.js';
import { buildStepReach, landPieces, migrate, migrationRules, setReach } from './migration.js';
import { Contact, CONTACT } from './contact.js';
import { TRUCE } from './diplomacy.js';
import { Levels, LEVEL_EFFECTS, GATHER, boatRange } from './levels.js';
import { CIV_TYPE_NAMES } from './civTypes.js';
import { CivStats } from './civStats.js';
import { Records, FAMINE } from './records.js';
import {
  DEEP_WATER, TERRAIN_IDS, TERRAIN_NAMES, MOVE_COST, DEFENCE_BONUS,
} from './terrain.js';
import { MATERIAL_COUNT, MATERIAL_IDS } from './materials.js';
import { settlementName } from './settlements.js';
import { TRAITS, TRAIT_COUNT, COOPERATION } from './traits.js';
import {
  DAYS_PER_YEAR, MONTH_DAYS, MONTHS, SEASON_DAYS, MOVE_DAY, SEASON_REGROWTH, WINTER, SEASON_NAMES,
  winterClosedMask, seasonOf,
} from './calendar.js';
import { TERRAIN_COUNT } from './terrain.js';

export class Simulation {
  constructor(params) {
    this.params = normalizeParams(params);
    this.map = generateMap(this.params);
    this.terrainCounts = countTerrain(this.map);
    this.tickCount = 0;
    this.dayCount = 0;
    this.winterClosed = winterClosedMask(TERRAIN_COUNT);
    this.round = { month: 0, months: MONTHS, closed: null };
    this.finished = false;
    this.endReason = null;
    /** How the run ended ('extinction', 'lastCiv', 'kingdom', 'dominance', 'years', 'player') and the winning civ, if any. */
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
    // The same stream startHexes uses, so the setup screen shows where civs will start.
    const placement = rng.fork('placement');
    // Founders' trait spread and every child's mutation; forked last so the other streams are as before traits.
    this.rng.traits = rng.fork('traits');
    // Fights and civ switching (also forked after the older streams).
    this.rng.war = rng.fork('war');
    this.rng.switch = rng.fork('switch');
    this.starts = pickStarts(map, civs, placement, this.params.starts);
    this.civCount = civs;
    this.civTypes = this.params.civTypes.slice();
    // Room for every hex filled to capacity, so the pool rarely has to grow.
    let capSum = 0;
    for (let h = 0; h < map.count; h++) capSum += map.foodCap[h];
    this.people = new People(Math.max(civs * this.params.startPop, Math.ceil(capSum * 1.25)));
    found(this.people, this.starts, this.params.startPop, placement, this.rng.traits, this.civTypes);
    this.reach = buildStepReach(map);
    this.migrationRules = migrationRules(this.civTypes, map, this.reach);
    this.contact = new Contact(map, this.civTypes);
    this.levels = new Levels(map, this.civTypes, this.params.seed);
    // Settlements set each hex's housing and imported food (read by births and migration) and its defence.
    const settle = this.levels.settlements;
    map.housing = settle.housing;
    map.imported = settle.imported;
    this.contact.hexDefence = settle.defence;
    this.contact.hexHolder = settle.holder;
    // Kingdoms close their enclosed hexes to other civs and fight harder (see levels.js).
    this.migrationRules.inside = this.levels.inside;
    this.contact.inside = this.levels.inside;
    this.contact.level = this.levels.level;
    this.contact.eff = this.levels.buildings.eff;
    // War, truce and peace (diplomacy.js): truces stop fights, peace makes them rarer.
    this.diplomacy = this.levels.diplomacy;
    this.contact.diplomacy = this.diplomacy;
    this.migrationRules.holder = settle.holder;
    this.migrationRules.rel = this.diplomacy.rel;
    // Land each civ can reach from its start, by boat range (see setReachableLand).
    this.landPieces = new Map();
    for (let c = 0; c < civs; c++) this.setReachableLand(c);
    // Walkers' movement points before any building bonus, and the bonus their reach was built with.
    this.baseMove = Int32Array.from(this.migrationRules.movePoints);
    this.moveApplied = new Int32Array(civs);

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
    this.records = new Records(civs, this.starts.length * this.params.startPop, map.cols);
    this.records.founders(people);
    const rec = this.records;
    this.onDeath = (i, cause) => { st.death(people.civ[i], cause, people.age[i]); rec.death(i, people, cause, this.tickCount); };
    this.onBirth = (i) => { st.birth(people.civ[i]); rec.birth(i, people, this.tickCount); };
    this.onFight = (h, attacker, defender, holder, winner, deaths, byWinner, byLoser) => {
      st.fight(attacker, defender, winner);
      rec.fight(this.tickCount, attacker, defender, winner, byWinner, byLoser);
      this.diplomacy.fight(this.tickCount, winner, winner === attacker ? defender : attacker, byWinner, byLoser, this.onDiplomacy);
    };
    this.onDiplomacy = (kind, a, b, year, value) => rec.diplomacy(kind, a, b, year, value);
    this.levels.onDiplomacy = this.onDiplomacy;
    const ct = this.contact;
    this.forgive = (a, b) => { ct.lostTo[a * civs + b] = -1000000000; ct.lostTo[b * civs + a] = -1000000000; };
    this.onSwitch = (from, to) => st.switched(from, to);
    this.onBuild = (kind, c, era, year, other) => rec.building(kind, c, era, year, other);
    this.levels.onSettle = (kind, c, h, year, other) => rec.settlement(kind, c, h, year, other);
    this.onLevel = (c, from, to, year) => {
      rec.level(c, to, year);
      // Rafts come and go with level 2, boats with level 4.
      const range = boatRange(to);
      if (range !== this.migrationRules.boats[c]) {
        setReach(this.migrationRules, c, map, range, LEVEL_EFFECTS.boatCost);
        this.setReachableLand(c);
      }
    };
    this.recordYear();
  }

  allocPersonScratch() {
    this.parents = new Int32Array(this.people.capacity);
    this.dest = new Int32Array(this.people.capacity);
  }

  /** One year of the life cycle (see RULES.md "A year"). */
  /** The first day of the year: gathering and levels, birthdays, eating, deaths and births. */
  yearStart() {
    const people = this.people;
    const { alive, age } = people;
    const lv = this.levels;
    // From the counts at the end of last year, so before anyone ages, eats or moves.
    const r = this.migrationRules;
    lv.year(people, this.map, this.tickCount, this.hexCivPop, this.contact.fightWinner, this.onLevel, this.onSwitch,
      r.hostile, r.beats, this.onBuild);
    this.applyMove();
    for (let i = 0; i < people.high; i++) if (alive[i] && age[i] < 65535) age[i]++;
    eat(people, this.map, this.rng.eat, this.hexPop, this.seen, this.picked, this.needSum, this.eaten, lv.shelter, lv.hungerMul);
    deaths(people, this.rng.death, this.onDeath, lv.oldAgeDelay);
    births(people, this.map, this.rng.birth, this.hexPop, this.parents, this.onBirth, this.rng.traits, this.params.mutation, lv.birthBonus);
    if (this.dest.length < people.capacity) this.allocPersonScratch();
    this.expansionPriorities();
  }

  /** One month's movers (people whose id mod 12 is the month) set out; in winter tundra and mountains are closed. */
  moveRound(month, winter) {
    const round = this.round;
    round.month = month;
    round.closed = winter ? this.winterClosed : null;
    migrate(this.people, this.map, this.reach, this.rng.migration, this.hexPop, this.spare, this.dest, this.civHeld,
      this.migrationRules, round);
  }

  /** The last day of the year: fights and switching civ, then the year's stats and the end conditions. */
  yearEnd() {
    // hexCivPop still holds last year's counts here: it decides each fight's defender.
    this.contact.year(this.people, this.map, this.hexCivPop, this.tickCount, this.rng.war, this.rng.switch,
      this.onDeath, this.onFight, this.onSwitch);
    this.recordYear();
    // Wars end in truces and truces turn to peace, from this year's fights and people.
    this.diplomacy.endYear(this.tickCount, this.civPop, this.levels.settlements, this.forgive, this.onDiplomacy);
    this.checkEnd();
  }

  /** Run day `doy` of the year (0 … 359). */
  runDay(doy) {
    if (doy === 0) { this.tickCount++; this.yearStart(); }
    const season = seasonOf(doy);
    if (doy % MONTH_DAYS === MOVE_DAY) this.moveRound(Math.floor(doy / MONTH_DAYS), season === WINTER);
    if (doy % SEASON_DAYS === 0) regrow(this.map, SEASON_REGROWTH[season], season === WINTER ? this.winterClosed : null);
    if (doy === DAYS_PER_YEAR - 1) this.yearEnd();
  }

  /** Advance n days (stops early when the end condition is met). Returns days run. */
  days(n = 1) {
    let ran = 0;
    while (ran < n && !this.finished) {
      const doy = this.dayCount % DAYS_PER_YEAR;
      this.dayCount++;
      ran++;
      this.runDay(doy);
    }
    return ran;
  }

  /** Day of the year (0 … 359) of the last day run, or −1 before the first. */
  get dayOfYear() { return this.dayCount === 0 ? -1 : (this.dayCount - 1) % DAYS_PER_YEAR; }

  /**
   * Caps civ c's land needs for levels at the land it can reach (see Levels.setReachable):
   * the land hexes joined to its starting hex by walking and by voyages of its boat range.
   */
  setReachableLand(c) {
    const start = this.starts[c];
    if (start === undefined) return;
    const range = this.migrationRules.boats[c];
    let pieces = this.landPieces.get(range);
    if (!pieces) {
      pieces = landPieces(this.map, range ? buildStepReach(this.map, range) : this.reach);
      this.landPieces.set(range, pieces);
    }
    this.levels.setReachable(c, pieces.size[pieces.id[start]]);
  }

  /** Walkers (Nomadic) get their buildings' extra movement points; reach tables follow. */
  applyMove() {
    const move = this.levels.buildings.eff.move;
    const r = this.migrationRules;
    for (let c = 0; c < this.civCount; c++) {
      const extra = this.baseMove[c] > 0 ? Math.round(move[c]) : 0;
      if (extra === this.moveApplied[c]) continue;
      this.moveApplied[c] = extra;
      r.movePoints[c] = this.baseMove[c] + extra;
      setReach(r, c, this.map, r.boats[c], LEVEL_EFFECTS.boatCost);
    }
  }

  /**
   * What steers migration this year (RULES.md "Where civs expand"): the materials each civ's
   * next level still needs, which civs threaten it, and which of those it is stronger than.
   * Threats: an Aggressive civ, a civ it lost a fight to in the last revengeYears, or a
   * Kingdom when it is not one. It beats a threat when it can start fights and is Aggressive,
   * or is a Kingdom facing a civ that is not, or has more people (unless the threat is a
   * Kingdom and it is not). People counts are those of the start of the year.
   */
  expansionPriorities() {
    const lv = this.levels;
    const ct = this.contact;
    const r = this.migrationRules;
    const civs = this.civCount;
    if (!r.want) r.want = new Uint16Array(civs);
    lv.wanted(r.want);
    const K = LEVEL_EFFECTS.kingdomLevel;
    for (let c = 0; c < civs; c++) {
      let hostile = 0;
      let beats = 0;
      const kc = lv.level[c] === K;
      for (let o = 0; o < civs; o++) {
        if (o === c || lv.civPop[o] === 0) continue;
        const ko = lv.level[o] === K;
        // A civ in a truce with it is no threat while the truce lasts.
        if (this.diplomacy.relation(c, o) === TRUCE) continue;
        const threat = ct.always[o] === 1 || this.tickCount - ct.lostTo[c * civs + o] <= CONTACT.revengeYears || (ko && !kc);
        if (!threat) continue;
        hostile |= 1 << o;
        const stronger = ct.always[c] === 1 || (kc && !ko) || (!(ko && !kc) && lv.civPop[c] > lv.civPop[o]);
        if (ct.never[c] !== 1 && stronger) beats |= 1 << o;
      }
      r.hostile[c] = hostile;
      r.beats[c] = beats;
    }
  }

  /** Winner of this year's fight in each hex (civ index), or −1 where there was none. */
  get fightWinner() {
    return this.contact.fightWinner;
  }

  /** Count people, hexes held, the oldest person and trait averages per civ, and append the year's stats row. */
  recordYear() {
    const p = this.people;
    const { alive, civ, hex, age, hunger } = p;
    const ct = this.civTraits;
    ct.fill(0);
    // Locals, not traits[t][i]: this loop runs over everyone every year.
    const [t0, t1, t2, t3, t4, t5, t6, t7] = p.traits;
    const { civPop, civHexes, civOldest, hexCivPop } = this;
    civPop.fill(0);
    civHexes.fill(0);
    civOldest.fill(0);
    hexCivPop.fill(0);
    const civs = this.civCount;
    // Gathering next year reads each civ's hungry people.
    const hungry = this.levels.hungry;
    const hungryHex = this.levels.hungryHex;
    this.levels.effortGiven = true;
    hungry.fill(0);
    hungryHex.fill(0);
    // And its gatherers' effort, counted here rather than in another pass over everyone.
    const effort = this.levels.effort;
    effort.fill(0);
    const coop = p.traits[COOPERATION];
    const { adultAge, personBase } = GATHER;
    for (let i = 0; i < p.high; i++) {
      if (!alive[i]) continue;
      const c = civ[i];
      civPop[c]++;
      const k = hex[i] * civs + c;
      // A civ's first person in a hex adds the hex to those it holds.
      if (hexCivPop[k]++ === 0) civHexes[c]++;
      if (hunger[i] > 0) { hungry[c]++; hungryHex[hex[i]]++; }
      if (age[i] >= adultAge) effort[k] += personBase + coop[i];
      if (age[i] > civOldest[c]) civOldest[c] = age[i];
      const b = c * TRAIT_COUNT;
      ct[b] += t0[i]; ct[b + 1] += t1[i]; ct[b + 2] += t2[i]; ct[b + 3] += t3[i];
      ct[b + 4] += t4[i]; ct[b + 5] += t5[i]; ct[b + 6] += t6[i]; ct[b + 7] += t7[i];
    }
    for (let c = 0; c < civs; c++) {
      for (let t = 0; t < TRAIT_COUNT; t++) ct[c * TRAIT_COUNT + t] = this.civPop[c] > 0 ? ct[c * TRAIT_COUNT + t] / this.civPop[c] : NaN;
    }
    this.levels.noteStarved(this.civStats.yearDeaths);
    this.civStats.endYear(this.tickCount, this.civPop, this.civHexes, this.civOldest, ct, this.levels.level);
    this.records.endYear(this.tickCount, this.civPop, this.civHexes, this.hexCivPop);
  }

  /**
   * Advance n whole years: days up to and including the last day of the n-th
   * year to end (stops early when the end condition is met). Returns years ended.
   * The tests and the headless runner count in years; the game runs days.
   */
  tick(n = 1) {
    let years = 0;
    while (years < n && !this.finished) {
      const last = this.dayCount % DAYS_PER_YEAR === DAYS_PER_YEAR - 1;
      this.days(1);
      if (last) years++;
    }
    return years;
  }

  /**
   * End conditions, checked after each year in this order (the first met
   * ends the run): total extinction, last civ standing, first to Kingdom, dominance, year limit.
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
    else if (ends.includes('kingdom') && this.levels.kingdomCiv >= 0) {
      const k = this.levels.kingdomCiv;
      this.end('kingdom', k, `Civ ${k + 1} became the first Kingdom`);
    }
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
    const doy = this.dayOfYear;
    const diplomacy = this.diplomacy.summary(this.tickCount);
    return {
      tick: this.tickCount,
      /** Day of the year (0 … 359) and its season, of the last day run (−1 and null before the first). */
      day: doy,
      season: doy >= 0 ? SEASON_NAMES[seasonOf(doy)] : null,
      days: this.dayCount,
      totalPop: this.people.count,
      civs: this.civStats.summary().map((c, k) => ({
        ...c, type: this.civTypes[k], typeName: CIV_TYPE_NAMES[this.civTypes[k]], ...this.levels.summary(k),
        trade: diplomacy.trade[k],
      })),
      /** Every pair of civs that has fought: war, truce or peace, and whether they trade. */
      relations: diplomacy.pairs,
      truces: diplomacy.truces,
      /** First civ to reach Kingdom and the year, or null. */
      firstKingdom: this.levels.kingdomCiv >= 0 ? { civ: this.levels.kingdomCiv, year: this.levels.kingdomYear } : null,
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
    const deaths = { oldAge: 0, starvation: 0, war: 0 };
    for (const c of civs) { deaths.oldAge += c.deaths.oldAge; deaths.starvation += c.deaths.starvation; deaths.war += c.deaths.war; }
    return {
      ...this.stats(),
      winnerName: this.winner === null ? null : `Civ ${this.winner + 1}`,
      endConditions: this.params.endConditions.slice(),
      landHexes: this.landHexes,
      deaths,
      famine: { ...FAMINE },
      history: this.history(),
      records: this.namedRecords(),
      cities: this.levels.settlements.greatest(this.map.cols),
    };
  }

  /** The end-screen records, with settlement names on the city events. */
  namedRecords() {
    const r = this.records.data(this.people, this.tickCount);
    const name = (e) => { if (e.type === 'city' || e.type === 'cityTaken') e.name = settlementName(this.params.seed, e.hex); };
    r.events.forEach(name);
    r.chronicle.forEach(name);
    return r;
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
    // Who gathered here this year (step 1): materials worked, gatherers, and the amount each civ got
    // (a fight's winner can get a yield it did not gather, with no materials or gatherers of its own).
    const lv = this.levels;
    d.gathering = [];
    for (let c = 0; c < this.civCount; c++) {
      const k = d.index * this.civCount + c;
      if (lv.gatherers[k] > 0 || lv.gathered[k] > 0) {
        d.gathering.push({ civ: c, materials: depositList(lv.gatherMask[k]), gatherers: lv.gatherers[k], amount: lv.gathered[k] });
      }
    }
    // Buildings and wonders standing, being built or abandoned here.
    d.buildings = this.buildings().filter((b) => b.hex === d.index);
    // The settlement here (tier, store, its own buildings, routes), or null.
    d.settlement = this.levels.settlements.describe(d.index, this.map.cols);
    d.housing = d.settlement ? d.settlement.housing : null;
    return d;
  }

  /** Settlements for drawing: per-hex tier, holder, buildings and plan, capitals and this year's routes (typed arrays). */
  settlements() {
    return { tick: this.tickCount, ...this.levels.settlements.snapshot() };
  }

  /** Every building and wonder on the map, standing, being built or abandoned (plain data; see buildings.js list). */
  buildings() {
    return this.levels.buildings.list(this.map.cols);
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
    const st = this.levels.settlements;
    return fnv([m.terrain, m.lake, m.river, m.riverTo, m.food, ...this.people.views(), st.store, st.built, st.tier,
      new Uint32Array([this.tickCount, this.dayCount])]);
  }

  get mapParams() { return mapParams(this.params); }
}

/**
 * Where each civ of `params` will start on `map` (generated from the same
 * params): chosen hexes where valid, the rest placed as a new game would.
 */
export function startHexes(params, map) {
  const p = normalizeParams(params);
  const rng = new Rng(`${p.seed}:people`);
  for (const label of ['eat', 'death', 'birth', 'migration']) rng.fork(label);
  return pickStarts(map, p.civCount, rng.fork('placement'), p.starts);
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
