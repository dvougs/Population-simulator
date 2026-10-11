// Migration: people leave hungry or crowded hexes for hexes with spare food
// within a year's walk. Every number here is listed in RULES.md ("Migration").
//
// Decide-then-apply: every mover chooses against the same snapshot of food and
// head counts, taken before anyone moves, so the order people are visited in
// does not change where anyone goes.

import { DEEP_WATER, MOVE_COST } from './terrain.js';
import { LIFE } from './life.js';
import { TYPE_RULES } from './civTypes.js';

export const MIGRATION = Object.freeze({
  /** Movement points a person has in a year; entering a hex costs its movement cost. */
  movePoints: 3,
  /** A hex is crowded when it holds more than this share of its food capacity in people. */
  crowdedShare: 0.8,
  /** Yearly chance a hungry person sets out. */
  hungryChance: 0.5,
  /** Yearly chance a fed person in a crowded hex sets out. */
  crowdedChance: 0.2,
  /** A hex in reach that already holds people of the mover's own civ counts its spare food this many times. */
  ownCivWeight: 2,
});

/**
 * For each land hex, the land hexes reachable in one year (cheapest path cost
 * ≤ movePoints), excluding itself, in index order. Without boats a path never
 * enters water; with boats (`boatCost` > 0) a path may cross one sea or lake
 * hex, which costs boatCost, and must step back onto land to end.
 * Returned as offsets/targets (CSR): targets[offsets[h] … offsets[h + 1] − 1].
 */
export function buildReach(map, movePoints = MIGRATION.movePoints, boatCost = 0) {
  const { count, terrain, neighbours } = map;
  const lists = [];
  // State s = hex + count × (water hexes crossed so far, 0 or 1).
  const cost = new Float64Array(2 * count).fill(Infinity);
  const touched = [];
  const found = new Uint8Array(count);
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
      const s = frontier.splice(bi, 1)[0];
      const u = s % count;
      const crossed = s >= count ? 1 : 0;
      for (let d = 0; d < 6; d++) {
        const v = neighbours[u * 6 + d];
        if (v < 0) continue;
        let t;
        let c;
        if (terrain[v] === DEEP_WATER) {
          // Only by boat, only one water hex, and never two in a row.
          if (!boatCost || crossed || terrain[u] === DEEP_WATER) continue;
          t = v + count;
          c = cost[s] + boatCost;
        } else {
          t = v + crossed * count;
          c = cost[s] + MOVE_COST[terrain[v]];
        }
        if (c > movePoints || c >= cost[t]) continue;
        if (cost[t] === Infinity) touched.push(t);
        cost[t] = c;
        if (!frontier.includes(t)) frontier.push(t);
      }
    }
    for (const t of touched) {
      const v = t % count;
      if (v !== h && terrain[v] !== DEEP_WATER && !found[v]) { found[v] = 1; out.push(v); }
    }
    for (const v of out) found[v] = 0;
    out.sort((a, b) => a - b);
    for (const t of touched) cost[t] = Infinity;
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
 * minus the people in it now. Fills pop and spare (scratch, per hex) and
 * held[civ × hex count + hex] = 1 where that civ has people.
 */
function snapshot(people, map, pop, spare, held) {
  const { alive, hex, civ } = people;
  const n = map.count;
  pop.fill(0);
  held.fill(0);
  for (let i = 0; i < people.high; i++) {
    if (!alive[i]) continue;
    pop[hex[i]]++;
    held[civ[i] * n + hex[i]] = 1;
  }
  for (let h = 0; h < map.count; h++) {
    const cap = map.foodCap[h];
    spare[h] = Math.min(cap, map.food[h] + LIFE.foodRegrowth * cap) - pop[h];
  }
}

/**
 * Per-civ migration numbers from the civ types (types[c], see civTypes.js
 * TYPE_RULES): the chance a hungry person sets out, the chance a fed person
 * in a crowded hex does, the share of food capacity above which a hex counts
 * as crowded for them, and the reach table for their movement points
 * (`reach` is the usual one; others are built here as needed).
 */
export function migrationRules(types, map, reach) {
  const n = types.length;
  const rules = {
    hungryChance: new Float64Array(n),
    crowdedChance: new Float64Array(n),
    crowdedShare: new Float64Array(n),
    reach: new Array(n),
    // Per (hex, civ) total target weight this year and, per civ, the running
    // sums over each hex's reach list, so movers from the same hex and civ
    // scan their reach once and pick by binary search.
    total: new Float64Array(map.count * n),
    cum: new Array(n),
    stamp: new Int32Array(map.count * n),
    gen: 0,
  };
  rules.byPoints = new Map([[`${MIGRATION.movePoints}`, reach]]);
  rules.movePoints = new Int32Array(n);
  rules.boats = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    const t = TYPE_RULES[types[c]] ?? {};
    const factor = t.setOutFactor ?? 1;
    rules.hungryChance[c] = Math.min(1, MIGRATION.hungryChance * factor);
    rules.crowdedChance[c] = t.fedNeverSetsOut ? 0 : Math.min(1, MIGRATION.crowdedChance * factor);
    rules.crowdedShare[c] = t.crowdedShare ?? MIGRATION.crowdedShare;
    rules.movePoints[c] = t.movePoints ?? MIGRATION.movePoints;
    setReach(rules, c, map, false);
  }
  return rules;
}

