// Migration: people leave hungry or crowded hexes for hexes with spare food
// within a year's walk. Every number here is listed in RULES.md ("Migration").
//
// Decide-then-apply: every mover chooses against the same snapshot of food and
// head counts, taken before anyone moves, so the order people are visited in
// does not change where anyone goes.

import { DEEP_WATER, MOVE_COST } from './terrain.js';
import { LIFE, crowdLine } from './life.js';
import { TYPE_RULES } from './civTypes.js';

export const MIGRATION = Object.freeze({
  /**
   * Movement points of buildReach's default walk (entering a hex costs its movement cost). Only
   * civ types with movePoints of their own (Nomadic) walk; everyone else moves one hex (buildStepReach).
   */
  movePoints: 3,
  /**
   * A hex is crowded when it holds more than this share of its food capacity in people. Food
   * regrows by half the capacity a year (LIFE.foodRegrowth), so a settled hex holds about half its
   * capacity: a share above that is only reached in a famine, and fed people never moved on.
   */
  crowdedShare: 0.5,
  /** Yearly chance a hungry person sets out. */
  hungryChance: 0.5,
  /** Yearly chance a fed person in a crowded hex sets out. */
  crowdedChance: 0.2,
  /** A hex in reach that already holds people of the mover's own civ counts its spare food this many times. */
  ownCivWeight: 2,
  /**
   * Where civs expand (see migrate): a hex's weight is also × materialWeight if it holds a deposit
   * of a material the civ's next level still needs; × avoidWeight next to a hostile civ it is not
   * stronger than, or × pushWeight next to hostile civs it is stronger than (only civs that start
   * fights push); and × (1 + contiguityPerHex × the land neighbours its civ already holds).
   */
  materialWeight: 3,
  avoidWeight: 0.25,
  pushWeight: 2,
  contiguityPerHex: 0.2,
});

/**
 * One-hex reach: for each land hex, its land neighbours in index order. With
 * boats (`boatRange` water hexes, 0 for none; `true` counts as 1), also the
 * land hexes next to water that can be sailed to from it across at most
 * boatRange water hexes in a row, never the hex itself. Same CSR shape as buildReach.
 */
export function buildStepReach(map, boatRange = 0) {
  const range = Number(boatRange) || 0;
  const { count, terrain, neighbours } = map;
  const offsets = new Int32Array(count + 1);
  const lists = [];
  const seen = new Uint8Array(count);
  // Water hexes sailed through from the current hex (breadth first, by depth).
  const sailed = new Uint8Array(count);
  let wave = [];
  let next = [];
  const visited = [];
  for (let h = 0; h < count; h++) {
    const out = [];
    if (terrain[h] !== DEEP_WATER) {
      for (let d = 0; d < 6; d++) {
        const v = neighbours[h * 6 + d];
        if (v < 0) continue;
        if (terrain[v] !== DEEP_WATER) { if (!seen[v]) { seen[v] = 1; out.push(v); } continue; }
        if (range > 0 && !sailed[v]) { sailed[v] = 1; visited.push(v); wave.push(v); }
      }
      for (let depth = 1; wave.length; depth++) {
        for (const w of wave) {
          for (let e = 0; e < 6; e++) {
            const u = neighbours[w * 6 + e];
            if (u < 0) continue;
            if (terrain[u] !== DEEP_WATER) { if (u !== h && !seen[u]) { seen[u] = 1; out.push(u); } }
            else if (depth < range && !sailed[u]) { sailed[u] = 1; visited.push(u); next.push(u); }
          }
        }
        [wave, next] = [next, wave];
        next.length = 0;
      }
      for (const v of visited) sailed[v] = 0;
      visited.length = 0;
      for (const v of out) seen[v] = 0;
      out.sort((a, b) => a - b);
    }
    lists.push(out);
    offsets[h + 1] = offsets[h] + out.length;
  }
  const targets = new Int32Array(offsets[count]);
  for (let h = 0; h < count; h++) targets.set(lists[h], offsets[h]);
  return { offsets, targets };
}

/**
 * The pieces of land a reach table connects: id[h] for each land hex (−1 for
 * water) and size[id], the land hexes in that piece. Built once per boat range.
 */
export function landPieces(map, reach) {
  const { count, terrain } = map;
  const id = new Int32Array(count).fill(-1);
  const size = [];
  const stack = [];
  for (let h = 0; h < count; h++) {
    if (terrain[h] === DEEP_WATER || id[h] >= 0) continue;
    const k = size.length;
    let n = 0;
    id[h] = k;
    stack.push(h);
    while (stack.length) {
      const u = stack.pop();
      n++;
      for (let j = reach.offsets[u]; j < reach.offsets[u + 1]; j++) {
        const v = reach.targets[j];
        if (id[v] < 0) { id[v] = k; stack.push(v); }
      }
    }
    size.push(n);
  }
  return { id, size };
}

/**
 * For each land hex, the land hexes reachable in one year (cheapest path cost
 * ≤ movePoints), excluding itself, in index order. Without boats a path never
 * enters water; with boats (`boatCost` > 0) a path may make one voyage of up to
 * `boatRange` sea or lake hexes in a row, each costing boatCost, and must step
 * back onto land to end.
 * Returned as offsets/targets (CSR): targets[offsets[h] … offsets[h + 1] − 1].
 */
