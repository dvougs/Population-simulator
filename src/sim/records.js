// Records and key events for the end screen, kept up as the run goes (every
// number is in RULES.md "End screen"). Nothing here allocates per tick: the
// counters are typed arrays sized at the start, and the event log is a fixed
// set of typed columns.
//
// Most descendants only needs a counter per founder: a parent has every
// descendant of their child plus the child, so the person with the most
// descendants is always one of the founders.

import { DEATH_STARVATION } from './life.js';

/** A famine year: a civ's starvation deaths are at least minShare of its people at the start of the year, and at least minDeaths. */
export const FAMINE = Object.freeze({ minShare: 0.02, minDeaths: 5 });
/** Most events kept; room for one extinction per civ is always left. */
export const EVENT_CAP = 2048;
export const EVENT_TYPES = ['famine', 'extinction', 'fight'];
const EV_FAMINE = 0;
const EV_EXTINCTION = 1;
const EV_FIGHT = 2;
/** Order of events in the same year: famines, then fights, then extinctions. */
const EVENT_ORDER = { famine: 0, fight: 1, extinction: 2 };

export class Records {
  /** cols: the map's width, to give fights a column and row. */
  constructor(civs, founders, cols = 1) {
    this.civs = civs;
    this.cols = cols;
    this.founderId = new Uint32Array(founders);
    this.founderCiv = new Uint8Array(founders);
    this.founderDesc = new Int32Array(founders);
    // Longest family line: the first person to reach the highest generation.
    this.lineGen = 1;
    this.linePerson = 0;
    this.lineFounder = 0;
    this.lineYear = 0;
    // Oldest person who has died (the living are scanned when the report is made).
    this.oldestAge = -1;
    this.oldestId = 0;
    this.oldestCiv = 0;
    this.oldestYear = 0;
    // Famines: this year's starvation deaths, last year's people, the open famine per civ.
    this.starve = new Int32Array(civs);
    this.lastPop = new Int32Array(civs);
    this.famineStart = new Int32Array(civs).fill(-1);
    this.famineEnd = new Int32Array(civs);
    this.famineDeaths = new Int32Array(civs);
    this.worstCiv = -1;
    this.worstStart = 0;
    this.worstEnd = 0;
    this.worstDeaths = 0;
    // Event log columns.
    this.evCount = 0;
    this.evDropped = 0;
    this.evType = new Uint8Array(EVENT_CAP);
    this.evCiv = new Uint8Array(EVENT_CAP);
    this.evYear = new Int32Array(EVENT_CAP);
    this.evEnd = new Int32Array(EVENT_CAP);
    this.evDeaths = new Int32Array(EVENT_CAP);
    // Fights only: the hex, the civ attacked, the civ that held the hex and the winner (evCiv is the attacker).
    this.evHex = new Int32Array(EVENT_CAP);
    this.evDefender = new Uint8Array(EVENT_CAP);
    this.evHolder = new Uint8Array(EVENT_CAP);
    this.evWinner = new Uint8Array(EVENT_CAP);
  }

  /** A fight this year in hex h; deaths on both sides together. Dropped (and counted) once the log is full. */
  fight(year, h, attacker, defender, holder, winner, deaths) {
    const k = this.evCount;
    if (!this.push(EV_FIGHT, attacker, year, year, deaths, false)) return;
    this.evHex[k] = h;
    this.evDefender[k] = defender;
    this.evHolder[k] = holder;
    this.evWinner[k] = winner;
  }

  /** Register the founders (every person alive before the first year). */
  founders(people) {
    for (let i = 0; i < people.high; i++) {
      if (!people.alive[i]) continue;
      const f = people.founder[i];
      this.founderId[f] = people.id[i];
      this.founderCiv[f] = people.civ[i];
      if (this.linePerson === 0) { this.linePerson = people.id[i]; this.lineFounder = f; }
    }
  }

  birth(slot, people, year) {
    const f = people.founder[slot];
    this.founderDesc[f]++;
    const g = people.gen[slot];
    if (g > this.lineGen) {
      this.lineGen = g;
      this.linePerson = people.id[slot];
      this.lineFounder = f;
      this.lineYear = year;
    }
  }

  death(slot, people, cause, year) {
    if (cause === DEATH_STARVATION) this.starve[people.civ[slot]]++;
    if (people.age[slot] > this.oldestAge) {
      this.oldestAge = people.age[slot];
      this.oldestId = people.id[slot];
      this.oldestCiv = people.civ[slot];
      this.oldestYear = year;
    }
  }

