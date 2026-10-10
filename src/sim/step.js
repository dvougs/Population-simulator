// One simulation tick (one year). Pure function of (world, civs, rng): no DOM, no clocks.
//
// Order: regrow + eat + demography per cell, then migration decisions, then
// migration applied, then bookkeeping. Migration is decided for every cell before
// any is applied, so cell iteration order never favours one civ over another.

import {
  WATER, FOOD_REGEN, MOVE_COST, HARSH, FOOD_NEED, MIN_CELL_POP, MIN_MIGRANT_GROUP,
  YOUTH_YEARS, ADULT_YEARS, ELDER_START,
  MORTALITY_YOUNG, MORTALITY_ADULT, STARVE_YOUNG, STARVE_ADULT, STARVE_ELDER,
} from './constants.js';
import { clearCell } from './world.js';

/** Extra food need on harsh terrain, softened by climate tolerance. */
function needMultiplier(civ, terrain) {
  return HARSH[terrain] ? 1 + (1 - civ.traits.climateTolerance) * 0.6 : 1;
}

/** People a cell can feed indefinitely for this civ. */
function carrying(world, civ, i) {
  return (world.capacity[i] * civ.traits.foodEfficiency) / (FOOD_NEED * needMultiplier(civ, world.terrain[i]));
}

export function step(world, civs, rng) {
  feedAndAge(world, civs);
  decideMigration(world, civs, rng);
  applyMigration(world, civs);
  bookkeeping(world, civs);
}

function feedAndAge(world, civs) {
  const { size, terrain, food, foodCap, owner, young, adult, elder } = world;

  for (let c = 1; c < civs.length; c++) {
    const civ = civs[c];
    civ.poolRate = civ.prevDeficit > 0 ? Math.min(1, civ.pool / civ.prevDeficit) : 0;
    civ.poolLeft = civ.pool;
    civ.nextPool = 0;
    civ.deficit = 0;
  }

  for (let i = 0; i < size; i++) {
    const t = terrain[i];
    food[i] += FOOD_REGEN[t] * (foodCap[i] - food[i]);
    const o = owner[i];
    if (o === 0) continue;

    const civ = civs[o];
    const tr = civ.traits;
    const pop = young[i] + adult[i] + elder[i];
    const need = (pop * FOOD_NEED * needMultiplier(civ, t)) / tr.foodEfficiency;

    let eaten = Math.min(food[i], need);
    food[i] -= eaten;
    const short = need - eaten;
    if (short > 0) {
      civ.deficit += short;
      const fromPool = Math.min(short * civ.poolRate, civ.poolLeft);
      civ.poolLeft -= fromPool;
      eaten += fromPool;
    } else if (civ.behaviour.shareFood > 0) {
      const spare = food[i] - foodCap[i] * 0.5;
      if (spare > 0) {
        const give = spare * civ.behaviour.shareFood * 0.2;
        food[i] -= give;
        civ.nextPool += give;
      }
    }

    const fed = need > 0 ? eaten / need : 1;
    const unfed = 1 - fed;
    const elderMortality = 1 / Math.max(3, tr.lifespan - ELDER_START);

    let y = young[i] * Math.max(0, 1 - MORTALITY_YOUNG - unfed * STARVE_YOUNG);
    let a = adult[i] * Math.max(0, 1 - MORTALITY_ADULT - unfed * STARVE_ADULT);
    let e = elder[i] * Math.max(0, 1 - elderMortality - unfed * STARVE_ELDER);

    // Births slow as a cell fills up, so cells settle near capacity instead of boom-and-bust.
    const crowd = pop / Math.max(0.01, carrying(world, civ, i));
    const crowdFactor = Math.min(1, Math.max(0, 1.5 - 0.5 * crowd));
    const births = a * tr.fertility * fed * crowdFactor;

    const grownUp = y / YOUTH_YEARS;
    const aged = a / ADULT_YEARS;
    young[i] = y - grownUp + births;
    adult[i] = a + grownUp - aged;
    elder[i] = e + aged;
  }
}

// Reused per call to avoid allocation in the hot loop.
const candTarget = new Int32Array(8);
const candWeight = new Float64Array(8);

