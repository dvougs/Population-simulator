// The small world the home page and How to play are drawn from: a real game,
// run through its own SimHost, so every picture shows the rules as they are.
// Its settings and years are listed in RULES.md ("Home page").

import { LocalSimHost } from '../host/simHost.js';
import { hexColours } from '../render/palette.js';

/** Settings of the pictured world (every other setting is the default). */
export const DEMO_PARAMS = Object.freeze({
  seed: 'genesis',
  size: 12,
  rivers: 3,
  civCount: 4,
  civTypes: Object.freeze(['expansionist', 'aggressive', 'cooperative', 'nomadic']),
  startPop: 20,
  endConditions: Object.freeze([]),
});

export const DEMO = Object.freeze({
  /** How to play shows the world in this year. */
  howYear: 300,
  /** The home page's living world starts from this year … */
  homeStartYear: 60,
  /** … lives this many years a second … */
  homeYearsPerSecond: 6,
  /** … and starts again from homeStartYear after this year, or when everyone has died. */
  homeRestartYear: 1500,
  /** With reduced motion the home page shows this one year, standing still. */
  homeStillYear: 300,
});

export class DemoWorld {
  constructor(params = DEMO_PARAMS) {
    this.host = new LocalSimHost();
    this.host.start({ ...params });
    this.map = this.host.map();
    this.colours = hexColours(this.map);
  }

  /** Run until `year` (no-op if already there). */
  runTo(year) {
    const n = year - this.host.tickCount;
    if (n > 0) this.host.tick(n);
  }

  get year() { return this.host.tickCount; }

  /** What drawWorld needs, with the people as they are now. */
  world() {
    return { map: this.map, colours: this.colours, pop: this.host.population() };
  }
}
