// RULES.md "Settlements" (holder, size, capital, store caps, buildings, choosing, building, supply routes) and the
// rules that read it: "A year" (Births room), "Migration" (crowding), "War" (settlement walls), "Gathering and
// levels" (industry yields, civic progress, the capital's store pays), on hand-built hexes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Settlements, TIERS, TIER_NAMES, SETTLE, HAND, SETTLEMENT_BUILDINGS, SB_INDEX, SB_COUNT, PLAN,
  MAX_PROGRESS_BONUS, CIVIC_COUNTED, CAMP, VILLAGE, TOWN, CITY, METROPOLIS, MEGAPOLIS, tierFor, settlementName,
} from '../../src/sim/settlements.js';
import { Levels } from '../../src/sim/levels.js';
import { room, crowdLine } from '../../src/sim/life.js';
import { births } from '../../src/sim/life.js';
import { buildReach, migrate } from '../../src/sim/migration.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { MATERIAL_COUNT, MATERIAL_IDS, WOOD, STONE, CLAY, COPPER, IRON, SALT, GOLD, GEMSTONES, SPICES } from '../../src/sim/materials.js';
import { PLAINS, FOREST, COAST, DEEP_WATER } from '../../src/sim/terrain.js';
import { COOPERATION, STRENGTH, AGGRESSION } from '../../src/sim/traits.js';
import { makeMap, scratch, addAdults } from './helpers.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const near = (got, want, eps = 1e-9, msg = '') => assert.ok(Math.abs(got - want) <= eps, `${msg} ${got} vs ${want}`);
const B = (id) => SB_INDEX[id];

/** Rows of the first table after a heading in RULES.md. */
function table(heading) {
  const start = RULES.indexOf(heading);
  assert.ok(start >= 0, heading);
  const lines = RULES.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let k = first + 2; k < lines.length && lines[k].startsWith('|'); k++) rows.push(lines[k].split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}
const parseMaterials = (text) => {
  const out = new Array(MATERIAL_COUNT).fill(0);
  for (const part of text.split(',')) {
    const [n, name] = part.trim().split(' ');
    out[MATERIAL_IDS.indexOf(name)] = Number(n);
  }
  return out;
};

// ---- a Settlements world driven by hand -----------------------------------------------------------------------------

/**
 * types: civ types. w.put(hex, civ, n) sets the end-of-last-year counts; w.upd() is one yearly update; w.store(hex, { wood: 50 })
 * puts materials in a hex's store. Row 4 (hexes 40 to 49) is a straight line of neighbours.
 */
function mk(types = ['expansionist'], { size = 10, terrain = () => PLAINS } = {}) {
  const map = makeMap(size, size, terrain);
  const st = new Settlements(map, types, 'seed');
  const civs = types.length;
  const w = {
    map, st, civs, year: 0, ev: [],
    cnt: new Int32Array(map.count * civs),
    fw: new Int8Array(map.count).fill(-1),
    level: new Uint8Array(civs).fill(1),
  };
  w.put = (h, c, n) => { w.cnt[h * civs + c] = n; return w; };
  w.upd = (n = 1) => {
    for (let k = 0; k < n; k++) {
      w.year++;
      st.update(w.cnt, w.fw, w.level, w.year, (...a) => w.ev.push(a));
    }
    return w;
  };
  w.store = (h, mats) => { for (const [id, v] of Object.entries(mats)) st.store[h * MATERIAL_COUNT + MATERIAL_IDS.indexOf(id)] = v; return w; };
  w.stock = (h, id) => st.store[h * MATERIAL_COUNT + MATERIAL_IDS.indexOf(id)];
  w.build = (h, id) => { st.built[h] |= 1 << B(id); st.setIndustry(h); return w; };
  w.target = new Float64Array(civs * MATERIAL_COUNT);
  w.carry = () => { w.year++; st.carry(map, w.target, w.year); return w; };
  return w;
}
/** The year (from 1) in which hex h decides what to build: hex index + year is a multiple of 5. */
const planYear = (h, from = 1) => { let y = from; while ((h + y) % SETTLE.planEvery !== 0) y++; return y; };

// ---- the numbers -----------------------------------------------------------------------------------------------------

test('RULES.md "Settlements" size table: people, holder level, housing, slots, store cap, food bonus and reach per tier equal the code', () => {
  const rows = table('| Tier | People |');
  assert.equal(rows.length, 6);
  rows.forEach((r, t) => {
    assert.equal(TIER_NAMES[t], r[0]);
    assert.equal(TIERS[t].people, Number(r[1]), `${r[0]} people`);
    assert.equal(TIERS[t].level, Number(r[2]), `${r[0]} level`);
    assert.equal(TIERS[t].housing, Number(r[3]), `${r[0]} housing`);
    assert.equal(TIERS[t].slots, Number(r[4]), `${r[0]} slots`);
    assert.equal(TIERS[t].store, Number(r[5]), `${r[0]} store`);
    near(TIERS[t].food, Number(r[6].replace('+', '').replace('%', '')) / 100, 1e-12);
    assert.equal(TIERS[t].reach, Number(r[7]), `${r[0]} reach`);
  });
  assert.deepEqual([CAMP, VILLAGE, TOWN, CITY, METROPOLIS, MEGAPOLIS], [0, 1, 2, 3, 4, 5]);
});

test('RULES.md "Settlement buildings" table: kind, tier, level, materials and years equal the code; 19 buildings', () => {
  const rows = table('| Building | Kind |');
  assert.equal(rows.length, 19);
  assert.equal(SB_COUNT, 19);
  rows.forEach((r, k) => {
    const b = SETTLEMENT_BUILDINGS[k];
    assert.equal(b.name, r[0]);
    assert.equal(b.kind, r[1], r[0]);
    assert.equal(TIER_NAMES[b.tier], r[2], `${r[0]} tier`);
    assert.equal(b.level, Number(r[3]), `${r[0]} level`);
    assert.deepEqual([...b.cost], parseMaterials(r[5]), `${r[0]} cost`);
    assert.equal(b.years, Number(r[6]), `${r[0]} years`);
  });
});

test('RULES.md "Settlements" numbers: hysteresis, looting, ruins, shrinking, decay, capital, carrying, spoilage, planning', () => {
  assert.equal(SETTLE.takeOver, 1.25);
  assert.equal(SETTLE.looted, 0.5);
  assert.equal(SETTLE.ruinYears, 30);
  assert.equal(SETTLE.shrinkYears, 20);
  assert.equal(SETTLE.shrinkShare, 0.85);
  assert.equal(SETTLE.overCapDecay, 0.2);
  assert.equal(SETTLE.capitalSwitch, 1.5);
  assert.equal(SETTLE.capitalStore, 1.5);
  assert.equal(SETTLE.capitalNeed, 1.1);
  assert.equal(SETTLE.carryPerPerson, 0.5);
  assert.equal(SETTLE.carryGatherCost, 0.25);
  assert.equal(SETTLE.askHungry, 0.1);
  assert.equal(SETTLE.minLoad, 5);
  assert.equal(SETTLE.spoilPerStep, 0.04);
  assert.equal(SETTLE.foodSteps, 12);
  assert.equal(SETTLE.enclaveGather, 0.5);
  assert.equal(SETTLE.enclaveBonus, 0.5);
  assert.equal(SETTLE.foodKeep, 1.1);
  assert.equal(SETTLE.importSmooth, 0.2);
  assert.equal(SETTLE.planEvery, 5);
  assert.equal(SETTLE.planYears, 40);
  assert.equal(SETTLE.blockYears, 25);
  assert.equal(MAX_PROGRESS_BONUS, 0.2);
  assert.equal(CIVIC_COUNTED, 5);
  assert.deepEqual({ ...HAND.yield }, { common: 0.5, uncommon: 0.25, exotic: 0.0625 });
  assert.deepEqual({ ...HAND.cap }, { common: 10, uncommon: 5, exotic: 1.25 });
  assert.equal(PLAN.housingFull, 0.9);
  assert.equal(PLAN.hungryShare, 0.1);
  assert.deepEqual({ ...PLAN.scores }, { industryWanted: 4, housing: 3, food: 3, warehouse: 2, market: 2, defence: 2, industry: 1, civic: 1 });
  assert.deepEqual({ ...PLAN.rarity }, { common: 0, uncommon: 0.25, exotic: 0.5 });
  assert.equal(PLAN.marketCarried, 10);
  assert.equal(PLAN.nomadicMin, 2);
});

test('settlementName: made from the seed and the hex alone, the same every time', () => {
  assert.equal(settlementName('abc', 12), settlementName('abc', 12));
  assert.notEqual(settlementName('abc', 12), settlementName('abc', 13));
  assert.match(settlementName('abc', 12), /^[A-Z][a-z]+$/);
  const w = mk();
  assert.equal(w.st.describeBrief(12).name, settlementName('seed', 12));
});

// ---- tiers -----------------------------------------------------------------------------------------------------------

test('RULES.md "Settlements" size: tiers by people (1, 12, 30, 60, 100, 160), up to what the holder\'s level allows', () => {
  // Level 5 allows everything: the people thresholds alone.
  const at = (p) => tierFor(p, 5);
  assert.deepEqual([0, 1, 11, 12, 29, 30, 59, 60, 99, 100, 159, 160, 5000].map(at), [-1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  // The level cap: camp and village at 1, town at 2, city at 3, metropolis at 4, megapolis at 5.
  assert.deepEqual([1, 2, 3, 4, 5].map((lv) => tierFor(1000, lv)), [1, 2, 3, 4, 5]);
  assert.equal(tierFor(30, 1), 1, '30 people at level 1: a village, not a town');
  assert.equal(tierFor(30, 2), 2);
  assert.equal(tierFor(160, 4), 4);
});

test('RULES.md "Settlements" size: a settlement grows at once, and drops at once to the biggest tier the level allows', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 160);
  w.upd();
  assert.equal(w.st.tier[45], VILLAGE, 'level 1');
  w.level[0] = 2; w.upd();
  assert.equal(w.st.tier[45], TOWN);
  w.level[0] = 5; w.upd();
  assert.equal(w.st.tier[45], MEGAPOLIS, 'at once, all the way');
  w.level[0] = 3; w.upd();
  assert.equal(w.st.tier[45], CITY, 'a lower level cuts it at once');
  w.level[0] = 1; w.upd();
  assert.equal(w.st.tier[45], VILLAGE);
  // One person is a camp; nobody is no settlement.
  w.put(46, 0, 1).upd();
  assert.equal(w.st.tier[46], CAMP);
  assert.equal(w.st.tier[47], -1);
  assert.equal(w.st.holder[47], -1);
});

