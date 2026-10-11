#!/usr/bin/env node
// Run the simulation without a browser.
//
//   node tools/headless.js [--seed s] [--ticks n] [--size n] [--water f] [--mountains f]
//                          [--rivers n] [--plains f] [--forest f] [--desert f] [--tundra f]
//                          [--civs n] [--start-pop n] [--preset name] [--every n] [--min-tps n] [--json]
//                          [--end lastCiv,dominance,years|sandbox] [--end-years n]
//                          [--dominance-share f] [--dominance-years n]
//
// Prints the map summary, per-civ population every --every years (with the state
// hash), per-civ totals (births, deaths by cause, lifespans, extinction year),
// the map hash, the final state hash and ticks per second. --json prints the
// same plus the recorded year-by-year history per civ.
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
if (args.civs !== undefined) params.civCount = Number(args.civs);
if (args['start-pop'] !== undefined) params.startPop = Number(args['start-pop']);
if (args.end !== undefined) params.endConditions = String(args.end).split(',');
if (args['end-years'] !== undefined) params.endTicks = Number(args['end-years']);
if (args['dominance-share'] !== undefined) params.dominanceShare = Number(args['dominance-share']);
if (args['dominance-years'] !== undefined) params.dominanceYears = Number(args['dominance-years']);
const ticks = Number(args.ticks ?? 1000);
const every = Number(args.every ?? 0);

const g0 = performance.now();
const sim = new Simulation(params);
const genMs = performance.now() - g0;

const civNames = sim.stats().civs.map((c) => c.name);
const pad = (v, n) => String(v).padStart(n);
const colW = Math.max(7, ...civNames.map((n) => n.length + 1));
const sample = () => {
  const st = sim.stats();
  return { year: st.tick, pop: st.civs.map((c) => c.pop), total: st.totalPop, hash: sim.hash() };
};
const samples = [];
const printSample = (s) => console.log(`${pad(s.year, 6)}${s.pop.map((v) => pad(v, colW)).join('')}${pad(s.total, 8)}  ${s.hash}`);
if (every > 0) {
  samples.push(sample());
  if (!args.json) {
    console.log(`${pad('year', 6)}${civNames.map((n) => pad(n, colW)).join('')}${pad('total', 8)}  hash`);
    printSample(samples[0]);
  }
}

// Sampling (stats and hashing) is kept out of the timed part.
let ms = 0;
let ran = 0;
while (ran < ticks && !sim.finished) {
  const chunk = every > 0 ? Math.min(every, ticks - ran) : ticks - ran;
  const t0 = performance.now();
  ran += sim.tick(chunk);
  ms += performance.now() - t0;
  if (every > 0) {
    samples.push(sample());
    if (!args.json) printSample(samples[samples.length - 1]);
  }
}
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
  endKind: stats.endKind,
  winner: stats.winner === null ? null : civNamesOf(stats.winner),
  endConditions: p.endConditions,
  civCount: p.civCount,
  startPop: p.startPop,
  population: stats.totalPop,
  civs: stats.civs.map((c, k) => {
    const h = sim.starts[k];
    return { ...c, start: h === undefined ? null : { col: h % sim.map.cols, row: Math.floor(h / sim.map.cols) } };
  }),
  extinctions: stats.civs.filter((c) => c.extinctYear !== null).map((c) => ({ civ: c.name, year: c.extinctYear })),
  samples,
  history: historyJson(sim.history(), civNames),
};

function civNamesOf(k) { return `Civ ${k + 1}`; }

/** Recorded history as plain arrays: one entry per row (one row per year unless the run outgrew the history). */
function historyJson(hist, names) {
  const fields = ['pop', 'hexes', 'births', 'deathsOldAge', 'deathsStarvation', 'lifespanSum'];
  return {
    yearsPerRow: hist.stride,
    years: Array.from(hist.years),
    civs: names.map((name, k) => Object.fromEntries([['name', name],
      ...fields.map((f) => [f, Array.from({ length: hist.rows }, (_, r) => hist[f][r * hist.civs + k])])])),
  };
}

if (args.json) {
  // Arrays of numbers on one line each, so the year-by-year history stays readable.
  console.log(JSON.stringify(result, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`));
} else {
  console.log(`seed "${result.seed}"  ${result.size} hexes  water ${p.water}  mountains ${p.mountains}  rivers ${p.rivers}  `
    + `lowland ${p.plains}/${p.forest}/${p.desert}/${p.tundra}  ${result.ticks} years`);
  console.log(`  ${Object.entries(terrain).map(([k, v]) => `${k} ${v}`).join(', ')}; ${rivers} river hexes`);
  console.log(`  ${p.civCount} ${p.civCount === 1 ? 'civ' : 'civs'}, ${p.startPop} people each; ${stats.totalPop} people alive at year ${stats.tick}`);
  for (const c of result.civs) {
    const deaths = c.deaths.oldAge + c.deaths.starvation;
    const where = c.start ? ` from (${c.start.col}, ${c.start.row})` : '';
    const fate = c.extinctYear !== null ? `EXTINCT in year ${c.extinctYear}` : `${c.pop} alive in ${c.hexes} ${c.hexes === 1 ? 'hex' : 'hexes'}`;
    console.log(`  ${c.name}${where}: ${fate}; peak ${c.peakPop} people, ${c.peakHexes} ${c.peakHexes === 1 ? 'hex' : 'hexes'}; ${c.births} births; `
      + `${deaths} deaths (old age ${c.deaths.oldAge}, starvation ${c.deaths.starvation}); `
      + `average lifespan ${c.avgLifespan ?? '-'}; oldest ${c.oldestAge}`);
  }
  console.log(result.extinctions.length
    ? `  extinctions: ${result.extinctions.map((e) => `${e.civ} in year ${e.year}`).join(', ')}`
    : '  extinctions: none');
  console.log(`  end conditions: ${p.endConditions.length ? p.endConditions.join(', ') : 'sandbox'}`);
  if (stats.finished) console.log(`  ended: ${stats.endReason}; winner: ${result.winner ?? 'none'}`);
  console.log(`map ${result.mapHash}  hash ${result.hash}  generated in ${result.generateMs} ms  ${result.ticksPerSecond} ticks/s`);
}

const bad = [];
if (stats.terrainCounts.reduce((s, v) => s + v, 0) !== p.size * p.size) bad.push('terrain counts do not add up to the map size');
if (args['min-tps'] && tps < Number(args['min-tps'])) bad.push(`throughput ${Math.round(tps)} ticks/s is below the floor ${args['min-tps']}`);
if (bad.length) {
  console.error(`FAIL: ${bad.join('; ')}`);
  process.exit(1);
}
