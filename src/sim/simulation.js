// Simulation: owns the world, the civs and the RNG. The only entry point the UI,
// the headless runner and the tests use.

import { Rng } from './rng.js';
import { normalizeParams } from './params.js';
import { CIV_TYPES, civColor } from './civTypes.js';
import { createWorld, cellPop, hashWorld } from './world.js';
import { generateTerrain } from './mapgen.js';
import { chooseStarts, settle } from './placement.js';
import { step } from './step.js';
import { TERRAIN_NAMES } from './constants.js';

export class Simulation {
  constructor(params) {
    this.params = normalizeParams(params);
    const p = this.params;
    const root = new Rng(p.seed);
    this.mapRng = root.fork('map');
    this.placeRng = root.fork('place');
    this.rng = root.fork('step');

    this.world = createWorld(p.width, p.height);
    generateTerrain(this.world, p, this.mapRng);

    this.civs = [null]; // id 0 = unclaimed
    const seen = {};
    p.civs.forEach((type, k) => {
      const def = CIV_TYPES[type];
      const nth = seen[type] ?? 0;
      seen[type] = nth + 1;
      this.civs.push({
        id: k + 1,
        type,
        name: nth === 0 ? def.name : `${def.name} ${nth + 1}`,
        color: civColor(type, nth),
        traits: { ...def.traits },
        behaviour: { ...def.behaviour },
        pop: 0,
        territory: 0,
        peakPop: 0,
        pool: 0,
        prevDeficit: 0,
        extinctAt: null,
      });
    });

    const starts = chooseStarts(this.world, p.civs.length, p.placement, this.placeRng);
    starts.forEach((cell, k) => settle(this.world, k + 1, cell, p.startPop));
    for (let c = 1; c < this.civs.length; c++) {
      if (starts[c - 1] === undefined) this.civs[c].extinctAt = 0; // no room to start
    }

    this.tickCount = 0;
    this.finished = false;
    this.endReason = null;
    this.refreshCounts();
  }

  refreshCounts() {
    const w = this.world;
    for (let c = 1; c < this.civs.length; c++) { this.civs[c].pop = 0; this.civs[c].territory = 0; }
    for (let i = 0; i < w.size; i++) {
      const o = w.owner[i];
      if (o) { this.civs[o].pop += cellPop(w, i); this.civs[o].territory++; }
    }
    for (let c = 1; c < this.civs.length; c++) this.civs[c].peakPop = Math.max(this.civs[c].peakPop, this.civs[c].pop);
  }

  /** Advance n ticks (stops early when the end condition is met). Returns ticks run. */
  tick(n = 1) {
    let ran = 0;
    while (ran < n && !this.finished) {
      step(this.world, this.civs, this.rng);
      this.tickCount++;
      ran++;
      this.checkEnd();
    }
    return ran;
  }

  checkEnd() {
    let alive = 0;
    for (let c = 1; c < this.civs.length; c++) {
      const civ = this.civs[c];
      if (civ.pop > 0) alive++;
      else if (civ.extinctAt === null) civ.extinctAt = this.tickCount;
    }
    const p = this.params;
    if (alive === 0) this.end('All civilisations died out');
    else if (p.endCondition === 'ticks' && this.tickCount >= p.endTicks) this.end(`Reached year ${p.endTicks}`);
    else if (p.endCondition === 'lastStanding' && alive === 1 && this.civs.length > 2) {
      const winner = this.civs.find((c) => c && c.pop > 0);
      this.end(`${winner.name} is the last civilisation standing`);
    }
  }

  end(reason) {
    this.finished = true;
    this.endReason = reason;
  }

  stats() {
    let totalPop = 0;
    const civs = this.civs.slice(1).map((c) => {
      totalPop += c.pop;
      return {
        id: c.id, type: c.type, name: c.name, color: c.color,
        pop: c.pop, territory: c.territory, peakPop: c.peakPop,
        alive: c.pop > 0, extinctAt: c.extinctAt,
      };
    });
    return { tick: this.tickCount, totalPop, civs, finished: this.finished, endReason: this.endReason };
  }

  inspect(x, y) {
    const w = this.world;
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return null;
    const i = y * w.width + x;
    const o = w.owner[i];
    return {
      x, y,
      terrain: TERRAIN_NAMES[w.terrain[i]],
      food: w.food[i],
      foodCap: w.foodCap[i],
      capacity: w.capacity[i],
      owner: o ? { id: o, name: this.civs[o].name, type: this.civs[o].type, color: this.civs[o].color } : null,
      young: w.young[i],
      adult: w.adult[i],
      elder: w.elder[i],
      pop: cellPop(w, i),
    };
  }

  hash() {
    return hashWorld(this.world);
  }
}
