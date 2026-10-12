// The calendar (src/sim/calendar.js and the Simulation's day clock), against RULES.md "Time", "A year" and "Migration".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/sim/simulation.js';
import {
  DAYS_PER_YEAR, MONTH_DAYS, SEASON_DAYS, SEASON_NAMES, SEASON_REGROWTH, WINTER_YIELD, MOVE_DAY,
  seasonOf, monthOf, winterClosedMask,
} from '../../src/sim/calendar.js';
import { regrow, LIFE } from '../../src/sim/life.js';
import { migrate } from '../../src/sim/migration.js';
import { People } from '../../src/sim/people.js';
import { BASE_TPS, SPEEDS, STEP_DAYS } from '../../src/loop.js';
import { PLAINS, TUNDRA, MOUNTAIN, TERRAIN_COUNT, FOREST, DESERT } from '../../src/sim/terrain.js';

test('a year is 360 days: 12 months of 30, 4 seasons of 90', () => {
  assert.equal(DAYS_PER_YEAR, 360);
  assert.equal(MONTH_DAYS, 30);
  assert.equal(SEASON_DAYS, 90);
  assert.deepEqual(SEASON_NAMES, ['Spring', 'Summer', 'Autumn', 'Winter']);
  assert.deepEqual([0, 89, 90, 180, 269, 270, 359].map(seasonOf), [0, 0, 1, 2, 2, 3, 3]);
  assert.deepEqual([0, 29, 30, 359].map(monthOf), [0, 0, 1, 11]);
  assert.equal(MOVE_DAY, 15);
});

test('1× runs 2 days a second, a season in 45 s and a year in 3 minutes; speeds 1×, 5×, 20×, 100×, Max; Step is a month', () => {
  assert.equal(BASE_TPS, 2);
  assert.equal(DAYS_PER_YEAR / BASE_TPS, 180);
  assert.deepEqual(SPEEDS.map((s) => s.label), ['1×', '5×', '20×', '100×', 'Max']);
  assert.deepEqual(SPEEDS.map((s) => s.mult * BASE_TPS), [2, 10, 40, 200, Infinity]);
  assert.equal(STEP_DAYS, 30);
});

test('days and years: a year ends on its 360th day, and tick(n) runs n whole years', () => {
  const s = new Simulation({ seed: 'cal', size: 12, civCount: 2 });
  assert.equal(s.stats().day, -1);
  assert.equal(s.days(1), 1);
  assert.equal(s.tickCount, 1); // year 1 begins on the first day
  assert.equal(s.stats().season, 'Spring');
  s.days(DAYS_PER_YEAR - 1);
  assert.equal(s.stats().day, DAYS_PER_YEAR - 1);
  assert.equal(s.stats().season, 'Winter');
  assert.equal(s.tick(2), 2);
  assert.equal(s.dayCount, 3 * DAYS_PER_YEAR);
  assert.equal(s.tickCount, 3);
  // From mid-year, tick(1) finishes the year under way.
  s.days(100);
  s.tick(1);
  assert.equal(s.dayCount, 4 * DAYS_PER_YEAR);
});

test('the same days give the same state whatever the step sizes', () => {
  const a = new Simulation({ seed: 'steps', size: 12, civCount: 3 });
  const b = new Simulation({ seed: 'steps', size: 12, civCount: 3 });
  a.days(1000);
  for (let k = 0; k < 1000; k += 7) b.days(Math.min(7, 1000 - k));
  assert.equal(a.hash(), b.hash());
});

test('food regrows 30/35/25/10% of the year by season, nothing on tundra and mountains in winter', () => {
  assert.ok(Math.abs(SEASON_REGROWTH.reduce((x, y) => x + y, 0) - 1) < 1e-12);
  assert.deepEqual([...SEASON_REGROWTH], [0.3, 0.35, 0.25, 0.1]);
  const map = { count: 3, terrain: new Uint8Array([PLAINS, TUNDRA, MOUNTAIN]), food: new Float64Array(3), foodCap: new Float64Array([100, 100, 100]) };
  const closed = winterClosedMask(TERRAIN_COUNT);
  for (let k = 0; k < 4; k++) regrow(map, SEASON_REGROWTH[k], k === 3 ? closed : null);
  assert.ok(Math.abs(map.food[0] - 100 * LIFE.foodRegrowth) < 1e-9);
  assert.ok(Math.abs(map.food[1] - 100 * LIFE.foodRegrowth * 0.9) < 1e-9);
  assert.ok(Math.abs(map.food[2] - 100 * LIFE.foodRegrowth * 0.9) < 1e-9);
});

test('tundra and mountains close in winter; plains, forest and desert do not; gathering there × 0.75', () => {
  const m = winterClosedMask(TERRAIN_COUNT);
  assert.equal(m[TUNDRA], 1); assert.equal(m[MOUNTAIN], 1);
  assert.equal(m[PLAINS] + m[FOREST] + m[DESERT], 0);
  assert.equal(WINTER_YIELD, 0.75);
});

/** A line of 3 hexes: 0 and 2 next to 1; one hungry person in hex 1 always sets out. */
function line(terrain) {
  const map = {
    count: 3, terrain: new Uint8Array(terrain), food: new Float64Array([50, 0, 50]), foodCap: new Float64Array([100, 100, 100]),
    neighbours: new Int32Array(18).fill(-1), deposits: new Uint16Array(3),
  };
  map.neighbours[1 * 6] = 0; map.neighbours[1 * 6 + 1] = 2; map.neighbours[0] = 1; map.neighbours[2 * 6] = 1;
  const reach = { offsets: new Int32Array([0, 1, 3, 4]), targets: new Int32Array([1, 0, 2, 1]) };
  return { map, reach };
}
const rng = { next: () => 0 };

test('each month only the people whose id mod 12 is the month may set out', () => {
  const { map, reach } = line([PLAINS, PLAINS, PLAINS]);
  const people = new People(16);
  for (let k = 0; k < 12; k++) { const i = people.add(); people.hex[i] = 1; people.hunger[i] = 1; }
  const n = 3; const pop = new Int32Array(n); const spare = new Float64Array(n); const dest = new Int32Array(16);
  let moved = 0;
  for (let month = 0; month < 12; month++) {
    const before = Array.from(people.hex.slice(0, 12));
    moved += migrate(people, map, reach, rng, pop, spare, dest, null, null, { month, months: 12, closed: null });
    for (let i = 0; i < 12; i++) if (people.hex[i] !== before[i]) assert.equal(people.id[i] % 12, month);
  }
  assert.equal(moved, 12);
});

test('in winter nobody leaves or enters tundra or mountains', () => {
  const closed = winterClosedMask(TERRAIN_COUNT);
  const run = (terrain, round) => {
    const { map, reach } = line(terrain);
    const people = new People(4);
    const i = people.add(); people.hex[i] = 1; people.hunger[i] = 1;
    migrate(people, map, reach, rng, new Int32Array(3), new Float64Array(3), new Int32Array(4), null, null, round);
    return people.hex[i];
  };
  const winter = { month: -1, months: 1, closed };
  assert.equal(run([TUNDRA, PLAINS, MOUNTAIN], winter), 1); // destinations closed
  assert.equal(run([PLAINS, TUNDRA, PLAINS], winter), 1); // leaving closed
  assert.notEqual(run([PLAINS, TUNDRA, PLAINS], null), 1); // other seasons open
  assert.notEqual(run([TUNDRA, PLAINS, PLAINS], winter), 1); // plains still open
});
