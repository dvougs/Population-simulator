// Migration: people leave hungry or crowded hexes for hexes with spare food
// within a year's walk. Every number here is listed in RULES.md ("Migration").
//
// Decide-then-apply: every mover chooses against the same snapshot of food and
// head counts, taken before anyone moves, so the order people are visited in
// does not change where anyone goes.

import { DEEP_WATER, MOVE_COST } from './terrain.js';
import { LIFE } from './life.js';

export const MIGRATION = Object.freeze({
  /** Movement points a person has in a year; entering a hex costs its movement cost. */
  movePoints: 3,
  /** A hex is crowded when it holds more than this share of its food capacity in people. */
  crowdedShare: 0.8,
  /** Yearly chance a hungry person sets out. */
  hungryChance: 0.5,
  /** Yearly chance a fed person in a crowded hex sets out. */
  crowdedChance: 0.2,
});

/**
 * For each land hex, the land hexes reachable in one year (cheapest path cost
 * ≤ movePoints, never through water), excluding itself, in index order.
 * Returned as offsets/targets (CSR): targets[offsets[h] … offsets[h + 1] − 1].
 */
export function buildReach(map) {
  const { count, terrain, neighbours } = map;
  const lists = [];
  const cost = new Float64Array(count).fill(Infinity);
  const touched = [];
  for (let h = 0; h < count; h++) {
    const out = [];
    lists.push(out);
    if (terrain[h] === DEEP_WATER) continue;
    // Tiny Dijkstra: costs are a few small values and the budget is small, so a
    // sorted frontier array is plenty.
    cost[h] = 0;
    touched.push(h);
    const frontier = [h];
    while (frontier.length) {
      let bi = 0;
      for (let k = 1; k < frontier.length; k++) {
        const a = frontier[k]; const b = frontier[bi];
        if (cost[a] < cost[b] || (cost[a] === cost[b] && a < b)) bi = k;
      }
      const u = frontier.splice(bi, 1)[0];
      for (let d = 0; d < 6; d++) {
        const v = neighbours[u * 6 + d];
        if (v < 0 || terrain[v] === DEEP_WATER) continue;
        const c = cost[u] + MOVE_COST[terrain[v]];
        if (c > MIGRATION.movePoints || c >= cost[v]) continue;
        if (cost[v] === Infinity) touched.push(v);
        cost[v] = c;
        if (!frontier.includes(v)) frontier.push(v);
      }
    }
    for (const v of touched) if (v !== h) out.push(v);
    out.sort((a, b) => a - b);
    for (const v of touched) cost[v] = Infinity;
    touched.length = 0;
  }
  const offsets = new Int32Array(count + 1);
  for (let h = 0; h < count; h++) offsets[h + 1] = offsets[h] + lists[h].length;
  const targets = new Int32Array(offsets[count]);
  for (let h = 0; h < count; h++) targets.set(lists[h], offsets[h]);
  return { offsets, targets };
}

/**
 * Spare food of every hex: the food it will hold after this year's regrowth
 * minus the people in it now. Fills pop and spare (scratch, per hex).
 */
function snapshot(people, map, pop, spare) {
  const { alive, hex } = people;
  pop.fill(0);
  for (let i = 0; i < people.high; i++) if (alive[i]) pop[hex[i]]++;
  for (let h = 0; h < map.count; h++) {
    const cap = map.foodCap[h];
    spare[h] = Math.min(cap, map.food[h] + LIFE.foodRegrowth * cap) - pop[h];
  }
}

/**
 * Each hungry person (hunger > 0) sets out with hungryChance; each fed person
 * in a crowded hex with crowdedChance. A mover picks among reachable hexes
 * whose spare food is positive and above its own hex's, at random with weight
 * equal to that spare food. With no such hex it stays.
 * dest: scratch Int32Array at least people.high long. Returns how many moved.
 */
export function migrate(people, map, reach, rng, pop, spare, dest) {
  snapshot(people, map, pop, spare);
  const { alive, hex, hunger } = people;
  const { offsets, targets } = reach;
  const cap = map.foodCap;
  for (let i = 0; i < people.high; i++) {
    dest[i] = -1;
    if (!alive[i]) continue;
    const h = hex[i];
    let chance = 0;
    if (hunger[i] > 0) chance = MIGRATION.hungryChance;
    else if (pop[h] > MIGRATION.crowdedShare * cap[h]) chance = MIGRATION.crowdedChance;
    if (chance === 0 || rng.next() >= chance) continue;
    const own = spare[h];
    let total = 0;
    for (let k = offsets[h]; k < offsets[h + 1]; k++) {
      const s = spare[targets[k]];
      if (s > 0 && s > own) total += s;
    }
    if (total <= 0) continue;
    let r = rng.next() * total;
    for (let k = offsets[h]; k < offsets[h + 1]; k++) {
      const t = targets[k];
      const s = spare[t];
      if (!(s > 0 && s > own)) continue;
      r -= s;
      dest[i] = t;
      if (r < 0) break;
    }
  }
  let moved = 0;
  for (let i = 0; i < people.high; i++) {
    if (dest[i] >= 0) { hex[i] = dest[i]; moved++; }
  }
  return moved;
}