test('RULES.md "Settlements" size: shrinks one tier after 20 years in a row below 85% of its tier\'s people (10 of 12 is below, 11 is not)', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 12).upd();
  assert.equal(w.st.tier[45], VILLAGE);
  w.put(45, 0, 10).upd(19);
  assert.equal(w.st.tier[45], VILLAGE, '19 years below 10.2');
  w.put(45, 0, 11).upd();
  assert.equal(w.st.tier[45], VILLAGE);
  assert.equal(w.st.below[45], 0, '11 is not below 85% of 12: the count starts again');
  w.put(45, 0, 10).upd(19);
  assert.equal(w.st.tier[45], VILLAGE, 'only 19 again');
  w.upd();
  assert.equal(w.st.tier[45], CAMP, 'the 20th year in a row');
  // A town (30): 25 is below 25.5, 26 is not.
  const t = mk(['expansionist']);
  t.level[0] = 2;
  t.put(45, 0, 30).upd();
  assert.equal(t.st.tier[45], TOWN);
  t.put(45, 0, 26).upd(40);
  assert.equal(t.st.tier[45], TOWN, '26 never shrinks it');
  t.put(45, 0, 25).upd(20);
  assert.equal(t.st.tier[45], VILLAGE);
});

test('RULES.md "Settlements" size: people of every civ in the hex decide the tier', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 8).put(45, 1, 4).upd();
  assert.equal(w.st.tier[45], VILLAGE, '8 + 4 = 12');
  assert.equal(w.st.holder[45], 0);
  assert.equal(w.st.pop[45], 12);
});

// ---- holder ----------------------------------------------------------------------------------------------------------

test('RULES.md "Holder": the civ with the most people takes an empty hex (a tie: the lower civ number)', () => {
  const w = mk(['expansionist', 'aggressive', 'cooperative']);
  w.put(45, 1, 5).put(45, 2, 9).put(46, 1, 4).put(46, 2, 4).upd();
  assert.equal(w.st.holder[45], 2);
  assert.equal(w.st.holder[46], 1);
});

test('RULES.md "Holder": a holder keeps its hex unless another civ has at least 1.25 times its people', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 8).upd();
  assert.equal(w.st.holder[45], 0);
  w.put(45, 1, 9).upd(); // 9 < 10
  assert.equal(w.st.holder[45], 0, '9 against 8: not 1.25 times');
  w.put(45, 1, 10).upd(); // 10 = 1.25 × 8
  assert.equal(w.st.holder[45], 1, 'exactly 1.25 times takes it');
  // And the new holder is protected the same way: civ 0 needs 12.5 against 10.
  w.put(45, 0, 12).upd();
  assert.equal(w.st.holder[45], 1);
  w.put(45, 0, 13).upd();
  assert.equal(w.st.holder[45], 0);
});

test('RULES.md "Holder": a holder with people there keeps the hex while the bigger civ is under 1.25 times, even with fewer people', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 20).upd();
  w.put(45, 0, 8).put(45, 1, 9).upd(); // 9 against 8: bigger, but under 1.25 ×
  assert.equal(w.st.holder[45], 0);
  w.put(45, 0, 0).upd(); // the holder has left
  assert.equal(w.st.holder[45], 1);
});

test('RULES.md "Holder": the civ that won a fight there last year takes the hex if it still has people there', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 30).put(45, 1, 5).upd();
  assert.equal(w.st.holder[45], 0);
  w.fw[45] = 1;
  w.upd();
  assert.equal(w.st.holder[45], 1, 'the winner takes it although it has far fewer people');
  // A winner with nobody left there takes nothing.
  const v = mk(['expansionist', 'aggressive']);
  v.put(45, 0, 30).upd();
  v.fw[45] = 1;
  v.upd();
  assert.equal(v.st.holder[45], 0);
});

test('RULES.md "Holder": a hex that changes hands loses its planned building; 50% of its store goes to the new holder\'s capital, 50% stays; standing buildings stay', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 8).put(47, 1, 40).upd(); // civ 1's capital is 47
  assert.equal(w.st.capital[1], 47);
  w.store(45, { wood: 100, stone: 41 }).build(45, 'huts');
  w.st.plan[45] = B('palisade'); w.st.started[45] = 1; w.st.work[45] = 3;
  const before = [w.stock(47, 'wood'), w.stock(47, 'stone')];
  w.put(45, 1, 10).upd();
  assert.equal(w.st.holder[45], 1);
  near(w.stock(45, 'wood'), 50, 1e-9, 'half stays in the hex');
  near(w.stock(45, 'stone'), 20.5);
  near(w.stock(47, 'wood') - before[0], 50, 1e-9, 'half reaches the new holder\'s capital');
  near(w.stock(47, 'stone') - before[1], 20.5);
  near(w.st.looted[1], 70.5, 1e-9, 'tracked in looted[civ]');
  assert.equal(w.st.looted[0], 0);
  assert.equal(w.st.plan[45], -1);
  assert.equal(w.st.started[45], 0);
  assert.equal(w.st.work[45], 0);
  assert.ok(w.st.has(45, B('huts')), 'standing buildings stay');
  // Not looted when the holder simply stays.
  const v = mk(['expansionist']);
  v.put(45, 0, 8).upd();
  v.store(45, { wood: 50 }).upd(3);
  near(v.stock(45, 'wood'), 50);
  assert.equal(v.st.looted[0], 0);
});

test('RULES.md "Holder": the loot fills the capital only up to its store cap; the rest is lost', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 8).put(47, 1, 40).upd();
  const cap = w.st.storeCap[47];
  w.store(47, { wood: cap - 10 }).store(45, { wood: 100 });
  w.put(45, 1, 10).upd();
  assert.equal(w.st.holder[45], 1);
  near(w.stock(47, 'wood'), cap, 1e-9, 'filled to the cap');
  near(w.st.looted[1], 10, 1e-9, 'only what fitted counts');
  near(w.stock(45, 'wood'), 50);
  // A full capital takes nothing.
  const v = mk(['expansionist', 'aggressive']);
  v.put(45, 0, 8).put(47, 1, 40).upd();
  v.store(47, { wood: v.st.storeCap[47] }).store(45, { wood: 100 });
  v.put(45, 1, 10).upd();
  assert.equal(v.st.looted[1], 0);
  near(v.stock(45, 'wood'), 50);
});

test('RULES.md "Holder": when the hex becomes the new holder\'s capital, the half stays in the hex and nothing is carried', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(45, 0, 8).upd();
  w.store(45, { wood: 100 });
  w.put(45, 1, 10).upd();
  assert.equal(w.st.capital[1], 45);
  near(w.stock(45, 'wood'), 100);
});

test('RULES.md "Holder": a hex nobody lives in keeps its buildings and store for 30 years, then they are lost', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 8).upd();
  w.store(45, { wood: 30 }).build(45, 'huts');
  w.put(45, 0, 0);
  w.upd(29);
  assert.ok(w.st.has(45, B('huts')), '29 years empty');
  near(w.stock(45, 'wood'), 30);
  assert.equal(w.st.holder[45], -1);
  w.upd();
  assert.ok(!w.st.has(45, B('huts')), 'the 30th year');
  assert.equal(w.stock(45, 'wood'), 0);
  // Someone settling in time keeps them, and the count starts again.
  const v = mk(['expansionist']);
  v.put(45, 0, 8).upd();
  v.build(45, 'huts');
  v.put(45, 0, 0).upd(20);
  v.put(45, 0, 3).upd();
  v.put(45, 0, 0).upd(29);
  assert.ok(v.st.has(45, B('huts')));
});

// ---- capital ---------------------------------------------------------------------------------------------------------

test('RULES.md "Capital": the hex the civ holds with the most of its people (lower index on ties)', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.put(47, 0, 5).put(44, 0, 5).put(60, 0, 3).put(61, 1, 20).upd();
  assert.equal(w.st.capital[0], 44);
  assert.equal(w.st.capital[1], 61);
  const v = mk(['expansionist']);
  assert.equal(v.upd().st.capital[0], -1, 'no people, no capital');
});

test('RULES.md "Capital": moves only when another hex has at least 1.5 times the capital\'s people, or the civ no longer holds it', () => {
  const w = mk(['expansionist']);
  w.put(44, 0, 10).put(47, 0, 3).upd();
  assert.equal(w.st.capital[0], 44);
  w.put(47, 0, 14).upd(); // more, but under 15
  assert.equal(w.st.capital[0], 44);
  w.put(47, 0, 15).upd(); // exactly 1.5 times
  assert.equal(w.st.capital[0], 47);
  // Back the other way needs 22.5 against 15.
  w.put(44, 0, 22).upd();
  assert.equal(w.st.capital[0], 47);
  w.put(44, 0, 23).upd();
  assert.equal(w.st.capital[0], 44);
  // Losing the hex moves it at once.
  w.put(44, 0, 0).upd();
  assert.equal(w.st.capital[0], 47);
});

test('RULES.md "Capital": its store cap is 1.5 times its tier\'s, and never below 1.1 times the largest cost it must be able to hold', () => {
  const w = mk(['expansionist']);
  w.put(44, 0, 12).put(47, 0, 3).upd();
  assert.equal(w.st.storeCap[44], 1.5 * TIERS[VILLAGE].store, 'a capital village: 375');
  assert.equal(w.st.storeCap[47], TIERS[CAMP].store, 'a camp that is not the capital: 60');
  w.st.capitalMin[0] = 400; w.upd();
  assert.equal(w.st.storeCap[44], 400);
  w.st.capitalMin[0] = 375; w.upd();
  assert.equal(w.st.storeCap[44], 375);
  w.st.capitalMin[0] = 100; w.upd();
  assert.equal(w.st.storeCap[44], 375);
  // The old capital goes back to its own cap when it stops being the capital.
  w.put(47, 0, 40).upd();
  assert.equal(w.st.capital[0], 47);
  assert.equal(w.st.storeCap[44], TIERS[VILLAGE].store);
});

