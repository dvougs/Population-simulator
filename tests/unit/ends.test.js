// RULES.md "End of the game" (T-026, T-027): end conditions, dominance, End now, Keep watching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/sim/simulation.js';
import { LocalSimHost } from '../../src/host/simHost.js';

/** A simulation where we set the per-civ numbers checkEnd reads, then run one check. */
function setYear(sim, pop, hexes) {
  pop.forEach((v, c) => { sim.civPop[c] = v; });
  hexes.forEach((v, c) => { sim.civHexes[c] = v; });
  sim.checkEnd();
}

test('RULES.md "End of the game": Sandbox (none ticked) never ends while someone lives', () => {
  const sim = new Simulation({ seed: 'sand', endConditions: [], endTicks: 10 });
  assert.equal(sim.tick(200), 200);
  assert.equal(sim.finished, false);
  assert.equal(sim.endKind, null);
});

test('year limit: ends exactly in that year with no winner, "Reached year 25"', () => {
  const sim = new Simulation({ seed: 'end', endConditions: ['years'], endTicks: 25 });
  assert.equal(sim.tick(24), 24);
  assert.equal(sim.finished, false);
  assert.equal(sim.tick(100), 1);
  assert.equal(sim.tickCount, 25);
  assert.equal(sim.finished, true);
  assert.equal(sim.endKind, 'years');
  assert.equal(sim.winner, null);
  assert.equal(sim.endReason, 'Reached year 25');
  assert.equal(sim.tick(10), 0);
});

test('year limit below 10 is clamped to 10; endTicks is ignored unless "years" is ticked', () => {
  const low = new Simulation({ seed: 'end', endConditions: ['years'], endTicks: 3 });
  assert.equal(low.tick(100), 10);
  const off = new Simulation({ seed: 'end', endConditions: ['lastCiv'], endTicks: 10 });
  assert.equal(off.tick(50), 50);
});

test('total extinction always ends the run, even in Sandbox, with no winner', () => {
  for (const endConditions of [[], ['years'], ['lastCiv', 'dominance', 'years']]) {
    const sim = new Simulation({ seed: 'dead', endConditions, endTicks: 1000, civCount: 2 });
    for (let i = 0; i < sim.people.high; i++) if (sim.people.alive[i]) sim.people.remove(i);
    assert.equal(sim.tick(5), 1, endConditions.join());
    assert.equal(sim.endKind, 'extinction');
    assert.equal(sim.winner, null);
    assert.equal(sim.endReason, 'Every civ died out');
  }
});

test('last civ standing: fires when only one of 2+ civs has people; that civ wins', () => {
  const sim = new Simulation({ seed: 'lc', endConditions: ['lastCiv'], civCount: 3 });
  setYear(sim, [5, 5, 0], [1, 1, 0]);
  assert.equal(sim.finished, false, 'two left');
  setYear(sim, [0, 7, 0], [0, 1, 0]);
  assert.equal(sim.finished, true);
  assert.equal(sim.endKind, 'lastCiv');
  assert.equal(sim.winner, 1);
  assert.equal(sim.endReason, 'Last civ standing: Assyrians');
});

test('last civ standing never fires with a single civ; extinction still does', () => {
  const sim = new Simulation({ seed: 'one', endConditions: ['lastCiv'], civCount: 1 });
  assert.equal(sim.tick(100), 100);
  assert.equal(sim.finished, false);
  setYear(sim, [0], [0]);
  assert.equal(sim.endKind, 'extinction');
});

test('last civ standing on a seeded run needs a ticked box', () => {
  const a = new Simulation({ seed: 'foo', endConditions: [], civCount: 2 });
  const b = new Simulation({ seed: 'foo', endConditions: ['lastCiv'], civCount: 2 });
  a.tick(300); b.tick(300);
  assert.equal(a.hash(), b.hash(), 'a ticked box alone does not change the sim');
});