export function buildReach(map, movePoints = MIGRATION.movePoints, boatCost = 0, boatRange = 1) {
  const { count, terrain, neighbours } = map;
  const lists = [];
  // State s = hex + count × phase: 0 not sailed yet, 1 … R at sea after that many
  // water hexes, R + 1 landed after the voyage (no second voyage).
  const R = boatCost ? Math.max(1, boatRange) : 0;
  const landed = R + 1;
  const cost = new Float64Array((R + 2) * count).fill(Infinity);
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
      const phase = (s - u) / count;
      for (let d = 0; d < 6; d++) {
        const v = neighbours[u * 6 + d];
        if (v < 0) continue;
        let t;
        let c;
        if (terrain[v] === DEEP_WATER) {
          // Only by boat, at most R water hexes, and only one voyage.
          if (!R || phase >= R) continue;
          t = v + (phase + 1) * count;
          c = cost[s] + boatCost;
        } else {
          t = v + (phase === 0 ? 0 : landed) * count;
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
    /** Per hex, the Kingdom enclosing it or −1 (set by the Simulation): no other civ may move in. */
    inside: null,
    /** Set by the Simulation each year (null: no expansion priorities): per civ, the materials its next level still needs (bitmask). */
    want: null,
    /** Per civ, bitmasks over civs: hostile[c] the civs threatening c, beats[c] the hostile civs c pushes towards. */
    hostile: new Uint32Array(n),
    beats: new Uint32Array(n),
    /** Scratch: civs with people in or next to each hex, and each hex's threat for each civ (−1 avoid, 0, +1 push). */
    near: new Uint32Array(map.count),
    threat: new Int8Array(map.count * n),
    /** Per civ, 1 when its fed movers only go where no other civ lives in or next to the hex (Isolationist), with their own cached sums. */
    keepApart: new Uint8Array(n),
    anyApart: false,
    totalApart: new Float64Array(map.count * n),
    cumApart: new Array(n),
    stampApart: new Int32Array(map.count * n),
  };
  // Reach tables by kind ('step', '5', 'stepr3b1', …), built as civs need them.
  rules.byPoints = new Map();
  rules.movePoints = new Int32Array(n);
  rules.boats = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    const t = TYPE_RULES[types[c]] ?? {};
    const factor = t.setOutFactor ?? 1;
    rules.hungryChance[c] = Math.min(1, MIGRATION.hungryChance * factor);
    rules.crowdedChance[c] = Math.min(1, MIGRATION.crowdedChance * factor);
    rules.keepApart[c] = t.fedKeepsApart ? 1 : 0;
    if (t.fedKeepsApart) rules.anyApart = true;
    rules.crowdedShare[c] = t.crowdedShare ?? MIGRATION.crowdedShare;
    // 0: one hex a year (buildStepReach).
    rules.movePoints[c] = t.movePoints ?? 0;
    setReach(rules, c, map, 0);
  }
  return rules;
}

/**
 * Give civ c the reach table for its movement points and boat range (water hexes
 * a voyage may cross, 0 for none; boatCost: movement points per water hex).
 * Tables are built once per kind and shared; only called when a civ's boats or
 * movement points change.
 */
export function setReach(rules, c, map, boatRange, boatCost = 1) {
  const range = Number(boatRange) || 0;
  const mp = rules.movePoints[c];
  const base = mp === 0 ? 'step' : `${mp}`;
  const key = range ? `${base}r${range}b${boatCost}` : base;
  if (!rules.byPoints.has(key)) rules.byPoints.set(key, mp === 0 ? buildStepReach(map, range) : buildReach(map, mp, range ? boatCost : 0, range));
  rules.boats[c] = range;
  rules.reach[c] = rules.byPoints.get(key);
  rules.cum[c] = new Float64Array(rules.reach[c].targets.length);
  rules.cumApart[c] = new Float64Array(rules.reach[c].targets.length);
}

/**
 * A hex's weight per unit of spare food for a mover of civ c (see MIGRATION):
 * own civ there, a needed material, threats, and land already held around it.
 */
function priority(map, held, base, t, c, n, wantMask, threat) {
  const M = MIGRATION;
  let w = held[base + t] ? M.ownCivWeight : 1;
  if (map.deposits[t] & wantMask) w *= M.materialWeight;
  if (threat < 0) w *= M.avoidWeight;
  else if (threat > 0) w *= M.pushWeight;
  let own = 0;
  for (let d = 0; d < 6; d++) {
    const v = map.neighbours[t * 6 + d];
    if (v >= 0 && held[base + v]) own++;
  }
  return w * (1 + M.contiguityPerHex * own);
}

/**
 * Threat of every hex for every civ, from who is where now (held): a hostile
 * civ with people in the hex or next to it makes it −1 (avoid) for a civ that
 * does not beat it, else +1 (push) when every hostile civ there is one it beats.
 */