test('RULES.md "Capital": capitalMin is 1.1 times the largest one-material cost of the next level and era building together, or of the wonder', () => {
  const lv = new Levels(makeMap(10, 10, () => PLAINS), ['expansionist']);
  const min = () => lv.settlements.capitalMin[0];
  // Level 1: wood 80 + 40 = 120 against the Sun Circle's 160 wood.
  near(min(), SETTLE.capitalNeed * 160, 1e-9);
  lv.buildings.wYear[0] = 5; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 120, 1e-9, 'the wonder is finished: level + building');
  lv.buildings.wYear[0] = -1;
  lv.level[0] = 2; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 300, 1e-9); // 200 + 100 wood; Hanging Gardens 250 stone
  lv.level[0] = 3; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 450, 1e-9); // stone 300 + 150 = 450; Great Wall 400
  lv.level[0] = 4; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 400, 1e-9); // iron 150 + 80 = 230; but the unfinished Great Wall (era 3) wants 400 stone
  lv.buildings.wYear[2] = 5; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 250, 1e-9, 'the Great Wall is finished: the Hanging Gardens (250 stone, era 2) still count');
  lv.buildings.wYear[1] = 5; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 230, 1e-9, 'wonders of eras 1 to 3 finished: only the level and building');
  // A finished building leaves only the level.
  lv.buildings.state[3] = 2; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 230, 1e-9, 'the cap is for the level and the building together even once it stands');
  lv.buildings.wYear[1] = -1; lv.buildings.wYear[2] = -1;
  // Every unfinished wonder of its era or earlier counts, the biggest cost deciding.
  lv.level[0] = 5; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 400, 1e-9, 'a Kingdom still keeps what an unfinished wonder costs');
  lv.buildings.wYear.fill(5); lv.capitalNeeds();
  assert.equal(min(), 0, 'a Kingdom with every wonder finished needs nothing');
  lv.level[0] = 2; lv.capitalNeeds();
  near(min(), SETTLE.capitalNeed * 300, 1e-9, 'level + building (300 wood) with every wonder finished');
});

test('RULES.md "Supply routes": the capital collects the next level and the era building together (and the wonder if committed and not started)', () => {
  const lv = new Levels(makeMap(10, 10, () => PLAINS), ['expansionist']);
  const want = (m) => lv.capWant[m];
  assert.equal(want(WOOD), 80 + 40);
  assert.equal(want(STONE), 30 + 30);
  assert.equal(want(CLAY), 30 + 15);
  assert.equal(lv.settlements.keep, lv.capWant, 'the capital keeps the same list');
  // Building standing or started: the level alone.
  lv.buildings.state[0] = 1; lv.targets(0);
  assert.equal(want(WOOD), 80);
  lv.buildings.state[0] = 0;
  // Committed to the wonder, not started: the wonder (160 wood) first, then the level and building.
  lv.buildings.attempt[0] = 1; lv.targets(0);
  assert.equal(want(WOOD), 160 + 80 + 40);
  // Only this era: later levels are not collected.
  lv.buildings.attempt[0] = 0; lv.level[0] = 2; lv.targets(0);
  assert.equal(want(WOOD), 200 + 100);
  assert.equal(want(IRON), 0);
});

test('RULES.md "Supply routes": a capital pulls level + era building from a far hex, and the building then starts', () => {
  const groups = Array.from({ length: 15 }, (_, k) => [11 + k, 0, k === 0 ? 21 : k === 14 ? 12 : 10]);
  const w = lvWorld(['expansionist'], groups);
  const st = w.levels.settlements;
  st.blockedTo.fill(1e9);
  w.levels.buildings.aCheck.fill(1e9);
  w.levels.yearsAt[0] = 0;
  const put = (m, v) => { st.store[25 * MATERIAL_COUNT + m] = v; };
  put(WOOD, 120); put(STONE, 60); put(CLAY, 45);
  let years = 0;
  while (w.levels.buildings.state[0] === 0 && years < 100) { w.step(); years++; }
  assert.equal(w.levels.buildings.state[0], 1, 'the era 1 building started');
  assert.equal(w.levels.level[0], 1);
  near(st.store[11 * MATERIAL_COUNT + WOOD], 80, 1e-6);
  near(st.store[11 * MATERIAL_COUNT + STONE], 30, 1e-6);
  near(st.store[11 * MATERIAL_COUNT + CLAY], 30, 1e-6);
});

test('a seeded run starts an era building', () => {
  const sim = new Simulation({ seed: 'build-run', size: 14, civCount: 3, startPop: 60, civTypes: ['cooperative', 'expansionist', 'nomadic'] });
  let started = false;
  for (let y = 0; y < 500 && !started; y++) {
    sim.tick();
    started = sim.levels.buildings.state.some((x) => x !== 0);
  }
  assert.ok(started, 'some civ started an era building');
});

// ---- store caps -------------------------------------------------------------------------------------------------------

test('RULES.md "Settlements" store caps: 60, 250, 450, 700, 1000, 1500 by tier; a Warehouse multiplies by 1.5', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.level[0] = 5;
  // Civ 1 holds a bigger hex so civ 0's tested hexes are not capitals.
  w.put(90, 0, 500);
  [[40, 1], [41, 12], [42, 30], [43, 60], [44, 100], [45, 160]].forEach(([h, p]) => w.put(h, 0, p));
  w.upd();
  assert.deepEqual([40, 41, 42, 43, 44, 45].map((h) => w.st.storeCap[h]), [60, 250, 450, 700, 1000, 1500]);
  w.build(41, 'warehouse').upd();
  assert.equal(w.st.storeCap[41], 375);
  assert.equal(w.st.storeCap[40], 60);
});

test('RULES.md "Settlements" store caps: stock above a store\'s cap loses 20% of the amount above the cap a year', () => {
  const w = mk(['expansionist']);
  w.put(44, 0, 20).put(47, 0, 3).upd(); // 47: a camp, cap 60
  w.store(47, { wood: 100, stone: 60, clay: 10 }).upd();
  near(w.stock(47, 'wood'), 60 + 40 * 0.8);
  assert.equal(w.stock(47, 'stone'), 60, 'at the cap: untouched');
  assert.equal(w.stock(47, 'clay'), 10);
  w.upd();
  near(w.stock(47, 'wood'), 60 + 32 * 0.8, 1e-9);
  assert.equal(w.st.full[47], 1, 'a material over its cap marks the store as full for Warehouse');
});

test('RULES.md "Capital": stock above a lowered cap (a capital that moved) decays too', () => {
  const w = mk(['expansionist']);
  w.put(44, 0, 12).put(47, 0, 3).upd();
  w.store(44, { wood: 300 }).upd();
  assert.equal(w.stock(44, 'wood'), 300, 'under the capital cap of 375');
  w.put(47, 0, 40).upd();
  assert.equal(w.st.capital[0], 47);
  near(w.stock(44, 'wood'), 250 + 50 * 0.8, 1e-9);
});

// ---- eligibility and slots -------------------------------------------------------------------------------------------

test('RULES.md "Settlement buildings": a building needs its tier, the holder\'s level, its site, and not to stand already', () => {
  // Hex 0 is plains next to deep water (hex 1), hex 22 forest, hex 45 plains.
  const w = mk(['expansionist'], { terrain: (i) => (i === 1 ? DEEP_WATER : i === 22 ? FOREST : PLAINS) });
  const dep = w.map.deposits;
  w.level[0] = 3;
  w.put(0, 0, 60).put(22, 0, 30).put(45, 0, 12).put(46, 0, 100).upd();
  assert.equal(w.st.tier[0], CITY);
  assert.equal(w.st.tier[22], TOWN);
  assert.equal(w.st.tier[45], VILLAGE);
  const ok = (h, id, level = w.level) => w.st.eligible(h, B(id), dep, level);
  // Tier: Houses (town) not in a village; Irrigation (city) not in a town.
  assert.equal(ok(45, 'houses'), false);
  assert.equal(ok(22, 'houses'), true);
  assert.equal(ok(22, 'irrigation'), false);
  assert.equal(ok(0, 'irrigation'), true);
  assert.equal(ok(45, 'huts'), true, 'camp and up');
  assert.equal(ok(0, 'stoneWalls'), true);
  assert.equal(ok(22, 'stoneWalls'), false);
  // Site: Fields on plains, coast or river; not forest.
  assert.equal(ok(45, 'fields'), true);
  assert.equal(ok(0, 'fields'), true);
  w.map.river[45] = 1;
  const f = mk(['expansionist'], { terrain: (i) => (i === 22 ? FOREST : i === 23 ? COAST : PLAINS) });
  f.put(22, 0, 12).put(23, 0, 12).upd();
  assert.equal(f.st.eligible(22, B('fields'), f.map.deposits, f.level), false, 'forest');
  assert.equal(f.st.eligible(23, B('fields'), f.map.deposits, f.level), true, 'coast');
  // Fishing dock: next to a sea or lake hex.
  assert.equal(ok(0, 'fishingDock'), true);
  assert.equal(ok(45, 'fishingDock'), false);
  // Industry: a deposit of one of its materials in the hex.
  assert.equal(ok(45, 'woodcutter'), false, 'no deposit');
  dep[45] |= 1 << WOOD;
  assert.equal(ok(45, 'woodcutter'), true);
  assert.equal(ok(45, 'quarry'), false, 'a wood deposit is not stone');
  // Holder's level: Mine from 2, Deep mine from 3.
  dep[45] |= (1 << COPPER) | (1 << GOLD);
  const lv = (n) => Uint8Array.of(n);
  assert.deepEqual([1, 2, 3].map((n) => ok(45, 'mine', lv(n))), [false, true, true]);
  assert.deepEqual([1, 2, 3].map((n) => ok(45, 'deepMine', lv(n))), [false, false, true]);
  // Already standing.
  w.build(45, 'huts');
  assert.equal(ok(45, 'huts'), false);
  // Palace: a metropolis that is the civ's capital.
  const p = mk(['expansionist', 'aggressive']);
  p.level[0] = 4; p.level[1] = 4;
  p.put(45, 0, 100).put(46, 0, 100).put(47, 1, 100).upd();
  assert.equal(p.st.tier[45], METROPOLIS);
  assert.equal(p.st.capital[0], 45);
  assert.equal(p.st.eligible(45, B('palace'), p.map.deposits, p.level), true);
  assert.equal(p.st.eligible(46, B('palace'), p.map.deposits, p.level), false, 'not the capital');
  p.put(45, 0, 20).put(46, 0, 160).upd();
  p.level[0] = 3; p.upd();
  assert.equal(p.st.eligible(45, B('palace'), p.map.deposits, p.level), false, 'a city is too small');
});

