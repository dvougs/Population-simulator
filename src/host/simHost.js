// SimHost: the only way the UI talks to the simulation. Everything crossing this
// boundary is plain data or typed arrays, so a Web Worker implementation can
// replace LocalSimHost without touching the UI.

import { Simulation } from '../sim/simulation.js';
import { generateMap, hashMap, countTerrain } from '../sim/mapgen.js';
import { buildReach } from '../sim/migration.js';

/** The drawable part of a map: sizes and typed arrays only. */
function mapData(map) {
  return {
    cols: map.cols,
    rows: map.rows,
    terrain: map.terrain,
    lake: map.lake,
    river: map.river,
    riverTo: map.riverTo,
    elevation: map.elevation,
    terrainCounts: countTerrain(map),
    hash: hashMap(map),
    params: { ...map.params },
  };
}

export class LocalSimHost {
  constructor() {
    this.sim = null;
  }

  start(params) {
    this.sim = new Simulation(params);
    return this.sim.params;
  }

  /** Generate a map without starting a game (map-generation preview). */
  preview(mapParams) {
    return mapData(generateMap(mapParams));
  }

  /** Run up to n ticks; returns how many ran. */
  tick(n) {
    return this.sim ? this.sim.tick(n) : 0;
  }

  /** End the run now ("End now"); no winner. */
  endNow() { this.sim?.endNow(); }

  /** Continue a finished run as a sandbox ("Keep watching"). */
  keepWatching() { this.sim?.keepWatching(); }

  get params() { return this.sim ? { ...this.sim.params } : null; }
  get finished() { return this.sim?.finished ?? false; }
  get tickCount() { return this.sim?.tickCount ?? 0; }

  map() { return this.sim ? mapData(this.sim.map) : null; }
  /** Live totals: year, population, per-civ summary (plain data). */
  stats() { return this.sim?.stats() ?? null; }
  /** Per-civ yearly history recorded during the run: plain data and typed arrays (copies). */
  history() { return this.sim?.history() ?? null; }
  /** End-screen data: header, per-civ summary, history, records and events (plain data and typed arrays). */
  report() { return this.sim?.report() ?? null; }
  inspect(col, row) { return this.sim?.inspect(col, row) ?? null; }
  /** People per civ per hex and every person's slot, id, hex and civ (typed array copies), for drawing. */
  population() { return this.sim?.population() ?? null; }
  /** Details of the person in pool slot `slot` with id `id`, or null if they are no longer alive. */
  person(slot, id) { return this.sim?.person(slot, id) ?? null; }
  /** Living people in hex (col, row): { index, total, people: [{ slot, id, age, health, hunger, civ }] }, lowest id first. */
  hexPeople(col, row, limit) { return this.sim?.hexPeople(col, row, limit) ?? null; }
  /**
   * Land hexes a person in hex `index` of the running map could walk to in one
   * year with `movePoints` and no boats (RULES.md "Migration"), ascending; for
   * the How to play pictures. Null without a game or off the map.
   */
  reach(index, movePoints) {
    const map = this.sim?.map;
    if (!map || !Number.isInteger(index) || index < 0 || index >= map.count) return null;
    const { offsets, targets } = buildReach(map, movePoints);
    return targets.slice(offsets[index], offsets[index + 1]);
  }
  hash() { return this.sim?.hash() ?? null; }
  mapHash() { return this.sim?.mapHash() ?? null; }
}
