// SimHost: the only way the UI talks to the simulation. Everything crossing this
// boundary is plain data or typed arrays, so a Web Worker implementation can
// replace LocalSimHost without touching the UI.

import { Simulation } from '../sim/simulation.js';
import { generateMap, hashMap, countTerrain } from '../sim/mapgen.js';

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

  get params() { return this.sim ? { ...this.sim.params } : null; }
  get finished() { return this.sim?.finished ?? false; }
  get tickCount() { return this.sim?.tickCount ?? 0; }

  map() { return this.sim ? mapData(this.sim.map) : null; }
  /** Live totals: year, population, per-civ summary (plain data). */
  stats() { return this.sim?.stats() ?? null; }
  /** Per-civ yearly history recorded during the run: plain data and typed arrays (copies). */
  history() { return this.sim?.history() ?? null; }
  inspect(col, row) { return this.sim?.inspect(col, row) ?? null; }
  hash() { return this.sim?.hash() ?? null; }
  mapHash() { return this.sim?.mapHash() ?? null; }
}