test('RULES.md "Settlement buildings": standing buildings plus the one planned fill at most the tier\'s slots (camp 1, village 2)', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 41).upd(); // a village (2 slots) at 41 of 45 housing: wants Huts
  w.store(45, { wood: 100 });
  const ask = (year) => { w.st.choose(year, w.map.deposits, w.level, new Uint16Array(1), new Int32Array(w.map.count), () => false); };
  assert.equal(w.st.slotsUsed(45), 0);
  w.build(45, 'huts'); // one standing: one slot free
  w.st.choose(planYear(45), w.map.deposits, w.level, new Uint16Array(1), new Int32Array(w.map.count), () => false);
  // Huts stand; with housing 60 the 41 people are under 90% (54), nothing wanted, so no plan; fill the slot by hand.
  assert.equal(w.st.slotsUsed(45), 1);
  w.build(45, 'palisade');
  assert.equal(w.st.slotsUsed(45), 2);
  w.st.plan[45] = -1;
  ask(planYear(45, 10));
  assert.equal(w.st.plan[45], -1, 'no free slot: nothing planned');
  // A planned building uses a slot too.
  const v = mk(['expansionist']);
  v.put(45, 0, 41).upd();
  v.st.plan[45] = B('huts');
  v.build(45, 'palisade');
  assert.equal(v.st.slotsUsed(45), 2);
  // A camp has one slot.
  const c = mk(['expansionist']);
  c.put(45, 0, 3).upd();
  c.build(45, 'huts');
  assert.equal(c.st.slotsUsed(45), 1);
  assert.equal(TIERS[CAMP].slots, 1);
});

// ---- choosing --------------------------------------------------------------------------------------------------------

/** Settlement in hex 45 (p people, civ level `level`) with the given store; returns what it plans at its choosing year. */
function chooseIn(types, p, store, { level = 1, wanted = 0, hungry = 0, threat = false, deposits = [], setup = null, hex = 45 } = {}) {
  const w = mk(types);
  w.level.fill(level);
  w.put(hex, 0, p).upd();
  w.store(hex, store);
  for (const m of deposits) w.map.deposits[hex] |= 1 << m;
  setup?.(w);
  const hungryArr = new Int32Array(w.map.count);
  hungryArr[hex] = hungry;
  const wantedArr = new Uint16Array(types.length);
  wantedArr[0] = wanted;
  w.st.choose(planYear(hex), w.map.deposits, w.level, wantedArr, hungryArr, () => threat);
  w.plan = w.st.plan[hex] >= 0 ? SETTLEMENT_BUILDINGS[w.st.plan[hex]].id : null;
  return w;
}

test('RULES.md "Choosing": housing scores 3, only when the people are at least 90% of the housing (village: 40 of 45 is under, 41 is over)', () => {
  assert.equal(chooseIn(['cooperative'], 40, { wood: 100 }).plan, null, '40 < 40.5');
  assert.equal(chooseIn(['cooperative'], 41, { wood: 100 }).plan, 'huts');
  // Only buildings whose materials the civ has somewhere are considered.
  assert.equal(chooseIn(['cooperative'], 41, { stone: 100 }).plan, 'shrine', 'no wood anywhere: Huts cannot be considered, the civic building can');
  assert.equal(chooseIn(['cooperative'], 41, {}).plan, null, 'no materials at all');
});

test('RULES.md "Choosing": a settlement decides only every 5 years (hex index + year a multiple of 5)', () => {
  const w = chooseIn(['cooperative'], 41, { wood: 100 });
  assert.equal(w.plan, 'huts');
  const v = mk(['cooperative']);
  v.put(45, 0, 41).upd();
  v.store(45, { wood: 100 });
  const ask = (year) => v.st.choose(year, v.map.deposits, v.level, new Uint16Array(1), new Int32Array(v.map.count), () => false);
  for (const y of [1, 2, 3, 4]) { ask(planYear(45) + y); assert.equal(v.st.plan[45], -1, `year offset ${y}`); }
  ask(planYear(45) + 5);
  assert.equal(v.st.plan[45], B('huts'), 'five years on');
});

test('RULES.md "Choosing": food scores 3, only when at least 10% of the people went hungry last year (2 of 20 yes, 1 no)', () => {
  assert.equal(chooseIn(['cooperative'], 20, { wood: 100 }, { hungry: 1 }).plan, null);
  const w = chooseIn(['cooperative'], 20, { wood: 100 }, { hungry: 2 });
  assert.equal(w.plan, 'fields', 'Fields come before the Fishing dock in the table and a plains hex has no sea');
  // Fields need a farm site: a forest village plans nothing.
  const f = mk(['cooperative'], { terrain: () => FOREST });
  f.put(45, 0, 20).upd();
  f.store(45, { wood: 100 });
  const h = new Int32Array(f.map.count); h[45] = 5;
  f.st.choose(planYear(45), f.map.deposits, f.level, new Uint16Array(1), h, () => false);
  assert.equal(f.st.plan[45], -1);
});

test('RULES.md "Choosing": industry scores 4 when the civ gathers that material, 1 otherwise, +0.25 uncommon, +0.5 exotic', () => {
  // Woodcutter (wanted 4) beats housing (3); unwanted (1) loses to it.
  const wanted = chooseIn(['cooperative'], 41, { wood: 100 }, { deposits: [WOOD], wanted: 1 << WOOD });
  assert.equal(wanted.plan, 'woodcutter');
  const unwanted = chooseIn(['cooperative'], 41, { wood: 100 }, { deposits: [WOOD], wanted: 0 });
  assert.equal(unwanted.plan, 'huts');
  // Rarity bonuses decide between equally unwanted choices: with no housing need, the Mine (1.25) against the Woodcutter (1).
  const mine = chooseIn(['expansionist'], 20, { wood: 100, stone: 100 }, { level: 2, deposits: [WOOD, COPPER] });
  assert.equal(mine.plan, 'mine', '1.25 against 1 for the Woodcutter and the Shrine');
  const wood = chooseIn(['expansionist'], 20, { wood: 100, stone: 100 }, { level: 2, deposits: [WOOD] });
  assert.equal(wood.plan, 'woodcutter', '1 ties the Shrine\'s 1: the earlier row');
  // An unwanted exotic Deep mine: 1.5 against a wanted common Woodcutter's 4.
  const deep = chooseIn(['expansionist'], 20, { wood: 100, stone: 100, iron: 100 }, { level: 3, deposits: [WOOD, GOLD] });
  assert.equal(deep.plan, 'deepMine');
  const both = chooseIn(['expansionist'], 20, { wood: 100, stone: 100, iron: 100 }, { level: 3, deposits: [WOOD, GOLD], wanted: 1 << WOOD });
  assert.equal(both.plan, 'woodcutter');
  // The Mine needs level 2 and the Deep mine level 3.
  assert.equal(chooseIn(['expansionist'], 20, { wood: 100, stone: 100 }, { level: 1, deposits: [COPPER] }).plan, 'shrine');
  assert.equal(chooseIn(['expansionist'], 20, { wood: 100, stone: 100, iron: 100 }, { level: 2, deposits: [GOLD] }).plan, 'shrine');
});

test('RULES.md "Choosing": Warehouse 2 only when some material hit its cap last year; Market 2 only with at least 10 goods carried', () => {
  const town = { level: 2 };
  const store = { wood: 100, stone: 100, clay: 100, salt: 100 };
  // Civic (School/Shrine, 1) is the fallback in a town with nothing else to do.
  assert.equal(chooseIn(['expansionist'], 30, store, town).plan, 'shrine');
  assert.equal(chooseIn(['expansionist'], 30, store, { ...town, setup: (w) => { w.st.full[45] = 1; } }).plan, 'warehouse');
  assert.equal(chooseIn(['expansionist'], 30, store, { ...town, setup: (w) => { w.st.sent[45] = 6; w.st.received[45] = 4; } }).plan, 'market');
  assert.equal(chooseIn(['expansionist'], 30, store, { ...town, setup: (w) => { w.st.sent[45] = 6; w.st.received[45] = 3.9; } }).plan, 'shrine', '9.9 goods');
});

test('RULES.md "Choosing": defence scores 2 only when a threat its civ does not beat is in or next to the hex', () => {
  assert.equal(chooseIn(['expansionist'], 20, { wood: 100 }, { threat: true }).plan, 'palisade');
  assert.equal(chooseIn(['expansionist'], 20, { wood: 100 }, { threat: false }).plan, null);
});

test('RULES.md "Choosing": civic scores 1', () => {
  assert.equal(chooseIn(['expansionist'], 20, { stone: 100 }).plan, 'shrine');
});

test('RULES.md "Choosing": the civ type tilts the scores (Isolationist, Cooperative, Aggressive, Expansionist) and ties go to the earlier building', () => {
  // Woodcutter unwanted (1) against Shrine (1): a tie goes to the earlier row (Woodcutter); Cooperative civic × 1.3 flips it.
  const mats = { wood: 100, stone: 100 };
  assert.equal(chooseIn(['expansionist'], 20, mats, { deposits: [WOOD] }).plan, 'woodcutter');
  assert.equal(chooseIn(['cooperative'], 20, mats, { deposits: [WOOD] }).plan, 'shrine');
  // Isolationist industry × 1.3 keeps the Woodcutter ahead of a Cooperative-sized civic.
  assert.equal(chooseIn(['isolationist'], 20, mats, { deposits: [WOOD] }).plan, 'woodcutter');
  // Aggressive defence 2 × 1.5 = 3 ties housing 3: the earlier row, Huts, wins; Isolationist 2 × 1.3 = 2.6 loses to it.
  assert.equal(chooseIn(['aggressive'], 41, { wood: 100 }, { threat: true }).plan, 'huts');
  assert.equal(chooseIn(['aggressive'], 20, { wood: 100 }, { threat: true }).plan, 'palisade');
  // Expansionist housing 3 × 1.3 = 3.9 against a wanted industry 4 × ... : industry still wins (4 > 3.9); Isolationist food 3 × 1.3 = 3.9.
  assert.equal(chooseIn(['expansionist'], 41, { wood: 100 }, { deposits: [WOOD], wanted: 1 << WOOD }).plan, 'woodcutter');
  assert.equal(chooseIn(['isolationist'], 41, { wood: 100 }, { deposits: [WOOD], wanted: 1 << WOOD }).plan, 'woodcutter');
  // Isolationist food 3.9 beats housing 3 (Expansionist housing 3.9 would tie food 3.9: Huts come first in the table).
  assert.equal(chooseIn(['isolationist'], 41, { wood: 100 }, { hungry: 5 }).plan, 'fields');
  assert.equal(chooseIn(['cooperative'], 41, { wood: 100 }, { hungry: 5 }).plan, 'huts', 'housing 3 and food 3 tie: Huts come first');
});

