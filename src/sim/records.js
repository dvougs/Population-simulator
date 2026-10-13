// Records, wars and the history chronicle for the end screen, kept up as the
// run goes (every number is in RULES.md "Statistics" and "End screen"). Nothing
// here allocates per tick: the counters are typed arrays sized at the start,
// and the event log is a fixed set of typed columns with room for every event
// it can ever hold.
//
// Most descendants only needs a counter per founder: a parent has every
// descendant of their child plus the child, so the person with the most
// descendants is always one of the founders.

import { DEATH_STARVATION } from './life.js';

/** A famine year: a civ's starvation deaths are at least minShare of its people at the start of the year, and at least minDeaths. */
export const FAMINE = Object.freeze({ minShare: 0.01, minDeaths: 5 });
/** Populations whose first passing is logged, once each per civ. */
export const MILESTONES = Object.freeze([100, 500, 1000]);
/**
 * The History chronicle: at most `lines` lines; a famine makes it only if it
 * killed at least `famineShare` of the civ's people at its start, and only the
 * `famines` deadliest such famines are kept.
 */
export const CHRONICLE = Object.freeze({ lines: 12, famineShare: 0.1, famines: 3 });
export const EVENT_TYPES = ['famine', 'extinction', 'contact', 'milestone', 'level', 'wonder', 'captured', 'city', 'cityTaken', 'truce', 'warAgain', 'trade', 'oldRoute', 'declared'];
/** Wonder captures logged at most (the rest are only counted). */
export const CAPTURES_LOGGED = 16;
const EV_FAMINE = 0;
const EV_EXTINCTION = 1;
const EV_CONTACT = 2;
const EV_MILESTONE = 3;
const EV_LEVEL = 4;
const EV_WONDER = 5;
const EV_CAPTURED = 6;
const EV_CITY = 7;
const EV_CITY_TAKEN = 8;
const EV_TRUCE = 9;
const EV_WAR_AGAIN = 10;
const EV_TRADE = 11;
const EV_OLD_ROUTE = 12;
const EV_DECLARED = 13;
const DIPLOMACY_EVENTS = { truce: EV_TRUCE, war: EV_WAR_AGAIN, trade: EV_TRADE, oldRoute: EV_OLD_ROUTE };
/** Diplomacy events (truces, wars resumed, trade opened, old trade routes) logged at most. */
export const DIPLOMACY_LOGGED = 24;
/** Declarations of war logged at most (civ: who declared, other: on whom). */
export const DECLARED_LOGGED = 16;
/** Settlement tiers whose first reaching is logged once per civ (city, metropolis, megapolis), and city captures logged at most. */
export const CITY_TIERS_LOGGED = Object.freeze([3, 4, 5]);
export const CITY_TAKEN_LOGGED = 16;
/** Order of events in the same year: famines, level-ups (start of the year), first contacts, milestones, extinctions (end of it). */
const EVENT_ORDER = { famine: 0, level: 1, wonder: 1, captured: 1, city: 1, cityTaken: 1, trade: 1, oldRoute: 1, contact: 2, declared: 2, warAgain: 2, truce: 2, milestone: 3, extinction: 4 };
/** Which events the chronicle keeps first when there are too many. */
const IMPORTANCE = { extinction: 0, wonder: 1, level: 1, captured: 2, city: 2, cityTaken: 2, contact: 2, declared: 2, truce: 2, warAgain: 2, trade: 3, oldRoute: 3, milestone: 3, famine: 4 };
const byYear = (a, b) => a.year - b.year || EVENT_ORDER[a.type] - EVENT_ORDER[b.type] || a.civ - b.civ
  || (a.other ?? 0) - (b.other ?? 0) || (a.level ?? 0) - (b.level ?? 0) || (a.people ?? 0) - (b.people ?? 0);
/** Within a kind: higher levels and milestones, then deadlier famines, then the earlier event. */
const byImportance = (a, b) => IMPORTANCE[a.type] - IMPORTANCE[b.type] || (b.level ?? 0) - (a.level ?? 0)
  || (b.people ?? 0) - (a.people ?? 0) || b.deaths - a.deaths || byYear(a, b);

/**
 * The History chronicle from the logged events (any order): the CHRONICLE.lines
 * most important (extinctions, then level-ups, first contacts, milestones,
 * famines), shown oldest first.
 */
export function chronicle(events, lines = CHRONICLE.lines) {
  return events.slice().sort(byImportance).slice(0, lines).sort(byYear);
}

