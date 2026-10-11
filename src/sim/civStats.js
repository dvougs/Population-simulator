// Per-civ statistics, recorded as the run goes so the end screen and the
// headless report cost nothing. Totals are kept for the whole run; the yearly
// history keeps one row per year until it holds HISTORY_ROWS rows, then pairs
// of rows are merged and each new row covers twice as many years, so memory
// stays bounded however long the game runs.

import { DEATH_OLD_AGE, DEATH_WAR } from './life.js';
import { TRAITS, TRAIT_COUNT } from './traits.js';

export const HISTORY_ROWS = 8192;
/** History columns, per civ. pop, hexes and level are values at the end of the row's last year; the rest are sums over the row. */
export const HISTORY_FIELDS = ['pop', 'hexes', 'births', 'deathsOldAge', 'deathsStarvation', 'lifespanSum', 'deathsWar', 'level'];
/** What a civ died out of: the cause of most of its deaths in its last year, or switching when nobody died that year. */
export const EXTINCT_CAUSES = ['oldAge', 'starvation', 'war', 'switching'];
const F = HISTORY_FIELDS.length;
const LEVEL_FIELD = HISTORY_FIELDS.indexOf('level');
/** Columns merged by keeping the later row (the rest are added). */
const SNAPSHOT = HISTORY_FIELDS.map((f) => f === 'pop' || f === 'hexes' || f === 'level');

export class CivStats {
  constructor(civs) {
    this.civs = civs;
    // Running totals.
    this.births = new Int32Array(civs);
    this.deathsOldAge = new Int32Array(civs);
    this.deathsStarvation = new Int32Array(civs);
    this.deathsWar = new Int32Array(civs);
    /** Fights each civ took part in (as attacker or defender), and won. */
    this.fights = new Int32Array(civs);
    this.fightsWon = new Int32Array(civs);
    /** People who switched into and out of each civ. */
    this.switchesIn = new Int32Array(civs);
    this.switchesOut = new Int32Array(civs);
    /** This year's deaths per civ by cause ([civ × 3 + cause]: old age, starvation, war), for the extinction cause. */
    this.yearDeaths = new Int32Array(civs * 3);
    this.extinctCause = new Int8Array(civs).fill(-1);
    this.lifespanSum = new Float64Array(civs);
    this.peakPop = new Int32Array(civs);
    /** First year the peak population was reached. */
    this.peakPopYear = new Int32Array(civs);
    this.peakHexes = new Int32Array(civs);
    this.oldestAge = new Int32Array(civs);
    this.extinctYear = new Int32Array(civs).fill(-1);
    this.pop = new Int32Array(civs);
    this.hexes = new Int32Array(civs);
    // This row's sums, not yet written.
    this.pending = new Float64Array(civs * F);
    this.pendingYears = 0;
    this.stride = 1;
    this.rows = 0;
    this.years = new Int32Array(HISTORY_ROWS);
    this.history = new Float64Array(HISTORY_ROWS * civs * F);
    /** Average of each trait per civ at the end of each row's last year (NaN while the civ has nobody): [(row × civs + civ) × TRAIT_COUNT + trait]. */
    this.traitHistory = new Float32Array(HISTORY_ROWS * civs * TRAIT_COUNT);
    /** This year's averages, and the last averages each civ had while it had people. */
    this.traitNow = new Float64Array(civs * TRAIT_COUNT).fill(NaN);
    this.traitLast = new Float64Array(civs * TRAIT_COUNT).fill(NaN);
    /** The founders' averages (the first year recorded). */
    this.traitStart = null;
  }

  birth(civ) {
    this.births[civ]++;
    this.pending[civ * F + 2]++;
  }

  death(civ, cause, age) {
    if (cause === DEATH_OLD_AGE) { this.deathsOldAge[civ]++; this.pending[civ * F + 3]++; }
    else if (cause === DEATH_WAR) { this.deathsWar[civ]++; this.pending[civ * F + 6]++; }
    else { this.deathsStarvation[civ]++; this.pending[civ * F + 4]++; }
    this.yearDeaths[civ * 3 + cause]++;
    this.lifespanSum[civ] += age;
    this.pending[civ * F + 5] += age;
  }

  fight(attacker, defender, winner) {
    this.fights[attacker]++;
    this.fights[defender]++;
    this.fightsWon[winner]++;
  }

  switched(from, to) {
    this.switchesOut[from]++;
    this.switchesIn[to]++;
  }