test('RULES.md "Choosing": a Nomadic settlement plans only a score of at least 2', () => {
  // Civic 1 and unwanted industry 1: nothing. Housing 3 and a wanted industry 4 are planned.
  assert.equal(chooseIn(['nomadic'], 20, { stone: 100 }).plan, null);
  assert.equal(chooseIn(['nomadic'], 20, { wood: 100 }, { deposits: [WOOD] }).plan, null);
  assert.equal(chooseIn(['nomadic'], 41, { wood: 100 }).plan, 'huts');
  assert.equal(chooseIn(['nomadic'], 20, { wood: 100 }, { deposits: [WOOD], wanted: 1 << WOOD }).plan, 'woodcutter');
  assert.equal(chooseIn(['nomadic'], 20, { wood: 100 }, { threat: true }).plan, 'palisade', 'defence 2 is enough');
});

test('RULES.md "Building": a plan not started after 40 years is dropped, and nothing is planned there for 25 years', () => {
  const w = mk(['cooperative']);
  w.put(45, 0, 41).upd();
  w.store(45, { wood: 5 }); // reachable but not enough to start Huts (10 wood)
  const hungry = new Int32Array(w.map.count);
  const ask = (year) => w.st.choose(year, w.map.deposits, w.level, new Uint16Array(1), hungry, () => false);
  const y0 = planYear(45);
  ask(y0);
  assert.equal(w.st.plan[45], B('huts'));
  for (let k = 1; k <= 39; k++) ask(y0 + k);
  assert.equal(w.st.plan[45], B('huts'), 'after 39 years of waiting');
  ask(y0 + 40);
  assert.equal(w.st.plan[45], -1, 'the 40th year: dropped');
  for (let k = 41; k < 40 + SETTLE.blockYears; k++) { ask(y0 + k); assert.equal(w.st.plan[45], -1, `blocked at +${k}`); }
  // From the 25th year after the drop, at a choosing year, it plans again.
  let y = y0 + 40 + SETTLE.blockYears;
  while ((45 + y) % 5 !== 0) y++;
  ask(y);
  assert.equal(w.st.plan[45], B('huts'));
});

// ---- building ---------------------------------------------------------------------------------------------------------

test('RULES.md "Building": a plan starts in the first year the store holds its cost (a hundredth short waits); it stands after its years of work', () => {
  const w = mk(['cooperative']);
  w.put(45, 0, 41).upd();
  w.st.plan[45] = B('huts'); // 10 wood, 5 years
  w.store(45, { wood: 9.99 });
  const done = [];
  w.st.build(1, (...a) => done.push(a));
  assert.equal(w.st.started[45], 0);
  near(w.stock(45, 'wood'), 9.99);
  w.store(45, { wood: 12 });
  w.st.build(2, (...a) => done.push(a));
  assert.equal(w.st.started[45], 1);
  near(w.stock(45, 'wood'), 2, 1e-9);
  assert.equal(w.st.work[45], 1, 'the year it starts is the first year of work');
  for (let y = 3; y <= 5; y++) { w.st.build(y, (...a) => done.push(a)); assert.equal(w.st.has(45, B('huts')), false, `after ${y - 1} years of work`); }
  assert.equal(done.length, 0);
  w.st.build(6, (...a) => done.push(a));
  assert.ok(w.st.has(45, B('huts')), 'five years of work');
  assert.equal(w.st.plan[45], -1);
  assert.deepEqual(done, [['built', 0, 45, 6, B('huts')]]);
  near(w.stock(45, 'wood'), 2, 1e-9);
  // Its effect from the next update: housing +15.
  assert.equal(w.st.housing[45], TIERS[VILLAGE].housing);
  w.upd();
  assert.equal(w.st.housing[45], TIERS[VILLAGE].housing + 15);
});

test('RULES.md "Building": the materials of every kind in the cost are needed together', () => {
  const w = mk(['cooperative']);
  w.level[0] = 2;
  w.put(45, 0, 30).upd();
  w.st.plan[45] = B('houses'); // 30 wood, 20 clay
  w.store(45, { wood: 30, clay: 19.99 });
  w.st.build(1);
  assert.equal(w.st.started[45], 0);
  w.store(45, { wood: 30, clay: 20 });
  w.st.build(2);
  assert.equal(w.st.started[45], 1);
  assert.equal(w.stock(45, 'wood') + w.stock(45, 'clay'), 0);
});

test('RULES.md "Settlement buildings" effects: housing, housing share, food capacity, defence, store and carrying', () => {
  const w = mk(['expansionist']);
  w.level[0] = 2;
  w.put(45, 0, 30).upd();
  assert.equal(w.st.housing[45], 80);
  w.build(45, 'huts').upd();
  assert.equal(w.st.housing[45], 95);
  w.build(45, 'houses').upd();
  assert.equal(w.st.housing[45], 80 + 15 + 20, 'Houses add 25% of the tier\'s 80');
  near(w.st.foodShare[45], 0.04, 1e-6);
  w.build(45, 'granary').upd();
  near(w.st.foodShare[45], 0.09, 1e-6);
  w.build(45, 'fishingDock').upd();
  assert.equal(w.st.foodFlat[45], 5);
  w.build(45, 'palisade').upd();
  near(w.st.defence[45], 0.25, 1e-6);
  w.build(45, 'market').upd();
  assert.equal(w.st.carryMul[45], 1.5);
  assert.equal(w.st.hexProgress[45], 0);
  // An empty hex has no housing limit.
  assert.equal(w.st.housing[46], 1e9);
});

test('RULES.md "What levels do": food capacity = level 1 capacity × (level bonus + tier bonus + buildings) + flat bonuses', () => {
  const map = makeMap(10, 10, () => PLAINS);
  const lv = new Levels(map, ['expansionist']);
  lv.level[0] = 2;
  const st = lv.settlements;
  const cnt = new Int32Array(map.count);
  cnt[45] = 30; cnt[46] = 30;
  st.built[46] |= (1 << B('granary')) | (1 << B('fishingDock'));
  const people = new People(8);
  lv.year(people, map, 1, cnt, new Int8Array(map.count).fill(-1));
  // Plains at level 2: 60 × (1.25 + 0.04 Town).
  near(map.foodCap[45], 60 * (1.25 + 0.04), 1e-4);
  near(map.foodCap[46], 60 * (1.25 + 0.04 + 0.05) + 5, 1e-4);
  near(map.foodCap[47], 60, 1e-9);
});

// ---- industry ---------------------------------------------------------------------------------------------------------

test('RULES.md "Gathering" yield: industry buildings raise the yield per gatherer and the deposit\'s cap for their own materials only', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 5).upd();
  const y = (h, m) => [w.st.yieldOf(h, m), w.st.capOf(h, m)];
  assert.deepEqual(y(45, WOOD), [0.5, 10]);
  assert.deepEqual(y(45, COPPER), [0.25, 5]);
  assert.deepEqual(y(45, GOLD), [0.0625, 1.25]);
  w.build(45, 'woodcutter');
  assert.deepEqual(y(45, WOOD), [1, 20]);
  assert.deepEqual(y(45, STONE), [0.5, 10], 'not stone');
  w.build(45, 'quarry');
  assert.deepEqual(y(45, STONE), [1, 20]);
  w.build(45, 'clayPit');
  assert.deepEqual(y(45, CLAY), [1, 20]);
  w.build(45, 'mine');
  for (const m of [COPPER, IRON, SALT]) assert.deepEqual(y(45, m), [1, 20]);
  assert.deepEqual(y(45, GOLD), [0.0625, 1.25]);
  w.build(45, 'deepMine');
  for (const m of [GOLD, GEMSTONES, SPICES]) assert.deepEqual(y(45, m), [0.5, 5]);
  assert.deepEqual(y(46, WOOD), [0.5, 10], 'another hex is unchanged');
});

/** A Levels world: groups [hex, civ, n]; plains; deposits { hex: [materials] }. */
function lvWorld(types, groups, deposits = {}, { size = 10 } = {}) {
  const map = makeMap(size, size, () => PLAINS);
  for (const [h, mats] of Object.entries(deposits)) for (const m of mats) map.deposits[h] |= 1 << m;
  const people = new People(512);
  for (const [hex, civ, n] of groups) {
    for (let k = 0; k < n; k++) { const i = people.add(hex, civ, 25, 100, 0); people.traits[COOPERATION][i] = 0.5; }
  }
  const levels = new Levels(map, types);
  const civs = types.length;
  const w = { map, people, levels, civs, year: 0 };
  w.step = () => {
    w.year++;
    const cnt = new Int32Array(map.count * civs);
    for (let i = 0; i < people.high; i++) if (people.alive[i]) cnt[people.hex[i] * civs + people.civ[i]]++;
    levels.hungry.fill(0); levels.hungryHex.fill(0);
    levels.year(people, map, w.year, cnt, new Int8Array(map.count).fill(-1));
    return w;
  };
  return w;
}

test('RULES.md "Gathering" yield: with a Woodcutter, 20 gatherers give 20 wood (hand: 10, the cap); a Mine doubles uncommon to 1 a gatherer', () => {
  const hand = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD] }).step();
  assert.equal(hand.levels.gatherers[55], 20);
  assert.equal(hand.levels.settlements.store[55 * MATERIAL_COUNT + WOOD], 10, '20 × 0.5 = 10, the hand cap');
  const w = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD] });
  w.levels.settlements.built[55] |= 1 << B('woodcutter');
  w.levels.settlements.setIndustry(55);
  w.step();
  assert.equal(w.levels.settlements.store[55 * MATERIAL_COUNT + WOOD], 20, '20 × 1 = 20, the building\'s cap');
  // 100 adults: 20 gatherers on 2 deposits (wood, copper): 10 each; copper by hand 2.5 (cap 5), with a Mine 10.
  const c0 = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD, COPPER] });
  c0.levels.level[0] = 2;
  c0.step();
  near(c0.levels.settlements.store[55 * MATERIAL_COUNT + COPPER], 10 * 0.25);
  near(c0.levels.settlements.store[55 * MATERIAL_COUNT + WOOD], 10 * 0.5);
  const c1 = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD, COPPER] });
  c1.levels.level[0] = 2;
  c1.levels.settlements.built[55] |= 1 << B('mine');
  c1.levels.settlements.setIndustry(55);
  c1.step();
  near(c1.levels.settlements.store[55 * MATERIAL_COUNT + COPPER], 10);
  near(c1.levels.settlements.store[55 * MATERIAL_COUNT + WOOD], 5, 1e-9);
});

