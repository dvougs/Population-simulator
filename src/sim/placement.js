// Starting positions for civs.

import { WATER } from './constants.js';

function dist2(world, a, b) {
  const dx = (a % world.width) - (b % world.width);
  const dy = Math.floor(a / world.width) - Math.floor(b / world.width);
  return dx * dx + dy * dy;
}

/** Cells good enough to start on: land that feeds at least a few people. */
function startCandidates(world) {
  const out = [];
  for (let i = 0; i < world.size; i++) {
    if (world.terrain[i] !== WATER && world.capacity[i] >= 20) out.push(i);
  }
  if (out.length === 0) {
    for (let i = 0; i < world.size; i++) if (world.terrain[i] !== WATER) out.push(i);
  }
  return out;
}

export function chooseStarts(world, count, placement, rng) {
  const candidates = startCandidates(world);
  if (candidates.length === 0) return [];
  const starts = [];
  const taken = new Set();
  const minGap2 = 9; // keep 3x3 start blocks from overlapping

  const free = (i) => !taken.has(i) && starts.every((s) => dist2(world, s, i) >= minGap2);

  if (placement === 'clustered') {
    const centre = rng.pick(candidates);
    const near = candidates
      .map((i) => [i, dist2(world, i, centre)])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [i] of near) {
      if (starts.length >= count) break;
      if (free(i)) { starts.push(i); taken.add(i); }
    }
  } else if (placement === 'random') {
    for (let tries = 0; starts.length < count && tries < count * 200; tries++) {
      const i = rng.pick(candidates);
      if (free(i)) { starts.push(i); taken.add(i); }
    }
  } else {
    // spread: best-candidate sampling, maximising the distance to existing starts.
    starts.push(rng.pick(candidates));
    taken.add(starts[0]);
    while (starts.length < count) {
      let best = -1, bestD = -1;
      for (let k = 0; k < 48; k++) {
        const i = rng.pick(candidates);
        if (taken.has(i)) continue;
        let d = Infinity;
        for (const s of starts) d = Math.min(d, dist2(world, s, i));
        if (d > bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      starts.push(best);
      taken.add(best);
    }
  }
  return starts;
}

/** Settle a civ on its start cell and the land around it. */
export function settle(world, civId, start, startPop) {
  const cells = [start];
  for (let k = 0; k < 8; k++) {
    const j = world.neighbours[start * 8 + k];
    if (j >= 0 && world.terrain[j] !== WATER && world.owner[j] === 0) cells.push(j);
  }
  const per = startPop / cells.length;
  for (const i of cells) {
    world.owner[i] = civId;
    world.young[i] = per * 0.35;
    world.adult[i] = per * 0.5;
    world.elder[i] = per * 0.15;
  }
  return cells.length;
}