function markThreats(map, held, rules, civs) {
  const n = map.count;
  const { near, threat, hostile, beats } = rules;
  near.fill(0);
  for (let c = 0; c < civs; c++) {
    const bit = 1 << c;
    const base = c * n;
    for (let h = 0; h < n; h++) {
      if (!held[base + h]) continue;
      near[h] |= bit;
      for (let d = 0; d < 6; d++) {
        const v = map.neighbours[h * 6 + d];
        if (v >= 0) near[v] |= bit;
      }
    }
  }
  for (let h = 0; h < n; h++) {
    const b = h * civs;
    const here = near[h];
    for (let c = 0; c < civs; c++) {
      const hs = here & hostile[c];
      threat[b + c] = hs === 0 ? 0 : (hs & ~beats[c]) !== 0 ? -1 : 1;
    }
  }
}

/** Scratch for callers that do not pass one (tests); the Simulation passes its own. */
let sharedHeld = new Uint8Array(0);

/**
 * Each hungry person (hunger > 0) sets out with hungryChance; each fed person
 * in a crowded hex with crowdedChance (both, the crowding share and the reach
 * per civ from `rules` when given, see migrationRules). A mover picks among reachable hexes
 * whose spare food is positive and above its own hex's, at random with weight
 * equal to that spare food, times ownCivWeight where its own civ already has
 * people (before anyone moves). A hex a Kingdom encloses (rules.inside) is
 * closed to every other civ. With no such hex it stays.
 * dest: scratch Int32Array at least people.high long. held: scratch
 * Uint8Array of (civ count × map.count); without it a shared one sized for any civ id is used.
 * round (optional, see calendar.js): { month, months, closed } — only people whose id
 * mod months is month may set out this time, and in winter (closed[terrain] = 1) nobody
 * leaves or enters a closed hex. Returns how many moved.
 */
export function migrate(people, map, reach, rng, pop, spare, dest, held = null, rules = null, round = null) {
  const n = map.count;
  if (!held) {
    if (sharedHeld.length < 256 * n) sharedHeld = new Uint8Array(256 * n);
    held = sharedHeld;
  }
  snapshot(people, map, pop, spare, held);
  const { alive, hex, hunger, civ, id } = people;
  const civs = rules ? rules.hungryChance.length : 0;
  const month = round ? round.month : -1;
  const months = round ? round.months : 1;
  const closed = round?.closed ?? null;
  const shut = (t) => closed !== null && closed[map.terrain[t]] === 1;
  if (rules) rules.gen++;
  const inside = rules?.inside ?? null;
  const want = rules?.want ?? null;
  const threat = rules?.threat ?? null;
  const near = rules?.near ?? null;
  if (want || rules?.anyApart) markThreats(map, held, rules, civs);
  for (let i = 0; i < people.high; i++) {
    dest[i] = -1;
    if (!alive[i]) continue;
    if (month >= 0 && id[i] % months !== month) continue;
    const h = hex[i];
    if (shut(h)) continue;
    const c = civ[i];
    let chance = 0;
    if (rules) {
      if (hunger[i] > 0) chance = rules.hungryChance[c];
      else if (pop[h] > crowdLine(map, h, rules.crowdedShare[c])) chance = rules.crowdedChance[c];
    } else if (hunger[i] > 0) chance = MIGRATION.hungryChance;
    else if (pop[h] > crowdLine(map, h, MIGRATION.crowdedShare)) chance = MIGRATION.crowdedChance;
    if (chance === 0 || rng.next() >= chance) continue;
    const { offsets, targets } = rules ? rules.reach[c] : reach;
    const own = spare[h];
    const base = c * n;
    if (rules) {
      // Same choice as the scan below: the first target whose running weight passes r.
      // A fed Isolationist only goes where no other civ lives in or next to the hex (its own cached sums).
      const apart = rules.keepApart[c] === 1 && hunger[i] === 0;
      const others = ~(1 << c);
      const key = h * civs + c;
      const cum = apart ? rules.cumApart[c] : rules.cum[c];
      const stamp = apart ? rules.stampApart : rules.stamp;
      const totals = apart ? rules.totalApart : rules.total;
      if (stamp[key] !== rules.gen) {
        let total = 0;
        for (let k = offsets[h]; k < offsets[h + 1]; k++) {
          const t = targets[k];
          const s = spare[t];
          if (s > 0 && s > own && !(inside && inside[t] >= 0 && inside[t] !== c) && !shut(t) && !(apart && (near[t] & others) !== 0)) {
            total += want ? s * priority(map, held, base, t, c, n, want[c], threat[t * civs + c]) : (held[base + t] ? s * MIGRATION.ownCivWeight : s);
          }
          cum[k] = total;
        }
        stamp[key] = rules.gen;
        totals[key] = total;
      }
      const total = totals[key];
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
      if (s > 0 && s > own && !shut(t)) total += held[base + t] ? s * MIGRATION.ownCivWeight : s;
    }
    if (total <= 0) continue;
    let r = rng.next() * total;
    for (let k = offsets[h]; k < offsets[h + 1]; k++) {
      const t = targets[k];
      const s = spare[t];
      if (!(s > 0 && s > own) || shut(t)) continue;
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