test('dominance: share boundary (hexes × 100 ≥ share × land hexes) and streak length', () => {
  const sim = new Simulation({ seed: 'dom', endConditions: ['dominance'], dominanceShare: 0.6, dominanceYears: 10, civCount: 2 });
  const land = sim.landHexes;
  const need = Math.ceil(0.6 * land);
  assert.ok(need > 0 && need < land);
  for (let y = 0; y < 100; y++) setYear(sim, [5, 5], [need - 1, 0]);
  assert.equal(sim.finished, false, 'just under the share never counts');
  assert.equal(sim.dominanceStreak[0], 0);
  for (let y = 0; y < 9; y++) setYear(sim, [5, 5], [need, 0]);
  assert.equal(sim.finished, false, '9 years is not 10');
  assert.equal(sim.dominanceStreak[0], 9);
  setYear(sim, [5, 5], [need, 0]);
  assert.equal(sim.finished, true, 'the 10th year ends it');
  assert.equal(sim.endKind, 'dominance');
  assert.equal(sim.winner, 0);
  assert.equal(sim.endReason, 'Romans held 60% of the land for 10 years');
});

test('dominance: a year below the share resets the streak to 0', () => {
  const sim = new Simulation({ seed: 'dom', endConditions: ['dominance'], dominanceShare: 0.5, dominanceYears: 10, civCount: 2 });
  const need = Math.ceil(0.5 * sim.landHexes);
  for (let y = 0; y < 9; y++) setYear(sim, [5, 5], [0, need]);
  setYear(sim, [5, 5], [0, need - 1]);
  assert.equal(sim.dominanceStreak[1], 0);
  for (let y = 0; y < 9; y++) setYear(sim, [5, 5], [0, need]);
  assert.equal(sim.finished, false);
  setYear(sim, [5, 5], [0, need]);
  assert.equal(sim.finished, true);
  assert.equal(sim.winner, 1);
});

test('dominance: a tie in the same year goes to the most hexes, then the lower civ number', () => {
  const mk = () => new Simulation({ seed: 'dom', endConditions: ['dominance'], dominanceShare: 0.25, dominanceYears: 10, civCount: 3 });
  const a = mk();
  const base = Math.ceil(0.25 * a.landHexes);
  for (let y = 0; y < 10; y++) setYear(a, [5, 5, 5], [base, base + 1, base]);
  assert.equal(a.winner, 1, 'most hexes');
  const b = mk();
  for (let y = 0; y < 10; y++) setYear(b, [5, 5, 5], [base, base, base]);
  assert.equal(b.winner, 0, 'lower civ number');
});

test('dominance only counts when ticked, and Sandbox streaks do not end the run', () => {
  const sim = new Simulation({ seed: 'dom', endConditions: ['years'], endTicks: 1000, dominanceYears: 10, dominanceShare: 0.25, civCount: 2 });
  for (let y = 0; y < 50; y++) setYear(sim, [5, 5], [sim.landHexes, 0]);
  assert.equal(sim.finished, false);
});

test('dominance on a seeded run (seed foo, 2 civs, 50% for 50 years) ends with a winner holding the share', () => {
  const sim = new Simulation({ seed: 'foo', endConditions: ['dominance'], dominanceShare: 0.5, dominanceYears: 50, civCount: 2 });
  sim.tick(1500);
  assert.equal(sim.endKind, 'dominance');
  assert.ok(sim.tickCount >= 50);
  assert.ok(sim.winner === 0 || sim.winner === 1);
  assert.ok(sim.civHexes[sim.winner] * 100 >= 50 * sim.landHexes);
  assert.equal(sim.dominanceStreak[sim.winner], 50);
  const again = new Simulation({ seed: 'foo', endConditions: ['dominance'], dominanceShare: 0.5, dominanceYears: 50, civCount: 2 });
  again.tick(1500);
  assert.equal(again.tickCount, sim.tickCount);
  assert.equal(again.hash(), sim.hash());
});

