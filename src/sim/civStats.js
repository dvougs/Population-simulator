// Per-civ statistics, recorded as the run goes so the end screen and the
// headless report cost nothing. Totals are kept for the whole run; the yearly
// history keeps one row per year until it holds HISTORY_ROWS rows, then pairs
// of rows are merged and each new row covers twice as many years, so memory
// stays bounded however long the game runs.

import { DEATH_OLD_AGE } from './life.js';

export const HISTORY_ROWS = 8192;
/** History columns, per civ. pop and hexes are counts at the end of the row's last year; the rest are sums over the row. */
export const HISTORY_FIELDS = ['pop', 'hexes', 'births', 'deathsOldAge', 'deathsStarvation', 'lifespanSum'];
const F = HISTORY_FIELDS.length;
const SNAPSHOT_FIELDS = 2;

export class CivStats {
  constructor(civs) {
    this.civs = civs;
    // Running totals.
    this.births = new Int32Array(civs);
    this.deathsOldAge = new Int32Array(civs);
    this.deathsStarvation = new Int32Array(civs);
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
  }

  birth(civ) {
    this.births[civ]++;
    this.pending[civ * F + 2]++;
  }

  death(civ, cause, age) {
    if (cause === DEATH_OLD_AGE) { this.deathsOldAge[civ]++; this.pending[civ * F + 3]++; }
    else { this.deathsStarvation[civ]++; this.pending[civ * F + 4]++; }
    this.lifespanSum[civ] += age;
    this.pending[civ * F + 5] += age;
  }

  /** Close the year: pop and hexes per civ (counted by the caller), oldest age alive per civ. */
  endYear(year, pop, hexes, oldest) {
    const c = this.civs;
    for (let k = 0; k < c; k++) {
      if (this.pop[k] > 0 && pop[k] === 0) this.extinctYear[k] = year;
      this.pop[k] = pop[k];
      this.hexes[k] = hexes[k];
      if (pop[k] > this.peakPop[k]) { this.peakPop[k] = pop[k]; this.peakPopYear[k] = year; }
      if (hexes[k] > this.peakHexes[k]) this.peakHexes[k] = hexes[k];
      if (oldest[k] > this.oldestAge[k]) this.oldestAge[k] = oldest[k];
      this.pending[k * F] = pop[k];
      this.pending[k * F + 1] = hexes[k];
    }
    this.pendingYears++;
    if (this.pendingYears < this.stride) return;
    if (this.rows === HISTORY_ROWS) {
      this.compact();
      // The pending row now covers half a stride; keep adding years to it.
      if (this.pendingYears < this.stride) return;
    }
    this.years[this.rows] = year;
    this.history.set(this.pending, this.rows * c * F);
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
      for (let j = 0; j < w; j++) h[r * w + j] = j % F < SNAPSHOT_FIELDS ? h[b + j] : h[a + j] + h[b + j];
      this.years[r] = this.years[2 * r + 1];
    }
    this.rows = half;
    this.stride *= 2;
  }

  /** Plain summary per civ (for stats()). */
  summary() {
    const out = [];
    for (let k = 0; k < this.civs; k++) {
      const deaths = this.deathsOldAge[k] + this.deathsStarvation[k];
      out.push({
        id: k,
        name: `Civ ${k + 1}`,
        pop: this.pop[k],
        hexes: this.hexes[k],
        births: this.births[k],
        deaths: { oldAge: this.deathsOldAge[k], starvation: this.deathsStarvation[k] },
        avgLifespan: deaths > 0 ? Math.round((this.lifespanSum[k] / deaths) * 10) / 10 : null,
        oldestAge: this.oldestAge[k],
        peakPop: this.peakPop[k],
        peakPopYear: this.peakPopYear[k],
        peakHexes: this.peakHexes[k],
        extinctYear: this.extinctYear[k] >= 0 ? this.extinctYear[k] : null,
      });
    }
    return out;
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
    return out;
  }
}