test('RULES.md "Gathering" yield: the yield goes into the hex\'s own store, up to its cap; the rest is lost', () => {
  const w = lvWorld(['expansionist', 'aggressive'], [[55, 0, 100], [60, 1, 500]], { 55: [WOOD] });
  const st = w.levels.settlements;
  // A camp's... hex 55 holds 100 people (a village at level 1): cap 250 (it is civ 0's capital, so 375).
  st.store[55 * MATERIAL_COUNT + WOOD] = 374;
  w.step();
  assert.equal(st.store[55 * MATERIAL_COUNT + WOOD], 375 - 0, 'capped at 1.5 × 250');
});

test('RULES.md "Gathering": a hex that carried goods last year gathers 25% less, in proportion to the share of its capacity used', () => {
  const full = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD] });
  full.levels.settlements.used[55] = 1;
  full.step();
  near(full.levels.gatherers[55], 20 * 0.75, 1e-5);
  const half = lvWorld(['expansionist'], [[55, 0, 100]], { 55: [WOOD] });
  half.levels.settlements.used[55] = 0.5;
  half.step();
  near(half.levels.gatherers[55], 20 * 0.875, 1e-5);
});

// ---- civic progress ---------------------------------------------------------------------------------------------------

/** A civ with `hexes` settlements (one per hex from 11, 10 people each) in a Levels world. */
function civicWorld(hexes = 12) {
  const groups = Array.from({ length: hexes }, (_, k) => [11 + k, 0, 10]);
  return lvWorld(['expansionist'], groups);
}
const give = (w, hex, ...ids) => { for (const id of ids) w.levels.settlements.built[hex] |= 1 << B(id); };

test('RULES.md "Progress": a civ\'s bonus is the sum of its civic buildings\' progress (Shrine 2%, School 3%, Library 5%, Palace 5%)', () => {
  assert.deepEqual(['shrine', 'school', 'library', 'palace'].map((id) => SETTLEMENT_BUILDINGS[B(id)].effects.progress), [0.02, 0.03, 0.05, 0.05]);
  const w = civicWorld();
  give(w, 11, 'shrine');
  give(w, 12, 'school', 'library');
  give(w, 13, 'palace');
  w.step();
  near(w.levels.settlements.progress[0], 0.15, 1e-6);
  // Every year at the level counts for 1 + the bonus.
  near(w.levels.yearsAt[0], 1.15, 1e-6);
  w.step();
  near(w.levels.yearsAt[0], 2.3, 1e-6);
  assert.equal(w.levels.summary(0).yearsAtLevel, 2, 'shown rounded down');
  assert.equal(w.levels.summary(0).progressBonus, w.levels.settlements.progress[0]);
});

test('RULES.md "Progress": each kind counts in at most 5 of a civ\'s settlements; the total is at most +20%', () => {
  const w = civicWorld();
  for (let h = 11; h < 17; h++) give(w, h, 'shrine'); // six Shrines
  w.step();
  near(w.levels.settlements.progress[0], 5 * 0.02, 1e-6);
  const v = civicWorld();
  for (let h = 11; h < 16; h++) give(v, h, 'shrine', 'school', 'library'); // 5 × (2 + 3 + 5) = 50%, capped at 20%
  v.step();
  near(v.levels.settlements.progress[0], 0.2, 1e-6);
  const s3 = civicWorld();
  for (let h = 11; h < 13; h++) give(s3, h, 'shrine', 'school'); // 2 × (2 + 3) = 10%, under the cap
  s3.step();
  near(s3.levels.settlements.progress[0], 0.1, 1e-6);
  const u = civicWorld();
  for (let h = 11; h < 16; h++) give(u, h, 'shrine', 'school', 'library');
  give(u, 16, 'palace');
  u.step();
  near(u.levels.settlements.progress[0], MAX_PROGRESS_BONUS, 1e-9);
  near(u.levels.yearsAt[0], 1.2, 1e-6);
  // Two libraries in one hex are not possible (each kind once per settlement), so one hex counts once.
  const t = civicWorld();
  give(t, 11, 'library');
  t.step();
  near(t.levels.settlements.progress[0], 0.05, 1e-6);
});

test('RULES.md "Progress": only settlements the civ holds count', () => {
  const w = lvWorld(['expansionist', 'aggressive'], [[11, 0, 10], [12, 1, 10]]);
  give(w, 12, 'library');
  w.step();
  near(w.levels.settlements.progress[0], 0);
  near(w.levels.settlements.progress[1], 0.05, 1e-6);
});

// ---- the capital's store pays ------------------------------------------------------------------------------------------

test('RULES.md "Gathering and levels": the capital\'s store pays for the level; materials in other stores are carried there first', () => {
  // 15 hexes: the capital 11 (21 people, a village) and hex 25 (12 people, a village with room for the stock); 163 people in all.
  const groups = Array.from({ length: 15 }, (_, k) => [11 + k, 0, k === 0 ? 21 : k === 14 ? 12 : 10]);
  const w = lvWorld(['expansionist'], groups);
  w.levels.yearsAt[0] = 500;
  const st = w.levels.settlements;
  st.blockedTo.fill(1e9); // no settlement buildings competing for the same materials
  const put = (h, m, v) => { st.store[h * MATERIAL_COUNT + m] = v; };
  // Hex 25 (the last of the 15) holds the level 2 cost; the capital is hex 11 (lowest index on a tie of 10 people).
  put(25, WOOD, 80); put(25, STONE, 30); put(25, CLAY, 30);
  w.step();
  assert.equal(st.capital[0], 11);
  assert.equal(w.levels.level[0], 1, 'the capital\'s store is empty: no level yet');
  // Hex 25 can send 0.5 goods a person: 6 a year. The capital collects what its next spend needs.
  const capital = (m) => st.store[11 * MATERIAL_COUNT + m];
  assert.ok(capital(WOOD) + capital(STONE) + capital(CLAY) > 0 && capital(WOOD) + capital(STONE) + capital(CLAY) <= 6 + 1e-6, 'at most 6 goods in the first year');
  let years = 1;
  while (w.levels.level[0] === 1 && years < 80) { w.step(); years++; }
  assert.equal(w.levels.level[0], 2, 'it levels up once the capital holds the cost');
  assert.ok(years >= 24, `140 goods at 6 a year take at least 24 years (${years})`);
  // The materials were spent from the capital's store.
  near(capital(WOOD) + capital(STONE) + capital(CLAY) + (st.store[25 * MATERIAL_COUNT + WOOD] + st.store[25 * MATERIAL_COUNT + STONE] + st.store[25 * MATERIAL_COUNT + CLAY]), 0, 1e-6);
});

// ---- supply routes ----------------------------------------------------------------------------------------------------

test('RULES.md "Supply routes": a planned building asks for what its store lacks from hexes within reach, nearest first', () => {
  const w = mk(['expansionist']);
  w.put(41, 0, 5).put(42, 0, 30).upd(); // A = 41 a camp; B = 42 a village (30 people at level 1)
  w.st.plan[41] = B('huts'); // 10 wood
  w.store(42, { wood: 50 });
  w.carry();
  near(w.stock(41, 'wood'), 10);
  near(w.stock(42, 'wood'), 40);
  assert.equal(w.st.routes, 1);
  assert.deepEqual([w.st.rFrom[0], w.st.rTo[0]], [42, 41]);
  near(w.st.rMat[0], 10);
  // The plan is already paid in part: only the rest is asked for.
  const v = mk(['expansionist']);
  v.put(41, 0, 5).put(42, 0, 30).upd();
  v.st.plan[41] = B('huts');
  v.store(41, { wood: 4 }).store(42, { wood: 50 });
  v.carry();
  near(v.stock(41, 'wood'), 10);
  near(v.stock(42, 'wood'), 44);
  // A started building asks for nothing.
  const s = mk(['expansionist']);
  s.put(41, 0, 5).put(42, 0, 30).upd();
  s.st.plan[41] = B('huts'); s.st.started[41] = 1;
  s.store(42, { wood: 50 });
  s.carry();
  assert.equal(s.stock(41, 'wood'), 0);
  assert.equal(s.st.routes, 0);
});

test('RULES.md "Supply routes": a hex sends 0.5 goods a person a year (Market x 1.5)', () => {
  const w = mk(['expansionist']);
  w.put(41, 0, 5).put(42, 0, 12).upd(); // B: 12 people, a village: 6 goods
  w.st.plan[41] = B('huts');
  w.store(42, { wood: 50 });
  w.carry();
  near(w.stock(41, 'wood'), 6);
  near(w.st.used[42], 1, 1e-6);
  const m = mk(['expansionist']);
  m.level[0] = 2;
  m.put(41, 0, 5).put(42, 0, 12).upd();
  m.build(42, 'market').upd();
  m.st.plan[41] = B('huts');
  m.store(42, { wood: 50 });
  m.carry();
  near(m.stock(41, 'wood'), 9, 1e-6);
  near(m.st.used[42], 1, 1e-6);
});

test('RULES.md "Supply routes": materials come from hexes within the reach of either end (the larger), over land the civ holds', () => {
  const run = (aPeople, bHex, bPeople, between = true) => {
    const w = mk(['expansionist']);
    w.put(41, 0, aPeople).put(bHex, 0, bPeople);
    if (between) for (let h = 42; h < bHex; h++) w.put(h, 0, 1);
    w.upd();
    w.st.plan[41] = B('huts');
    w.store(bHex, { wood: 50 });
    w.carry();
    return w.stock(41, 'wood');
  };
  // Two camps (reach 1 each): next door yes, two steps no.
  assert.ok(run(5, 42, 5) > 0, 'one step');
  assert.equal(run(5, 43, 20 - 15), 0, 'two steps, both camps');
  // A village (reach 2) at either end reaches two steps; a village at three steps does not.
  assert.ok(run(5, 43, 30) > 0, 'the supplier is a village: reach 2');
  assert.ok(run(30, 43, 5) > 0, 'the asker is a village: reach 2');
  assert.equal(run(30, 44, 30), 0, 'three steps, both villages');
  // Not over land another civ holds or that nobody holds.
  assert.equal(run(30, 43, 30, false), 0, 'the hex between is empty');
  const w = mk(['expansionist', 'aggressive']);
  w.put(41, 0, 30).put(42, 1, 5).put(43, 0, 30).upd();
  w.st.plan[41] = B('huts');
  w.store(43, { wood: 50 });
  w.carry();
  assert.equal(w.stock(41, 'wood'), 0, 'another civ\'s hex in between');
});