  /** Close the year: famine spells and extinctions. pop is each civ's people at the end of the year. */
  endYear(year, pop) {
    const pct = Math.round(FAMINE.minShare * 100);
    for (let c = 0; c < this.civs; c++) {
      const s = this.starve[c];
      const famine = s >= FAMINE.minDeaths && s * 100 >= pct * this.lastPop[c];
      if (famine) {
        if (this.famineStart[c] < 0) { this.famineStart[c] = year; this.famineDeaths[c] = 0; }
        this.famineEnd[c] = year;
        this.famineDeaths[c] += s;
      }
      const extinct = this.lastPop[c] > 0 && pop[c] === 0;
      if (this.famineStart[c] >= 0 && (!famine || extinct)) this.closeFamine(c);
      if (extinct) this.push(EV_EXTINCTION, c, year, year, 0, true);
      this.starve[c] = 0;
      this.lastPop[c] = pop[c];
    }
  }

  closeFamine(c) {
    this.push(EV_FAMINE, c, this.famineStart[c], this.famineEnd[c], this.famineDeaths[c], false);
    if (this.famineDeaths[c] > this.worstDeaths) {
      this.worstCiv = c;
      this.worstStart = this.famineStart[c];
      this.worstEnd = this.famineEnd[c];
      this.worstDeaths = this.famineDeaths[c];
    }
    this.famineStart[c] = -1;
  }

  push(type, civ, year, end, deaths, always) {
    if (this.evCount >= EVENT_CAP - (always ? 0 : this.civs)) { this.evDropped++; return false; }
    const k = this.evCount++;
    this.evType[k] = type;
    this.evCiv[k] = civ;
    this.evYear[k] = year;
    this.evEnd[k] = end;
    this.evDeaths[k] = deaths;
    return true;
  }

  /**
   * Plain-data records for the end screen. Famines still going on count as
   * ending in the last year. The living are scanned once here for the oldest alive.
   */
  data(people, year) {
    let alive = -1;
    for (let i = 0; i < people.high; i++) {
      if (!people.alive[i]) continue;
      if (alive < 0 || people.age[i] > people.age[alive] || (people.age[i] === people.age[alive] && people.id[i] < people.id[alive])) alive = i;
    }
    const oldestAlive = alive < 0 ? null : { id: people.id[alive], civ: people.civ[alive], age: people.age[alive] };
    let oldestEver = this.oldestAge < 0 ? null
      : { id: this.oldestId, civ: this.oldestCiv, age: this.oldestAge, alive: false, diedYear: this.oldestYear };
    if (oldestAlive && (!oldestEver || oldestAlive.age > oldestEver.age)) oldestEver = { ...oldestAlive, alive: true, diedYear: null };

    const events = [];
    for (let k = 0; k < this.evCount; k++) {
      const e = { type: EVENT_TYPES[this.evType[k]], civ: this.evCiv[k], year: this.evYear[k], endYear: this.evEnd[k], deaths: this.evDeaths[k], ongoing: false };
      if (this.evType[k] === EV_FIGHT) {
        const h = this.evHex[k];
        Object.assign(e, { hex: h, col: h % this.cols, row: Math.floor(h / this.cols), attacker: e.civ, defender: this.evDefender[k], holder: this.evHolder[k], winner: this.evWinner[k] });
      }
      events.push(e);
    }
    let worst = this.worstCiv < 0 ? null
      : { civ: this.worstCiv, startYear: this.worstStart, endYear: this.worstEnd, deaths: this.worstDeaths, ongoing: false };
    for (let c = 0; c < this.civs; c++) {
      if (this.famineStart[c] < 0) continue;
      const f = { civ: c, startYear: this.famineStart[c], endYear: this.famineEnd[c], deaths: this.famineDeaths[c], ongoing: true };
      events.push({ type: 'famine', civ: c, year: f.startYear, endYear: f.endYear, deaths: f.deaths, ongoing: true });
      // Ties go to the famine that ended first, so an ongoing one needs strictly more deaths.
      if (!worst || f.deaths > worst.deaths) worst = f;
    }
    events.sort((a, b) => a.year - b.year || EVENT_ORDER[a.type] - EVENT_ORDER[b.type] || a.civ - b.civ);

    let most = -1;
    for (let f = 0; f < this.founderDesc.length; f++) if (this.founderDesc[f] > 0 && (most < 0 || this.founderDesc[f] > this.founderDesc[most])) most = f;

    return {
      year,
      oldestEver,
      oldestAlive,
      longestLine: {
        generations: this.lineGen,
        personId: this.linePerson,
        founderId: this.founderId[this.lineFounder] ?? 0,
        civ: this.founderCiv[this.lineFounder] ?? 0,
        year: this.lineYear,
      },
      mostDescendants: most < 0 ? null : { id: this.founderId[most], civ: this.founderCiv[most], descendants: this.founderDesc[most] },
      worstFamine: worst,
      events,
      eventsDropped: this.evDropped,
    };
  }
}