export class Records {
  /** cols: the map's width, to give first contacts a column and row. */
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
    this.famineStartPop = new Int32Array(civs);
    this.worstCiv = -1;
    this.worstStart = 0;
    this.worstEnd = 0;
    this.worstDeaths = 0;
    // The deadliest big famines that have ended, deadliest first (fixed slots, so famines never fill the log).
    const F = CHRONICLE.famines;
    this.bigCount = 0;
    this.bigCiv = new Uint8Array(F);
    this.bigStart = new Int32Array(F);
    this.bigEnd = new Int32Array(F);
    this.bigDeaths = new Int32Array(F);
    this.bigStartPop = new Int32Array(F);
    // Wars, per pair of civs: fights and first and last year at [a × civs + b] with a < b;
    // wins and kills (the other civ's people killed) by civ a against civ b at [a × civs + b].
    this.warFights = new Int32Array(civs * civs);
    this.warFirst = new Int32Array(civs * civs);
    this.warLast = new Int32Array(civs * civs);
    this.warWins = new Int32Array(civs * civs);
    this.warKills = new Int32Array(civs * civs);
    // Event log columns, sized for every event that can happen (see room()).
    const size = this.room();
    this.evCount = 0;
    this.evType = new Uint8Array(size);
    this.evCiv = new Uint8Array(size);
    this.evYear = new Int32Array(size);
    // First contacts: evCiv the lower civ number, evOther the other, evHex where. Milestones: evValue people; level-ups: evValue the level.
    this.evOther = new Uint8Array(size);
    this.evHex = new Int32Array(size);
    this.evValue = new Int32Array(size);
    this.met = new Uint8Array(civs * civs);
    this.unmet = (civs * (civs - 1)) / 2;
    this.present = new Int32Array(civs);
    this.milestones = new Uint8Array(civs);
    this.levelsLogged = new Uint8Array(civs);
    this.captures = 0;
    this.cityLogged = new Uint8Array(civs);
    this.cityTaken = 0;
    this.diplomacyLogged = 0;
    this.declaredLogged = 0;
  }

  /** Every event the log can hold: a first contact per pair; per civ 3 milestones, 4 level-ups (levels 2 to 5) and an extinction. */
  room() {
    return (this.civs * (this.civs - 1)) / 2 + (MILESTONES.length + 4 + 1 + CITY_TIERS_LOGGED.length) * this.civs + 4 + CAPTURES_LOGGED
      + CITY_TAKEN_LOGGED + DIPLOMACY_LOGGED + DECLARED_LOGGED;
  }

  /**
   * A buildings event (buildings.js): a finished wonder ('wonder') and the first
   * CAPTURES_LOGGED captures ('captured', other = the civ it was taken from, −1 if
   * abandoned) are logged; value is the era.
   */
  building(kind, c, era, year, other) {
    if (kind === 'wonder') {
      const e = this.push(EV_WONDER, c, year);
      if (e >= 0) this.evValue[e] = era;
    } else if (kind === 'captured' && this.captures++ < CAPTURES_LOGGED) {
      const e = this.push(EV_CAPTURED, c, year);
      if (e >= 0) { this.evValue[e] = era; this.evOther[e] = other < 0 ? 255 : other; }
    }
  }

  /**
   * A settlements event (settlements.js): a civ's first settlement to reach each of
   * CITY_TIERS_LOGGED ('tier', other = the tier) and the first CITY_TAKEN_LOGGED times a
   * city or bigger changed hands ('taken', other = the civ it was taken from).
   */
  settlement(kind, c, h, year, other) {
    if (kind === 'tier') {
      const bit = CITY_TIERS_LOGGED.indexOf(other);
      if (bit < 0 || this.cityLogged[c] & (1 << bit)) return;
      this.cityLogged[c] |= 1 << bit;
      const e = this.push(EV_CITY, c, year);
      if (e >= 0) { this.evValue[e] = other; this.evHex[e] = h; }
    } else if (kind === 'taken' && this.cityTaken++ < CITY_TAKEN_LOGGED) {
      const e = this.push(EV_CITY_TAKEN, c, year);
      if (e >= 0) { this.evOther[e] = other; this.evHex[e] = h; }
    }
  }

  /**
   * A diplomacy event (diplomacy.js) between civs a < b: 'truce' (value: 1 + the civ that paid
   * tribute, 0 for none), 'war' (a truce or peace broken), 'trade' (first goods) or 'oldRoute'.
   */
  diplomacy(kind, a, b, year, value) {
    if (kind === 'declared') {
      if (this.declaredLogged >= DECLARED_LOGGED) return;
      this.declaredLogged++;
      const e = this.push(EV_DECLARED, a, year);
      if (e >= 0) { this.evOther[e] = b; this.evValue[e] = 0; }
      return;
    }
    const type = DIPLOMACY_EVENTS[kind];
    if (type === undefined || this.diplomacyLogged >= DIPLOMACY_LOGGED) return;
    this.diplomacyLogged++;
    const e = this.push(type, a, year);
    if (e >= 0) { this.evOther[e] = b; this.evValue[e] = value; }
  }

  /**
   * A fight this year between attacker and defender, won by winner.
   * byWinner: the loser's people the winner killed; byLoser: the winner's people the loser killed.
   */
  fight(year, attacker, defender, winner, byWinner, byLoser) {
    const civs = this.civs;
    const a = attacker < defender ? attacker : defender;
    const b = a === attacker ? defender : attacker;
    const loser = winner === a ? b : a;
    const k = a * civs + b;
    if (this.warFights[k]++ === 0) this.warFirst[k] = year;
    this.warLast[k] = year;
    this.warWins[winner * civs + loser]++;
    this.warKills[winner * civs + loser] += byWinner;
    this.warKills[loser * civs + winner] += byLoser;
  }

  /** A civ reached a level; the first time it reaches each level from 2 up is logged. */
  level(c, level, year) {
    if (level < 2 || (this.levelsLogged[c] & (1 << level))) return;
    this.levelsLogged[c] |= 1 << level;
    const e = this.push(EV_LEVEL, c, year);
    if (e >= 0) this.evValue[e] = level;
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

  /**
   * Close the year: famine spells, extinctions, first contacts and milestones.
   * pop is each civ's people at the end of the year; hexCivPop[hex × civs + civ]
   * its people per hex. _hexes (each civ's hexes held) is not needed any more.
   */
  endYear(year, pop, _hexes = null, hexCivPop = null) {
    if (hexCivPop && this.unmet > 0) this.contacts(year, hexCivPop);
    for (let c = 0; c < this.civs; c++) {
      const p = pop[c];
      for (let k = 0; k < MILESTONES.length; k++) {
        if (p < MILESTONES[k] || (this.milestones[c] & (1 << k))) continue;
        this.milestones[c] |= 1 << k;
        const e = this.push(EV_MILESTONE, c, year);
        if (e >= 0) this.evValue[e] = MILESTONES[k];
      }
    }
    this.famines(year, pop);
  }

  /** First year each pair of civs shares a hex (the lowest such hex). */
  contacts(year, hexCivPop) {
    const civs = this.civs;
    const n = hexCivPop.length / civs;
    const present = this.present;
    for (let h = 0; h < n && this.unmet > 0; h++) {
      let k = 0;
      for (let c = 0; c < civs; c++) if (hexCivPop[h * civs + c] > 0) present[k++] = c;
      for (let x = 0; x < k; x++) {
        for (let y = x + 1; y < k; y++) {
          const a = present[x];
          const b = present[y];
          if (this.met[a * civs + b]) continue;
          this.met[a * civs + b] = 1;
          this.unmet--;
          const e = this.push(EV_CONTACT, a, year);
          if (e < 0) continue;
          this.evOther[e] = b;
          this.evHex[e] = h;
        }
      }
    }
  }

  famines(year, pop) {
    const pct = Math.round(FAMINE.minShare * 100);
    for (let c = 0; c < this.civs; c++) {
      const s = this.starve[c];
      const famine = s >= FAMINE.minDeaths && s * 100 >= pct * this.lastPop[c];
      if (famine) {
        if (this.famineStart[c] < 0) { this.famineStart[c] = year; this.famineDeaths[c] = 0; this.famineStartPop[c] = this.lastPop[c]; }
        this.famineEnd[c] = year;
        this.famineDeaths[c] += s;
      }
      const extinct = this.lastPop[c] > 0 && pop[c] === 0;
      if (this.famineStart[c] >= 0 && (!famine || extinct)) this.closeFamine(c);
      if (extinct) this.push(EV_EXTINCTION, c, year);
      this.starve[c] = 0;
      this.lastPop[c] = pop[c];
    }
  }

  closeFamine(c) {
    const deaths = this.famineDeaths[c];
    if (deaths > this.worstDeaths) {
      this.worstCiv = c;
      this.worstStart = this.famineStart[c];
      this.worstEnd = this.famineEnd[c];
      this.worstDeaths = deaths;
    }
    if (bigFamine(deaths, this.famineStartPop[c])) this.keepBig(c, this.famineStart[c], this.famineEnd[c], deaths, this.famineStartPop[c]);
    this.famineStart[c] = -1;
  }

  /** Slot a big famine among the deadliest kept; on a tie the one that ended first stays ahead. */
  keepBig(c, start, end, deaths, startPop) {
    const F = CHRONICLE.famines;
    let k = this.bigCount;
    while (k > 0 && deaths > this.bigDeaths[k - 1]) k--;
    if (k >= F) return;
    for (let j = Math.min(this.bigCount, F - 1); j > k; j--) {
      this.bigCiv[j] = this.bigCiv[j - 1];
      this.bigStart[j] = this.bigStart[j - 1];
      this.bigEnd[j] = this.bigEnd[j - 1];
      this.bigDeaths[j] = this.bigDeaths[j - 1];
      this.bigStartPop[j] = this.bigStartPop[j - 1];
    }
    this.bigCiv[k] = c;
    this.bigStart[k] = start;
    this.bigEnd[k] = end;
    this.bigDeaths[k] = deaths;
    this.bigStartPop[k] = startPop;
    if (this.bigCount < F) this.bigCount++;
  }

  /** Log an event; returns its index, or −1 if the log is somehow full. */
  push(type, civ, year) {
    if (this.evCount >= this.evType.length) return -1;
    const k = this.evCount++;
    this.evType[k] = type;
    this.evCiv[k] = civ;
    this.evYear[k] = year;
    return k;
  }

  /** Every pair of civs that ever fought, deadliest first (total kills; ties by civ numbers). */
  wars() {
    const civs = this.civs;
    const out = [];
    for (let a = 0; a < civs; a++) {
      for (let b = a + 1; b < civs; b++) {
        const k = a * civs + b;
        if (this.warFights[k] === 0) continue;
        const r = b * civs + a;
        out.push({
          civs: [a, b], firstYear: this.warFirst[k], lastYear: this.warLast[k], fights: this.warFights[k],
          won: [this.warWins[k], this.warWins[r]], killed: [this.warKills[k], this.warKills[r]],
        });
      }
    }
    return out.sort((x, y) => (y.killed[0] + y.killed[1]) - (x.killed[0] + x.killed[1]) || x.civs[0] - y.civs[0] || x.civs[1] - y.civs[1]);
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
      const e = { type: EVENT_TYPES[this.evType[k]], civ: this.evCiv[k], year: this.evYear[k] };
      const t = this.evType[k];
      if (t === EV_CONTACT) {
        const h = this.evHex[k];
        Object.assign(e, { other: this.evOther[k], hex: h, col: h % this.cols, row: Math.floor(h / this.cols) });
      } else if (t === EV_MILESTONE) e.people = this.evValue[k];
      else if (t === EV_LEVEL) e.level = this.evValue[k];
      else if (t === EV_WONDER) e.era = this.evValue[k];
      else if (t === EV_CAPTURED) Object.assign(e, { era: this.evValue[k], other: this.evOther[k] === 255 ? null : this.evOther[k] });
      else if (t === EV_TRUCE) Object.assign(e, { other: this.evOther[k], tribute: this.evValue[k] > 0 ? this.evValue[k] - 1 : null });
      else if ((t >= EV_WAR_AGAIN && t <= EV_OLD_ROUTE) || t === EV_DECLARED) e.other = this.evOther[k];
      else if (t === EV_CITY || t === EV_CITY_TAKEN) {
        const h = this.evHex[k];
        Object.assign(e, { hex: h, col: h % this.cols, row: Math.floor(h / this.cols) });
        if (t === EV_CITY) e.tier = this.evValue[k]; else e.other = this.evOther[k];
      }
      events.push(e);
    }
    const famine = (civ, startYear, endYear, deaths, startPop, ongoing) => ({ type: 'famine', civ, year: startYear, endYear, deaths, startPop, ongoing });
    const big = [];
    for (let k = 0; k < this.bigCount; k++) big.push(famine(this.bigCiv[k], this.bigStart[k], this.bigEnd[k], this.bigDeaths[k], this.bigStartPop[k], false));
    let worst = this.worstCiv < 0 ? null
      : { civ: this.worstCiv, startYear: this.worstStart, endYear: this.worstEnd, deaths: this.worstDeaths, ongoing: false };
    for (let c = 0; c < this.civs; c++) {
      if (this.famineStart[c] < 0) continue;
      const f = { civ: c, startYear: this.famineStart[c], endYear: this.famineEnd[c], deaths: this.famineDeaths[c], ongoing: true };
      // Ties go to the famine that ended first, so an ongoing one needs strictly more deaths.
      if (!worst || f.deaths > worst.deaths) worst = f;
      if (!bigFamine(f.deaths, this.famineStartPop[c])) continue;
      let k = big.length;
      while (k > 0 && f.deaths > big[k - 1].deaths) k--;
      big.splice(k, 0, famine(c, f.startYear, f.endYear, f.deaths, this.famineStartPop[c], true));
    }
    events.push(...big.slice(0, CHRONICLE.famines));
    events.sort(byYear);

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
      wars: this.wars(),
      events,
      chronicle: chronicle(events),
    };
  }
}

/** A famine big enough for the chronicle: deaths at least CHRONICLE.famineShare of the civ's people at its start. */
function bigFamine(deaths, startPop) {
  return deaths * 100 >= Math.round(CHRONICLE.famineShare * 100) * startPop;
}