test('RULES.md "Supply routes": with rafts or boats, materials cross up to the boat range of water hexes in a row; food never does', () => {
  // Row 4: town 41, water 42 and 43, town 44 (three steps, within a town's reach of 3).
  const run = (boats) => {
    const w = mk(['expansionist'], { terrain: (i) => (i === 42 || i === 43 ? DEEP_WATER : PLAINS) });
    w.level[0] = 2;
    w.st.boats = boats;
    w.put(41, 0, 30).put(44, 0, 30).upd();
    w.st.plan[41] = B('huts');
    w.store(44, { wood: 50 });
    w.carry();
    return w.stock(41, 'wood');
  };
  assert.equal(run(null), 0, 'no boats: water blocks the way');
  assert.equal(run(Uint8Array.of(1)), 0, 'rafts cross one water hex, not two');
  assert.ok(run(Uint8Array.of(3)) > 0, 'boats cross both');
});

test('RULES.md "Supply routes": a hex gives the materials beyond its own planned building\'s cost', () => {
  const w = mk(['expansionist']);
  w.put(41, 0, 5).put(42, 0, 30).upd();
  w.st.plan[41] = B('fields'); // 20 wood
  w.st.plan[42] = B('huts'); // 10 wood
  w.store(42, { wood: 25 });
  w.carry();
  near(w.stock(41, 'wood'), 15);
  near(w.stock(42, 'wood'), 10);
});

test('RULES.md "Supply routes": a capital also asks for what its civ\'s next spend needs, from any hex its land connects to it', () => {
  const run = ({ gap = false, otherCiv = false } = {}) => {
    const w = mk(['expansionist', 'aggressive']);
    w.put(40, 0, 120).put(46, 0, 60);
    for (let h = 41; h < 46; h++) w.put(h, 0, 1);
    if (gap) w.put(43, 0, 0);
    if (otherCiv) w.put(43, 1, 3);
    w.upd();
    assert.equal(w.st.capital[0], 40);
    w.target[WOOD] = 50;
    w.store(46, { wood: 40 });
    w.carry();
    return w;
  };
  const w = run();
  // Six steps away, well past any reach: 60 people send 30 goods a year.
  near(w.stock(40, 'wood'), 30);
  near(w.stock(46, 'wood'), 10);
  w.carry();
  near(w.stock(40, 'wood'), 40, 1e-6);
  assert.equal(run({ gap: true }).stock(40, 'wood'), 0, 'the chain is broken by an empty hex');
  assert.equal(run({ otherCiv: true }).stock(40, 'wood'), 0, 'or by another civ\'s hex');
});

test('RULES.md "Supply routes": a capital asks for at most what its civ\'s next spend needs beyond its store, and its cap', () => {
  const w = mk(['expansionist']);
  w.put(40, 0, 120).put(41, 0, 100);
  w.upd();
  w.target[WOOD] = 50;
  w.store(40, { wood: 45 }).store(41, { wood: 500 });
  w.carry();
  near(w.stock(40, 'wood'), 50, 1e-6);
  const v = mk(['expansionist']);
  v.put(40, 0, 120).put(41, 0, 100).upd();
  v.target[WOOD] = 1000;
  v.store(41, { wood: 5000 });
  v.carry();
  assert.ok(v.stock(40, 'wood') <= v.st.storeCap[40] + 1e-6);
});

test('RULES.md "Supply routes": a capital gives nothing of what its civ is saving for', () => {
  const w = mk(['expansionist']);
  w.put(40, 0, 120).put(41, 0, 5).upd();
  w.target[WOOD] = 30;
  w.st.keep = w.target;
  w.st.plan[41] = B('fields'); // 20 wood
  w.store(40, { wood: 40 });
  w.carry();
  near(w.stock(41, 'wood'), 10, 1e-6);
  near(w.stock(40, 'wood'), 30, 1e-6);
});

/** Hungry settlement A = 41 (20 people, no food) beside suppliers; food everywhere else full (60). */
function foodWorld(suppliers = [[42, 20]], { hungry = 2, supplierFood = 60 } = {}) {
  const w = mk(['expansionist']);
  w.put(41, 0, 20);
  for (const [h, p] of suppliers) w.put(h, 0, p);
  w.upd();
  w.map.food[41] = 0;
  for (const [h] of suppliers) w.map.food[h] = supplierFood;
  const hungryArr = new Int32Array(w.map.count);
  hungryArr[41] = hungry;
  w.st.hungry = hungryArr;
  return w;
}

test('RULES.md "Supply routes": a settlement with at least 10% of its people hungry asks for 1.1 x its people - its food; 4% spoils per step', () => {
  const w = foodWorld();
  w.carry();
  // B (20 people, food 60 of 60): spare = min(60 - 22, 30 - 20) = 10, and 10 goods can be carried: 10 sent, 9.6 arrive.
  near(w.map.food[41], 9.6, 1e-5);
  near(w.map.food[42], 50, 1e-6);
  near(w.st.carried[41], 9.6, 1e-5);
  near(w.st.sent[42], 10, 1e-6);
  near(w.st.received[41], 9.6, 1e-5);
  assert.equal(w.st.routes, 1);
  near(w.st.rFood[0], 9.6, 1e-5);
  // Two steps: 8% spoils.
  const v = foodWorld([[43, 20]]);
  v.put(42, 0, 1).upd();
  v.map.food[41] = 0; v.map.food[42] = 0; v.map.food[43] = 60;
  v.st.hungry = w.st.hungry; v.st.hungry[41] = 2;
  v.carry();
  near(v.map.food[41], 9.2, 1e-5);
  near(v.map.food[43], 50, 1e-6);
});

test('RULES.md "Supply routes": food is asked for only from 10% hungry (2 of 20 yes, 1 no) and only while the settlement holds less than 1.1 years\' food', () => {
  const none = foodWorld([[42, 20]], { hungry: 1 });
  none.carry();
  assert.equal(none.map.food[41], 0);
  assert.equal(none.st.routes, 0);
  // Already holding 1.1 years' food: nothing to ask for.
  const full = foodWorld();
  full.map.food[41] = 23;
  full.carry();
  assert.equal(full.map.food[41], 23);
  // Asks only for the shortfall: food 17 -> wants 5.0000000000000036, supplier sends 5.56.
  const part = foodWorld();
  part.map.food[41] = 17;
  part.carry();
  near(part.map.food[41], 22, 1e-5);
});

test('RULES.md "Supply routes": a supplier gives food only when its spare, min(food - 1.1 x people, 0.5 x capacity - people), is at least 5', () => {
  // Capacity 60, 20 people: spare = min(food - 22, 10). Food 26 -> 4: nothing; food 28 -> 6: sends 6.
  const low = foodWorld([[42, 20]], { supplierFood: 26 });
  low.carry();
  assert.equal(low.map.food[41], 0);
  assert.equal(low.map.food[42], 26);
  const ok = foodWorld([[42, 20]], { supplierFood: 28 });
  ok.carry();
  near(ok.map.food[41], 6 * 0.96, 1e-5);
  near(ok.map.food[42], 22, 1e-6);
  // The capacity limit: a hex with 25 people keeps half its capacity in food and people together: spare = min(60 - 27.5, 30 - 25) = 5.
  const crowd = foodWorld([[42, 25]]);
  crowd.carry();
  near(crowd.map.food[41], 5 * 0.96, 1e-5);
  // 26 people: 30 - 26 = 4 < 5: nothing.
  const over = foodWorld([[42, 26]]);
  over.carry();
  assert.equal(over.map.food[41], 0);
});

test('RULES.md "Supply routes": a hungry settlement takes from the nearest supplier first, then the next', () => {
  const w = foodWorld([[42, 20], [43, 20]]);
  w.carry();
  // Wants 22: 10 from B at one step (9.6 arrive), the other 12.4 from C at two steps (10 sent, 9.2 arrive).
  near(w.map.food[42], 50, 1e-6);
  near(w.map.food[43], 50, 1e-6);
  near(w.map.food[41], 9.6 + 9.2, 1e-5);
  assert.equal(w.st.routes, 2);
  // A single big supplier two steps away covers more of it per trip: only carrying capacity limits it.
  const v = foodWorld([[43, 40]]);
  v.put(42, 0, 1).upd();
  v.map.food[41] = 0; v.map.food[42] = 0; v.map.food[43] = 100; v.map.foodCap[43] = 100;
  v.st.hungry[41] = 2;
  v.carry();
  // spare = min(100 - 44, 50 - 40) = 10; carries up to 20: sends 10, 9.2 arrive.
  near(v.map.food[41], 9.2, 1e-5);
});

test('RULES.md "Supply routes": food carried in is added at once and to the hex\'s imports, smoothed 0.8 x last year + 0.2 x this year', () => {
  const w = foodWorld();
  assert.equal(w.st.imported[41], 0);
  w.carry();
  near(w.st.imported[41], 0.2 * 9.6, 1e-5);
  // Next year the same again (refill the supplier and empty the settlement).
  w.map.food[41] = 0; w.map.food[42] = 60;
  w.carry();
  near(w.st.imported[41], 0.8 * 1.92 + 0.2 * 9.6, 1e-5);
  // A year with nothing carried in: 0.8 x the average.
  w.map.food[41] = 0; w.map.food[42] = 0;
  w.carry();
  near(w.st.imported[41], 0.8 * (0.8 * 1.92 + 0.2 * 9.6), 1e-5);
  // A hex nobody holds has no imports.
  w.put(41, 0, 0); w.put(42, 0, 0);
  w.upd();
  w.carry();
  assert.equal(w.st.imported[41], 0);
});

// ---- births room, crowding and defence --------------------------------------------------------------------------------