test('priority in one year: extinction, then last civ, then dominance, then year limit', () => {
  const all = ['lastCiv', 'dominance', 'years'];
  const mk = () => {
    const s = new Simulation({ seed: 'prio', endConditions: all, endTicks: 10, dominanceShare: 0.25, dominanceYears: 10, civCount: 2 });
    s.tickCount = 10;
    s.dominanceStreak[0] = 9;
    return s;
  };
  let s = mk(); setYear(s, [0, 0], [0, 0]);
  assert.equal(s.endKind, 'extinction');
  s = mk(); setYear(s, [5, 0], [s.landHexes, 0]);
  assert.equal(s.endKind, 'lastCiv');
  s = mk(); setYear(s, [5, 5], [s.landHexes, 0]);
  assert.equal(s.endKind, 'dominance');
  s = mk(); setYear(s, [5, 5], [0, 0]);
  assert.equal(s.endKind, 'years');
});

test('End now: ends with no winner, "Ended by the player"; a second call changes nothing', () => {
  const sim = new Simulation({ seed: 'now', endConditions: [] });
  sim.tick(5);
  sim.endNow();
  assert.equal(sim.finished, true);
  assert.equal(sim.endKind, 'player');
  assert.equal(sim.winner, null);
  assert.equal(sim.endReason, 'Ended by the player');
  assert.equal(sim.tick(5), 0);
  const done = new Simulation({ seed: 'now', endConditions: ['years'], endTicks: 10 });
  done.tick(10);
  done.endNow();
  assert.equal(done.endKind, 'years', 'no-op after the game has ended');
  assert.equal(done.endReason, 'Reached year 10');
});

test('Keep watching: carries on as a sandbox, even total extinction no longer ends it', () => {
  const sim = new Simulation({ seed: 'keep', endConditions: ['years'], endTicks: 10, civCount: 2 });
  sim.tick(10);
  assert.equal(sim.finished, true);
  sim.keepWatching();
  assert.equal(sim.finished, false);
  assert.equal(sim.endKind, null);
  assert.equal(sim.endReason, null);
  assert.equal(sim.tick(20), 20);
  assert.equal(sim.tickCount, 30);
  for (let i = 0; i < sim.people.high; i++) if (sim.people.alive[i]) sim.people.remove(i);
  assert.equal(sim.tick(3), 3, 'extinction does not end a sandbox');
  assert.equal(sim.finished, false);
  sim.endNow();
  assert.equal(sim.endKind, 'player', 'End now still works');
});

test('host: endNow, keepWatching and report go through the host', () => {
  const host = new LocalSimHost();
  host.start({ seed: 'h', endConditions: ['years'], endTicks: 12 });
  host.tick(100);
  const r = host.report();
  assert.equal(r.endKind, 'years');
  assert.equal(r.tick, 12);
  assert.deepEqual(r.endConditions, ['years']);
  host.keepWatching();
  assert.equal(host.finished, false);
  host.endNow();
  assert.equal(host.report().endKind, 'player');
  assert.equal(host.report().winnerName, null);
});


test('pinned state hash (re-pinned when traits, civ types, contact and levels shipped, for Kingdom borders and land-based minimums, and for one-hex moves and expansion priorities, when buildings and wonders shipped, for the 500-year balancing pass, when settlements shipped (the hash includes each hex store, building and tier), for rafts, boats and the +20% progress cap, when one tick became one day, for the 1000-year playtest fixes, for peace and trade, for historical peoples, and for war, battles and sieges; same run twice gives the same hash)', () => {

  const run = () => {
    const s = new Simulation({ seed: 'hashcheck', size: 15, civCount: 4 });
    s.tick(300);
    return [s.hash(), s.people.count];
  };
  assert.deepEqual(run(), run());
  assert.deepEqual(run(), ['ceeaae8b', 3322]);
});