  /**
   * Close the year: pop and hexes per civ (counted by the caller), oldest age
   * alive per civ, each civ's trait averages ([civ × TRAIT_COUNT + trait], NaN for an empty civ)
   * and each civ's level (1 when absent).
   */
  endYear(year, pop, hexes, oldest, traitAvg = null, level = null) {
    const c = this.civs;
    if (traitAvg) {
      this.traitNow.set(traitAvg);
      if (!this.traitStart) this.traitStart = Float64Array.from(traitAvg);
      for (let k = 0; k < c; k++) {
        if (pop[k] > 0) for (let t = 0; t < TRAIT_COUNT; t++) this.traitLast[k * TRAIT_COUNT + t] = traitAvg[k * TRAIT_COUNT + t];
      }
    }
    for (let k = 0; k < c; k++) {
      if (this.pop[k] > 0 && pop[k] === 0) {
        this.extinctYear[k] = year;
        // Most deaths that year wins; ties go to the earlier cause (old age, starvation, war).
        let best = -1;
        for (let c = 0; c < 3; c++) if (this.yearDeaths[k * 3 + c] > 0 && (best < 0 || this.yearDeaths[k * 3 + c] > this.yearDeaths[k * 3 + best])) best = c;
        this.extinctCause[k] = best < 0 ? 3 : best;
      }
      this.pop[k] = pop[k];
      this.hexes[k] = hexes[k];
      if (pop[k] > this.peakPop[k]) { this.peakPop[k] = pop[k]; this.peakPopYear[k] = year; }
      if (hexes[k] > this.peakHexes[k]) this.peakHexes[k] = hexes[k];
      if (oldest[k] > this.oldestAge[k]) this.oldestAge[k] = oldest[k];
      this.pending[k * F] = pop[k];
      this.pending[k * F + 1] = hexes[k];
      this.pending[k * F + LEVEL_FIELD] = level ? level[k] : 1;
    }
    this.yearDeaths.fill(0);
    this.pendingYears++;
    if (this.pendingYears < this.stride) return;
    if (this.rows === HISTORY_ROWS) {
      this.compact();
      // The pending row now covers half a stride; keep adding years to it.
      if (this.pendingYears < this.stride) return;
    }
    this.years[this.rows] = year;
    this.history.set(this.pending, this.rows * c * F);
    this.traitHistory.set(this.traitNow, this.rows * c * TRAIT_COUNT);
    this.rows++;
    this.pending.fill(0);
    this.pendingYears = 0;
  }

  /** Merge rows pairwise: snapshots from the later row, sums added. */
  compact() {
    const w = this.civs * F;
    const h = this.history;
    const half = this.rows >> 1;
    for (let r = 0; r < half; r++) {
      const a = 2 * r * w;
      const b = a + w;
      for (let j = 0; j < w; j++) h[r * w + j] = SNAPSHOT[j % F] ? h[b + j] : h[a + j] + h[b + j];
      this.years[r] = this.years[2 * r + 1];
      // Trait averages are snapshots: keep the later row's.
      const tw = this.civs * TRAIT_COUNT;
      this.traitHistory.copyWithin(r * tw, (2 * r + 1) * tw, (2 * r + 2) * tw);
    }
    this.rows = half;
    this.stride *= 2;
  }

  /** Plain summary per civ (for stats()). */
  summary() {
    const out = [];
    for (let k = 0; k < this.civs; k++) {
      const deaths = this.deathsOldAge[k] + this.deathsStarvation[k] + this.deathsWar[k];
      out.push({
        id: k,
        name: `Civ ${k + 1}`,
        pop: this.pop[k],
        hexes: this.hexes[k],
        births: this.births[k],
        deaths: { oldAge: this.deathsOldAge[k], starvation: this.deathsStarvation[k], war: this.deathsWar[k] },
        fights: this.fights[k],
        fightsWon: this.fightsWon[k],
        switchesIn: this.switchesIn[k],
        switchesOut: this.switchesOut[k],
        avgLifespan: deaths > 0 ? Math.round((this.lifespanSum[k] / deaths) * 10) / 10 : null,
        oldestAge: this.oldestAge[k],
        peakPop: this.peakPop[k],
        peakPopYear: this.peakPopYear[k],
        peakHexes: this.peakHexes[k],
        extinctYear: this.extinctYear[k] >= 0 ? this.extinctYear[k] : null,
        extinctCause: this.extinctCause[k] >= 0 ? EXTINCT_CAUSES[this.extinctCause[k]] : null,
        traits: this.traitsOf(k, this.traitLast),
        startTraits: this.traitStart ? this.traitsOf(k, this.traitStart) : null,
      });
    }
    return out;
  }

  /** Civ k's trait averages from a (traitLast: now, or the last before dying out), keyed by trait id; null if none. */
  traitsOf(k, a) {
    if (Number.isNaN(a[k * TRAIT_COUNT])) return null;
    return Object.fromEntries(TRAITS.map((name, t) => [name, Math.round(a[k * TRAIT_COUNT + t] * 1000) / 1000]));
  }

  /**
   * The recorded history as plain typed arrays (copies): years[row] is the
   * last year a row covers; each field is a rows × civs array indexed
   * [row * civs + civ]. stride is how many years each row covers now.
   */
  historyData() {
    const c = this.civs;
    const out = { civs: c, rows: this.rows, stride: this.stride, years: this.years.slice(0, this.rows) };
    HISTORY_FIELDS.forEach((name, f) => {
      const a = name === 'lifespanSum' ? new Float64Array(this.rows * c) : new Int32Array(this.rows * c);
      for (let r = 0; r < this.rows; r++) for (let k = 0; k < c; k++) a[r * c + k] = this.history[(r * c + k) * F + f];
      out[name] = a;
    });
    /** traits[(row × civs + civ) × traitCount + trait], trait order as in traitIds. */
    out.traitIds = TRAITS.slice();
    out.traitCount = TRAIT_COUNT;
    out.traits = this.traitHistory.slice(0, this.rows * c * TRAIT_COUNT);
    return out;
  }
}