test('RULES.md "A year" Births: room = min(housing, food capacity + 2 x food carried in); a hex nobody lives in has no housing limit', () => {
  const map = makeMap(10, 10, () => PLAINS); // capacity 60
  assert.equal(room(map, 5), 60, 'no settlements: the capacity alone');
  map.housing = new Float32Array(map.count).fill(1e9);
  map.imported = new Float32Array(map.count);
  assert.equal(room(map, 5), 60);
  map.imported[5] = 10;
  assert.equal(room(map, 5), 80, 'support 60 + 2 x 10');
  map.housing[5] = 45;
  assert.equal(room(map, 5), 45, 'housing caps it');
  map.housing[5] = 100;
  assert.equal(room(map, 5), 80);
  map.housing[5] = 80;
  assert.equal(room(map, 5), 80);
  map.imported[5] = 0;
  assert.equal(room(map, 5), 60);
  // The crowded line is the share of the support, never above the housing.
  assert.equal(crowdLine(map, 5, 0.5), 30);
  map.imported[5] = 20;
  assert.equal(crowdLine(map, 5, 0.5), 50, '0.5 x (60 + 40)');
  assert.equal(crowdLine(map, 5, 0.3), 30);
  map.housing[5] = 20;
  assert.equal(crowdLine(map, 5, 0.5), 20, 'housing caps it');
  assert.equal(crowdLine(map, 5, 0.3), 20);
});

test('RULES.md "A year" Births: no births in a hex with people (all civs) at or above its room; one below still has them', () => {
  const trial = (pop, { housing = 1e9, imported = 0 } = {}) => {
    let total = 0;
    for (let t = 0; t < 40; t++) {
      const map = makeMap(10, 10, () => PLAINS); // capacity 60
      map.housing = new Float32Array(map.count).fill(housing);
      map.imported = new Float32Array(map.count).fill(imported);
      const people = new People(16);
      addAdults(people, 5, 0, Math.floor(pop / 2), Math.ceil(pop / 2));
      const s = scratch(map, people);
      total += births(people, map, new Rng(`room${pop}-${t}`), s.pop, s.parents, () => {});
    }
    return total;
  };
  // Housing 25: 24 people have room, 25 do not (the food capacity 60 would allow it).
  assert.ok(trial(24, { housing: 25 }) > 0);
  assert.equal(trial(25, { housing: 25 }), 0);
  assert.ok(trial(25, { housing: 26 }) > 0);
  // Imported food: capacity 60 + 2 x 10 = 80.
  assert.equal(trial(60, { imported: 0 }), 0, 'capacity alone: 60 is full');
  assert.ok(trial(60, { imported: 10 }) > 0);
  assert.ok(trial(79, { imported: 10 }) > 0);
  assert.equal(trial(80, { imported: 10 }), 0);
  // The smaller of the two: lots of imports, little housing.
  assert.equal(trial(45, { housing: 45, imported: 100 }), 0);
  assert.ok(trial(44, { housing: 45, imported: 100 }) > 0);
});

test('RULES.md "Migration": a hex is crowded above 50% of its support (food capacity + 2 x food carried in) or above its housing', () => {
  const C = 55;
  const setup = (n, { housing = 1e9, imported = 0 } = {}) => {
    const near6 = [...makeMap(10, 10, () => 0).neighbours.slice(C * 6, C * 6 + 6)];
    const map = makeMap(10, 10, (i) => (i === C ? PLAINS : near6.includes(i) ? COAST : DEEP_WATER));
    map.housing = new Float32Array(map.count).fill(1e9);
    map.imported = new Float32Array(map.count);
    map.housing[C] = housing;
    map.imported[C] = imported;
    const people = new People(Math.max(16, n));
    for (let k = 0; k < n; k++) people.add(C, 0, 25, 50, 0);
    return { map, people, reach: buildReach(map), s: scratch(map, people) };
  };
  const moved = (n, opts) => {
    let total = 0;
    for (let t = 0; t < 100; t++) {
      const { map, people, reach, s } = setup(n, opts);
      total += migrate(people, map, reach, new Rng(`crowd${n}-${t}`), s.pop, s.spare, s.dest);
    }
    return total / (100 * n);
  };
  // Capacity 60: crowded above 30. Housing 20 makes 21 people crowded.
  assert.equal(moved(30), 0, '30 of 60 is not crowded');
  assert.equal(moved(20, { housing: 20 }), 0, 'at the housing: not above it');
  const over = moved(21, { housing: 20 });
  assert.ok(over > 0.15 && over < 0.25, `21 people over a housing of 20 move at about 20% (${over})`);
  // Imports raise the line: 0.5 x (60 + 2 x 20) = 50.
  assert.equal(moved(40, { imported: 20 }), 0);
  assert.equal(moved(50, { imported: 20 }), 0);
  const imp = moved(51, { imported: 20 });
  assert.ok(imp > 0.15 && imp < 0.25, `51 people over a line of 50 (${imp})`);
});

// ---- events, snapshot and determinism ---------------------------------------------------------------------------------

test('RULES.md "Statistics" city events: a hex reaching its highest tier from city up is reported once; a city taken is reported with the civ it was taken from', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.level.fill(4);
  w.put(45, 0, 59).upd();
  assert.equal(w.ev.length, 0, 'a town is not reported');
  w.put(45, 0, 60).upd();
  assert.deepEqual(w.ev, [['tier', 0, 45, w.year, CITY]]);
  w.put(45, 0, 59).upd();
  w.put(45, 0, 60).upd();
  assert.equal(w.ev.length, 1, 'the same peak is not reported again');
  w.put(45, 0, 100).upd();
  assert.deepEqual(w.ev[1], ['tier', 0, 45, w.year, METROPOLIS]);
  // Taken: the hex changes hands while it is a city or bigger.
  w.put(45, 0, 100).put(45, 1, 125).upd();
  assert.deepEqual(w.ev.at(-1), ['taken', 1, 45, w.year, 0]);
  assert.equal(w.st.holder[45], 1);
  // A town changing hands is not reported.
  const v = mk(['expansionist', 'aggressive']);
  v.level.fill(3);
  v.put(46, 0, 30).upd();
  v.put(46, 1, 40).upd();
  assert.equal(v.st.holder[46], 1);
  assert.ok(v.ev.every((e) => e[0] !== 'taken'));
});

test('RULES.md "End screen" Greatest cities: towns and bigger, by peak tier then peak people', () => {
  const w = mk(['expansionist']);
  w.level[0] = 5;
  w.put(40, 0, 100).put(41, 0, 160).put(42, 0, 30).put(43, 0, 29).put(44, 0, 100).upd();
  const g = w.st.greatest(10, 5);
  assert.deepEqual(g.map((c) => c.hex), [41, 40, 44, 42]);
  assert.deepEqual(g.map((c) => c.tierName), ['Megapolis', 'Metropolis', 'Metropolis', 'Town']);
  assert.equal(g[0].people, 160);
  assert.equal(w.st.greatest(10, 2).length, 2);
});

test('settlements keep their peak after shrinking, and the snapshot lists tiers, holders, capitals and routes as plain typed data', () => {
  const w = mk(['expansionist']);
  w.level[0] = 2;
  w.put(45, 0, 30).upd();
  w.put(45, 0, 3).upd(30);
  assert.equal(w.st.tier[45], VILLAGE, 'one tier per 20 years below 85%: a town after 20, a village for the next 20');
  w.upd(10);
  assert.equal(w.st.tier[45], CAMP);
  assert.equal(w.st.peakTier[45], TOWN);
  assert.equal(w.st.peakPeople[45], 30);
  const snap = w.st.snapshot();
  assert.ok(snap.tier instanceof Int8Array && snap.holder instanceof Int8Array);
  assert.deepEqual(snap.capital, [45]);
  assert.equal(snap.tier[45], w.st.tier[45]);
  const d = w.st.describe(45, 10);
  assert.equal(d.holder, 0);
  assert.equal(d.capital, true);
  assert.equal(w.st.describe(46, 10), null);
});

test('a seeded run: settlements are deterministic (same params and seed give the same hash), and the hash covers the stores, buildings and tiers', () => {
  const run = () => {
    const sim = new Simulation({ seed: 'settle-run', size: 14, civCount: 3, startPop: 40, civTypes: ['cooperative', 'expansionist', 'isolationist'] });
    sim.tick(250);
    return sim;
  };
  const a = run();
  const b = run();
  assert.equal(a.hash(), b.hash());
  assert.deepEqual([...a.levels.settlements.store], [...b.levels.settlements.store]);
  assert.deepEqual([...a.levels.settlements.built], [...b.levels.settlements.built]);
  // The settlements exist and have grown beyond camps and built something.
  const st = a.levels.settlements;
  assert.ok([...st.tier].some((t) => t >= VILLAGE), 'a village or bigger');
  assert.ok([...st.built].some((x) => x !== 0), 'some settlement building stands');
  // Changing any one store, building or tier changes the hash.
  const h0 = a.hash();
  const i = [...st.store].findIndex((v) => v > 0);
  const v0 = st.store[i];
  st.store[i] = v0 + 1;
  assert.notEqual(a.hash(), h0, 'store');
  st.store[i] = v0;
  assert.equal(a.hash(), h0);
  const t = [...st.tier].findIndex((v) => v >= 0);
  st.tier[t]++;
  assert.notEqual(a.hash(), h0, 'tier');
  st.tier[t]--;
  const bh = [...st.built].findIndex((v) => v !== 0);
  st.built[bh] ^= 1;
  assert.notEqual(a.hash(), h0, 'buildings');
  st.built[bh] ^= 1;
  assert.equal(a.hash(), h0);
  // A different seed gives a different world.
  const other = new Simulation({ seed: 'settle-run-2', size: 14, civCount: 3, startPop: 40, civTypes: ['cooperative', 'expansionist', 'isolationist'] });
  other.tick(250);
  assert.notEqual(other.hash(), h0);
});

test('a seeded run: housing and imports are wired into births, and the capital of each living civ is a hex it holds', () => {
  const sim = new Simulation({ seed: 'settle-wire', size: 12, civCount: 2, startPop: 40 });
  assert.equal(sim.map.housing, sim.levels.settlements.housing);
  assert.equal(sim.map.imported, sim.levels.settlements.imported);
  assert.equal(sim.war.settle, sim.levels.settlements, 'war reads walls and holders from the settlements');
  const st = sim.levels.settlements;
  for (let y = 0; y < 150; y++) {
    sim.tick();
    for (let c = 0; c < 2; c++) {
      if (sim.levels.civPop[c] === 0 || st.capital[c] < 0) continue;
      assert.ok(st.holder[st.capital[c]] === c || sim.levels.civPop[c] === 0, `year ${y} civ ${c}`);
    }
  }
});
