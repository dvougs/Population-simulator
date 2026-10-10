// SimHost: the only way the UI talks to the simulation. Everything crossing this
// boundary is plain data or typed arrays, so a Web Worker implementation can
// replace LocalSimHost without touching the UI.

import { Simulation } from '../sim/simulation.js';

export class LocalSimHost {
  constructor() {
    this.sim = null;
  }

  start(params) {
    this.sim = new Simulation(params);
    return this.sim.params;
  }

  /** Run up to n ticks; returns how many ran. */
  tick(n) {
    return this.sim ? this.sim.tick(n) : 0;
  }

  get world() { return this.sim?.world ?? null; }
  get civs() { return this.sim?.civs ?? null; }
  get finished() { return this.sim?.finished ?? false; }
  get tickCount() { return this.sim?.tickCount ?? 0; }

  stats() { return this.sim?.stats() ?? null; }
  inspect(x, y) { return this.sim?.inspect(x, y) ?? null; }
  hash() { return this.sim?.hash() ?? null; }
}