/**
 * Give civ c the reach table for its movement points, with or without boats
 * (boatCost: movement points to cross one water hex). Tables are built once
 * per kind and shared; only called when a civ gains or loses boats.
 */
export function setReach(rules, c, map, boats, boatCost = 1) {
  const mp = rules.movePoints[c];
  const key = boats ? `${mp}b${boatCost}` : `${mp}`;
  if (!rules.byPoints.has(key)) rules.byPoints.set(key, buildReach(map, mp, boats ? boatCost : 0));
  rules.boats[c] = boats ? 1 : 0;
  rules.reach[c] = rules.byPoints.get(key);
  rules.cum[c] = new Float64Array(rules.reach[c].targets.length);
}

/** Scratch for callers that do not pass one (tests); the Simulation passes its own. */
let sharedHeld = new Uint8Array(0);

/**
 * Each hungry person (hunger > 0) sets out with hungryChance; each fed person
 * in a crowded hex with crowdedChance (both, the crowding share and the reach
 * per civ from `rules` when given, see migrationRules). A mover picks among reachable hexes
 * whose spare food is positive and above its own hex's, at random with weight
 * equal to that spare food, times ownCivWeight where its own civ already has
 * people (before anyone moves). With no such hex it stays.
 * dest: scratch Int32Array at least people.high long. held: scratch
 * Uint8Array of (civ count × map.count); without it a shared one sized for any civ id is used. Returns how many moved.
 */
export function migrate(people, map, reach, rng, pop, spare, dest, held = null, rules = null) {
  const n = map.count;
  if (!held) {
    if (sharedHeld.length < 256 * n) sharedHeld = new Uint8Array(256 * n);
    held = sharedHeld;
  }
  snapshot(people, map, pop, spare, held);
  const { alive, hex, hunger, civ } = people;
  const cap = map.foodCap;
  const civs = rules ? rules.hungryChance.length : 0;
  if (rules) rules.gen++;
  for (let i = 0; i < people.high; i++) {
    dest[i] = -1;
    if (!alive[i]) continue;
    const h = hex[i];
    const c = civ[i];
    let chance = 0;
    if (rules) {
      if (hunger[i] > 0) chance = rules.hungryChance[c];
      else if (pop[h] > rules.crowdedShare[c] * cap[h]) chance = rules.crowdedChance[c];
    } else if (hunger[i] > 0) chance = MIGRATION.hungryChance;
    else if (pop[h] > MIGRATION.crowdedShare * cap[h]) chance = MIGRATION.crowdedChance;
    if (chance === 0 || rng.next() >= chance) continue;
    const { offsets, targets } = rules ? rules.reach[c] : reach;
    const own = spare[h];
    const base = c * n;
    if (rules) {
      // Same choice as the scan below: the first target whose running weight passes r.
      const key = h * civs + c;
      const cum = rules.cum[c];
      if (rules.stamp[key] !== rules.gen) {
        let total = 0;
        for (let k = offsets[h]; k < offsets[h + 1]; k++) {
          const t = targets[k];
          const s = spare[t];
          if (s > 0 && s > own) total += held[base + t] ? s * MIGRATION.ownCivWeight : s;
          cum[k] = total;
        }
        rules.stamp[key] = rules.gen;
        rules.total[key] = total;
      }
      const total = rules.total[key];
      if (total <= 0) continue;
      const r = rng.next() * total;
      let lo = offsets[h];
      let hi = offsets[h + 1] - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] > r) hi = mid; else lo = mid + 1;
      }
      dest[i] = targets[lo];
      continue;
    }
    let total = 0;
    for (let k = offsets[h]; k < offsets[h + 1]; k++) {
      const t = targets[k];
      const s = spare[t];
      if (s > 0 && s > own) total += held[base + t] ? s * MIGRATION.ownCivWeight : s;
    }
    if (total <= 0) continue;
    let r = rng.next() * total;
    for (let k = offsets[h]; k < offsets[h + 1]; k++) {
      const t = targets[k];
      const s = spare[t];
      if (!(s > 0 && s > own)) continue;
      r -= held[base + t] ? s * MIGRATION.ownCivWeight : s;
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
