#!/usr/bin/env node
// Run the simulation without a browser.
//
//   node tools/headless.js [--seed s] [--ticks n] [--size n] [--water f] [--mountains f]
//                          [--rivers n] [--plains f] [--forest f] [--desert f] [--tundra f]
//                          [--preset name] [--every n] [--min-tps n] [--json]
//
// Prints the map summary, the map hash, the final state hash and ticks per second.
// --min-tps makes it exit non-zero if throughput is below the floor (used in CI).

import { Simulation } from '../src/sim/simulation.js';
import { DEFAULT_PARAMS, presetParams } from '../src/sim/params.js';
import { TERRAIN_NAMES } from '../src/sim/terrain.js';

function parseArgs(argv) {
  const args = {};
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[k + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; k++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const params = { ...(args.preset ? presetParams(args.preset) : DEFAULT_PARAMS) };
if (args.seed) params.seed = String(args.seed);
for (const key of ['size', 'water', 'mountains', 'rivers', 'plains', 'forest', 'desert', 'tundra']) if (args[key] !== undefined) params[key] = Number(args[key]);
const ticks = Number(args.ticks ?? 1000);
const every = Number(args.every ?? 0);

const g0 = performance.now();
const sim = new Simulation(params);
const genMs = performance.now() - g0;

const t0 = performance.now();
let ran = 0;
while (ran < ticks && !sim.finished) {
  const chunk = every > 0 ? Math.min(every, ticks - ran) : ticks - ran;
  ran += sim.tick(chunk);
  if (every > 0 && !args.json) console.log(`year ${sim.tickCount}: hash ${sim.hash()}`);
}
const ms = performance.now() - t0;
const tps = ran / (Math.max(ms, 0.001) / 1000);

const stats = sim.stats();
const p = sim.params;
const terrain = Object.fromEntries(TERRAIN_NAMES.map((name, t) => [name, stats.terrainCounts[t]]));
const rivers = sim.map.river.reduce((s, v) => s + v, 0);
const result = {
  seed: p.seed,
  size: `${p.size}x${p.size}`,
  water: p.water,
  mountains: p.mountains,
  rivers: p.rivers,
  lowland: { plains: p.plains, forest: p.forest, desert: p.desert, tundra: p.tundra },
  ticks: sim.tickCount,
  mapHash: sim.mapHash(),
  hash: sim.hash(),
  generateMs: +genMs.toFixed(2),
  ticksPerSecond: Math.round(tps),
  terrain,
  riverHexes: rivers,
  finished: stats.finished,
  endReason: stats.endReason,
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`seed "${result.seed}"  ${result.size} hexes  water ${p.water}  mountains ${p.mountains}  rivers ${p.rivers}  `
    + `lowland ${p.plains}/${p.forest}/${p.desert}/${p.tundra}  ${result.ticks} years`);
  console.log(`  ${Object.entries(terrain).map(([k, v]) => `${k} ${v}`).join(', ')}; ${rivers} river hexes`);
  if (stats.finished) console.log(`  ended: ${stats.endReason}`);
  console.log(`map ${result.mapHash}  hash ${result.hash}  generated in ${result.generateMs} ms  ${result.ticksPerSecond} ticks/s`);
}

const bad = [];
if (stats.terrainCounts.reduce((s, v) => s + v, 0) !== p.size * p.size) bad.push('terrain counts do not add up to the map size');
if (args['min-tps'] && tps < Number(args['min-tps'])) bad.push(`throughput ${Math.round(tps)} ticks/s is below the floor ${args['min-tps']}`);
if (bad.length) {
  console.error(`FAIL: ${bad.join('; ')}`);
  process.exit(1);
}
