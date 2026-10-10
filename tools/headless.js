#!/usr/bin/env node
// Run the simulation without a browser.
//
//   node tools/headless.js [--seed s] [--ticks n] [--size n] [--civs a,b,c] [--preset name]
//                          [--every n] [--min-tps n] [--json]
//
// Prints per-civ results, the final state hash and ticks per second.
// --min-tps makes it exit non-zero if throughput is below the floor (used in CI).

import { Simulation } from '../src/sim/simulation.js';
import { DEFAULT_PARAMS, presetParams } from '../src/sim/params.js';

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
const params = structuredClone(args.preset ? presetParams(args.preset) : DEFAULT_PARAMS);
if (args.seed) params.seed = String(args.seed);
if (args.size) params.width = params.height = Number(args.size);
if (args.civs) params.civs = String(args.civs).split(',');
const ticks = Number(args.ticks ?? 1000);
const every = Number(args.every ?? 0);

const sim = new Simulation(params);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function table(stats) {
  return stats.civs
    .map((c) => `  ${c.name.padEnd(16)} pop ${fmt(c.pop).padStart(9)}  cells ${String(c.territory).padStart(5)}  peak ${fmt(c.peakPop).padStart(9)}${c.alive ? '' : `  extinct@${c.extinctAt}`}`)
    .join('\n');
}

const t0 = performance.now();
let ran = 0;
while (ran < ticks && !sim.finished) {
  const chunk = every > 0 ? Math.min(every, ticks - ran) : ticks - ran;
  ran += sim.tick(chunk);
  if (every > 0 && !args.json) console.log(`year ${sim.tickCount}: total ${fmt(sim.stats().totalPop)}\n${table(sim.stats())}`);
}
const ms = performance.now() - t0;
const tps = ran / (ms / 1000);

const stats = sim.stats();
const result = {
  seed: sim.params.seed,
  size: `${sim.params.width}x${sim.params.height}`,
  ticks: sim.tickCount,
  hash: sim.hash(),
  ticksPerSecond: Math.round(tps),
  msPerTick: +(ms / Math.max(1, ran)).toFixed(3),
  totalPop: Math.round(stats.totalPop),
  finished: stats.finished,
  endReason: stats.endReason,
  civs: stats.civs.map((c) => ({ name: c.name, pop: Math.round(c.pop), territory: c.territory, extinctAt: c.extinctAt })),
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`seed "${result.seed}"  ${result.size}  ${sim.params.civs.length} civs  ${result.ticks} years`);
  console.log(table(stats));
  console.log(`total pop ${fmt(stats.totalPop)}${stats.finished ? `  (ended: ${stats.endReason})` : ''}`);
  console.log(`hash ${result.hash}  ${result.ticksPerSecond} ticks/s  ${result.msPerTick} ms/tick`);
}

const bad = [];
if (!Number.isFinite(stats.totalPop)) bad.push('total population is not finite');
if (args['min-tps'] && tps < Number(args['min-tps'])) bad.push(`throughput ${Math.round(tps)} ticks/s is below the floor ${args['min-tps']}`);
if (bad.length) {
  console.error(`FAIL: ${bad.join('; ')}`);
  process.exit(1);
}