function decideMigration(world, civs, rng) {
  const { size, terrain, food, foodCap, owner, young, adult, elder, neighbours,
    moveTarget, moveYoung, moveAdult, moveElder, claimSize, claimCiv } = world;
  moveTarget.fill(-1);
  claimSize.fill(0);
  claimCiv.fill(0);

  for (let i = 0; i < size; i++) {
    const o = owner[i];
    if (o === 0) continue;
    const pop = young[i] + adult[i] + elder[i];
    if (pop < MIN_MIGRANT_GROUP) continue;

    const civ = civs[o];
    const b = civ.behaviour;
    const k = carrying(world, civ, i);
    const pressure = pop / Math.max(0.01, k);

    let share;
    const depleted = b.nomadic && food[i] < foodCap[i] * 0.35;
    if (depleted) share = 1;
    else if (pressure > b.migrateThreshold) share = b.migrateShare * Math.min(1, (pressure - b.migrateThreshold) / b.migrateThreshold + 0.25);
    else continue;

    const group = pop * share;
    if (group < MIN_MIGRANT_GROUP) continue;

    const here = (k + 1) / (pop + 1);
    let n = 0;
    let total = 0;
    for (let s = 0; s < 8; s++) {
      const j = neighbours[i * 8 + s];
      if (j < 0) continue;
      const tj = terrain[j];
      if (tj === WATER) continue;
      const oj = owner[j];
      if (oj !== 0 && oj !== o) continue; // hard borders until conflict (Phase 4)
      const pj = young[j] + adult[j] + elder[j];
      let attract = (carrying(world, civ, j) + 1) / (pj + group + 1) / MOVE_COST[tj];
      if (oj === 0) attract *= b.unclaimedBias;
      if (!depleted && attract <= here) continue;
      candTarget[n] = j;
      candWeight[n] = attract;
      total += attract;
      n++;
    }
    if (n === 0) continue;

    let r = rng.next() * total;
    let pick = n - 1;
    for (let c = 0; c < n; c++) {
      r -= candWeight[c];
      if (r < 0) { pick = c; break; }
    }
    const j = candTarget[pick];
    moveTarget[i] = j;
    moveYoung[i] = young[i] * share;
    moveAdult[i] = adult[i] * share;
    moveElder[i] = elder[i] * share;
    if (owner[j] === 0 && group > claimSize[j]) {
      claimSize[j] = group;
      claimCiv[j] = o;
    }
  }
}

function applyMigration(world) {
  const { size, terrain, owner, young, adult, elder, moveTarget, moveYoung, moveAdult, moveElder, claimCiv } = world;
  for (let i = 0; i < size; i++) {
    const j = moveTarget[i];
    if (j < 0) continue;
    const o = owner[i];
    if (owner[j] === 0) {
      if (claimCiv[j] !== o) continue; // a bigger group from another civ got there first
      owner[j] = o;
    } else if (owner[j] !== o) {
      continue;
    }
    const survive = 1 - 0.05 * (MOVE_COST[terrain[j]] - 1);
    young[i] -= moveYoung[i];
    adult[i] -= moveAdult[i];
    elder[i] -= moveElder[i];
    young[j] += moveYoung[i] * survive;
    adult[j] += moveAdult[i] * survive;
    elder[j] += moveElder[i] * survive;
  }
}

function bookkeeping(world, civs) {
  for (let c = 1; c < civs.length; c++) {
    civs[c].pop = 0;
    civs[c].territory = 0;
  }
  const { size, owner, young, adult, elder } = world;
  for (let i = 0; i < size; i++) {
    const o = owner[i];
    if (o === 0) continue;
    const pop = young[i] + adult[i] + elder[i];
    if (pop < MIN_CELL_POP) {
      clearCell(world, i);
      continue;
    }
    civs[o].pop += pop;
    civs[o].territory++;
  }
  for (let c = 1; c < civs.length; c++) {
    const civ = civs[c];
    civ.pool = civ.pool * 0.5 + civ.nextPool;
    civ.prevDeficit = civ.deficit;
    if (civ.pop > civ.peakPop) civ.peakPop = civ.pop;
  }
}
