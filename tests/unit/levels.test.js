// RULES.md "Gathering and levels" (T-025, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Levels, REQUIREMENTS, GATHER, LEVEL_EFFECTS, LEVEL_NAMES, MAX_LEVEL, TYPE_LEVEL_RULES,
  levelMinimums, yearsNeeded, materialsNeeded, capacityFactor,
} from '../../src/sim/levels.js';
import {
  WOOD, STONE, CLAY, COPPER, IRON, SALT, GOLD, GEMSTONES, SPICES, MATERIAL_COUNT, MATERIAL_IDS,
} from '../../src/sim/materials.js';
import { buildReach } from '../../src/sim/migration.js';
import { People } from '../../src/sim/people.js';
import { Simulation } from '../../src/sim/simulation.js';
import { PLAINS, FOREST, DESERT, HILLS, DEEP_WATER, MOUNTAIN } from '../../src/sim/terrain.js';
import { COOPERATION } from '../../src/sim/traits.js';
import { makeMap } from './helpers.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const near = (got, want, eps = 1e-9) => assert.ok(Math.abs(got - want) <= eps, `${got} vs ${want}`);

/** Rows of the "Levelling up" table: [years, % of land per civ, people per hex, {material: amount}]. */
function ruleRows() {
  const start = RULES.indexOf('| From → to |');
  const lines = RULES.slice(start).split('\n').slice(2);
  const out = [];
  for (const l of lines) {
    if (!l.startsWith('|')) break;
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    const mats = {};
    for (const part of c[4].split(',')) { const [n, name] = part.trim().split(' '); mats[name] = Number(n); }
    out.push([Number(c[1]), Number(c[2].replace('%', '')), Number(c[3]), mats]);
  }
  return out;
}

test('RULES.md "Levelling up": the requirement table equals the code, row by row', () => {
  const rows = ruleRows();
  assert.equal(rows.length, 4);
  rows.forEach(([years, landPct, perHex, mats], k) => {
    assert.equal(REQUIREMENTS[k].years, years);
    assert.equal(REQUIREMENTS[k].landPct, landPct);
    assert.equal(REQUIREMENTS[k].perHex, perHex);
    MATERIAL_IDS.forEach((id, m) => assert.equal(REQUIREMENTS[k].materials[m], mats[id] ?? 0, `level ${k + 2} ${id}`));
  });
  assert.deepEqual(REQUIREMENTS.map((r) => [r.landPct, r.perHex]), [[15, 10], [30, 12], [50, 14], [75, 16]]);
  assert.deepEqual(LEVEL_NAMES, ['Foragers', 'Farmers', 'Builders', 'Organised', 'Kingdom']);
  assert.equal(MAX_LEVEL, 5);
});

test('RULES.md "Gathering": the numbers', () => {
  assert.equal(GATHER.secureHungryPct, 20);
  assert.equal(GATHER.secureFoodPerPerson, undefined, 'no food-per-person check any more');
  assert.equal(GATHER.gatherShare, 0.2);
  assert.equal(GATHER.adultAge, 16);
  assert.equal(GATHER.personBase, 0.5);
  assert.deepEqual({ ...GATHER.yield }, { common: 0.5, uncommon: 0.5, exotic: 0.125 });
  assert.deepEqual({ ...GATHER.cap }, { common: 10, uncommon: 10, exotic: 2.5 });
  assert.equal(LEVEL_EFFECTS.birthPerLevel, 0.005);
  assert.equal(LEVEL_EFFECTS.farmBonus, 0.25);
  assert.equal(LEVEL_EFFECTS.kingdomBonus, 0.25);
  assert.equal(LEVEL_EFFECTS.oldAgeDelay, 5);
  assert.equal(LEVEL_EFFECTS.shelterFactor, 0.5);
  assert.equal(LEVEL_EFFECTS.fallBackYears, 100);
  assert.equal(LEVEL_EFFECTS.kingdomStrength, 5);
  assert.equal(LEVEL_EFFECTS.absorbPct, undefined, 'Kingdoms absorb enclosed hexes whole');
  assert.equal(LEVEL_EFFECTS.boatCost, 1);
  assert.deepEqual([LEVEL_EFFECTS.farmLevel, LEVEL_EFFECTS.shelterLevel, LEVEL_EFFECTS.boatLevel], [2, 3, 4]);
  assert.deepEqual({ ...TYPE_LEVEL_RULES.nomadic }, { yearsPct: 125 });
  assert.deepEqual({ ...TYPE_LEVEL_RULES.isolationist }, { yearsPct: 80, materialsPct: 125 });
  assert.deepEqual({ ...TYPE_LEVEL_RULES.cooperative }, { gatherPct: 125 });
});

test('RULES.md "Levelling up" by type: years rounded up (Nomadic 188, 375, 625, 1000; Isolationist 120, 240, 400, 640)', () => {
  const years = (t) => [1, 2, 3, 4].map((L) => yearsNeeded(L, t));
  assert.deepEqual(years('nomadic'), [188, 375, 625, 1000]);
  assert.deepEqual(years('isolationist'), [120, 240, 400, 640]);
  for (const t of ['expansionist', 'aggressive', 'cooperative']) assert.deepEqual(years(t), [150, 300, 500, 800]);
  assert.equal(yearsNeeded(5, 'nomadic'), null);
  assert.equal(years('nomadic').reduce((a, b) => a + b), 2188);
  assert.equal(years('isolationist').reduce((a, b) => a + b), 1400);
});

test('RULES.md "Levelling up" by type: Isolationist materials x1.25 rounded up', () => {
  const mats = (L) => Object.fromEntries(MATERIAL_IDS.map((id, m) => [id, materialsNeeded(L, 'isolationist')[m]]).filter(([, v]) => v > 0));
  assert.deepEqual(mats(1), { wood: 100, stone: 38, clay: 38 });
  assert.deepEqual(mats(2), { wood: 250, stone: 188, clay: 125, copper: 38 });
  assert.deepEqual(mats(3), { stone: 375, copper: 100, iron: 75, salt: 50 });
  assert.deepEqual(mats(4), { iron: 188, gold: 38, gemstones: 19, spices: 25 });
  assert.deepEqual(materialsNeeded(1, 'nomadic'), [80, 30, 30, 0, 0, 0, 0, 0, 0], 'Nomadic: usual materials');
  assert.equal(materialsNeeded(5, 'isolationist'), null);
});

test('RULES.md "Levelling up": hexes are a share of the land per civ (half up, at least 1); people are so many per hex', () => {
  const both = (land, civs) => [2, 3, 4, 5].map((L) => { const m = levelMinimums(L, land, civs); return [m.hexes, m.pop]; });
  // The RULES.md examples.
  assert.deepEqual(both(64, 3), [[3, 30], [6, 72], [11, 154], [16, 256]], 'Small world');
  assert.deepEqual(both(630, 4), [[24, 240], [47, 564], [79, 1106], [118, 1888]], '30 x 30, 4 civs');
  assert.deepEqual(both(1750, 6), [[44, 440], [88, 1056], [146, 2044], [219, 3504]], 'Large world, 6 civs');
  assert.deepEqual(both(1750, 8), [[33, 330], [66, 792], [109, 1526], [164, 2624]], 'Large world, 8 civs');
  assert.deepEqual(both(100, 1), [[15, 150], [30, 360], [50, 700], [75, 1200]]);
  // Rounding: 15% of 50 is 7.5, half up to 8; 75% of 50 is 37.5 -> 38.
  assert.deepEqual(levelMinimums(2, 100, 2), { hexes: 8, pop: 80 });
  assert.deepEqual(levelMinimums(5, 100, 2), { hexes: 38, pop: 608 });
  assert.equal(levelMinimums(2, 70, 3).hexes, 4, '3.5 rounds up');
  assert.equal(levelMinimums(2, 60, 3).hexes, 3, '3');
  assert.equal(levelMinimums(2, 62, 3).hexes, 3, '3.1 rounds down');
  // Never below 1 hex (and 10 people at level 2).
  assert.deepEqual(levelMinimums(2, 3, 1), { hexes: 1, pop: 10 }, '0.45 is still 1 hex');
  assert.deepEqual(levelMinimums(2, 0, 8), { hexes: 1, pop: 10 });
  assert.deepEqual(levelMinimums(1, 100, 1), { hexes: 0, pop: 0 }, 'level 1 needs nothing');
});

test('RULES.md "Levelling up": land per civ counts every hex that is not deep water, over the civs the game started with', () => {
  const half = makeMap(10, 10, (i) => (i < 50 ? PLAINS : DEEP_WATER));
  const lv = new Levels(half, ['expansionist', 'aggressive']);
  assert.equal(lv.land, 50);
  assert.deepEqual([2, 3, 4, 5].map((L) => lv.minHexes(L)), [4, 8, 13, 19], '15/30/50/75% of 25, half up');
  assert.deepEqual([2, 3, 4, 5].map((L) => lv.minPop(L)), [40, 96, 182, 304]);
  assert.deepEqual([lv.minHexes(1), lv.minPop(1)], [0, 0]);
  const mixed = makeMap(10, 10, (i) => [PLAINS, FOREST, DESERT, HILLS, MOUNTAIN][i % 5]);
  assert.equal(new Levels(mixed, ['expansionist']).land, 100, 'every land terrain counts');
});

test('RULES.md "What levels do": food capacity factor', () => {
  assert.equal(capacityFactor(1, PLAINS, false), 1);
  assert.equal(capacityFactor(2, PLAINS, false), 1.25);
  assert.equal(capacityFactor(2, FOREST, true), 1.25, 'a river hex counts like plains');
  assert.equal(capacityFactor(2, FOREST, false), 1);
  assert.equal(capacityFactor(4, HILLS, false), 1);
  assert.equal(capacityFactor(5, FOREST, false), 1.25);
  assert.equal(capacityFactor(5, PLAINS, false), 1.5);
  assert.equal(capacityFactor(5, DESERT, true), 1.5);
});

// ---- hand-built worlds -------------------------------------------------------------------------

/**
 * groups: [hex, civ, n, { age, coop }]. deposits: { hex: [material ids] }. Levels read the end-of-last-year
 * counts, so cnt is built from the people. Plains everywhere (capacity 60, food full) unless terrain says otherwise.
 */
function world(types, groups, { size = 10, deposits = {}, terrain = () => PLAINS } = {}) {
  const map = makeMap(size, size, terrain);
  for (const [h, mats] of Object.entries(deposits)) for (const m of mats) map.deposits[h] |= 1 << m;
  const people = new People(256);
  for (const [hex, civ, n, t = {}] of groups) {
    for (let k = 0; k < n; k++) {
      const i = people.add(hex, civ, t.age ?? 25, 100, 0);
      people.traits[COOPERATION][i] = t.coop ?? 0.5;
    }
  }
  const levels = new Levels(map, types);
  return { map, people, levels, types, civs: types.length };
}
function step(w, { year = 1, fightWinner = null, hungry = null } = {}) {
  const cnt = new Int32Array(w.map.count * w.civs);
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i]) cnt[w.people.hex[i] * w.civs + w.people.civ[i]]++;
  if (hungry) w.levels.hungry.set(hungry); else w.levels.hungry.fill(0);
  const ev = { levels: [], switches: [], first: false };
  ev.first = w.levels.year(w.people, w.map, year, cnt, fightWinner ?? new Int8Array(w.map.count).fill(-1),
    (c, from, to, y) => ev.levels.push([c, from, to, y]), (from, to) => ev.switches.push([from, to]));
  ev.cnt = cnt;
  return ev;
}
const stockOf = (w, c, m) => w.levels.stock[c * MATERIAL_COUNT + m];
const setStock = (w, c, mats) => { for (const [m, v] of Object.entries(mats)) w.levels.stock[c * MATERIAL_COUNT + Number(m)] = v; };
/** `hexes` hexes from hex 11 on with `total` people spread over them (the first ones get the extra). */
const spread = (hexes, total, civ = 0) => Array.from({ length: hexes }, (_, k) => [11 + k, civ, Math.floor(total / hexes) + (k < total % hexes ? 1 : 0)]);
/** 15 hexes with 10 people each: the minimum for level 2 for one civ on an all-land 10 × 10 map (15% of 100 hexes). */
const l2Land = (civ = 0) => spread(15, 150, civ);

test('RULES.md "Levelling up": every civ starts at level 1 with an empty stockpile', () => {
  const w = world(['expansionist', 'nomadic'], l2Land());
  assert.deepEqual([...w.levels.level], [1, 1]);
  assert.ok(w.levels.stock.every((v) => v === 0));
  assert.equal(w.levels.reached[0 * 6 + 1], 0, 'level 1 reached in year 0');
});

test('RULES.md "Levelling up" 1 to 2: level up exactly when years, people, hexes and materials are all met; materials are spent', () => {
  const ready = () => {
    const w = world(['expansionist'], l2Land());
    setStock(w, 0, { [WOOD]: 85, [STONE]: 30, [CLAY]: 31.5 });
    w.levels.yearsAt[0] = 149; // this year makes 150
    return w;
  };
  let w = ready();
  const ev = step(w, { year: 150 });
  assert.deepEqual(ev.levels, [[0, 1, 2, 150]]);
  assert.equal(w.levels.level[0], 2);
  assert.equal(w.levels.yearsAt[0], 0, 'years at the level start again');
  assert.deepEqual([stockOf(w, 0, WOOD), stockOf(w, 0, STONE), stockOf(w, 0, CLAY)], [5, 0, 1.5], 'only 80 wood, 30 stone, 30 clay spent');
  assert.equal(w.levels.reached[0 * 6 + 2], 150);
  // One short on each requirement.
  w = ready(); w.levels.yearsAt[0] = 148;
  assert.equal(step(w).levels.length, 0, '149 years');
  assert.equal(w.levels.yearsAt[0], 149);
  for (const [name, fix] of [
    ['wood', (x) => setStock(x, 0, { [WOOD]: 79.99 })],
    ['stone', (x) => setStock(x, 0, { [STONE]: 29.99 })],
    ['clay', (x) => setStock(x, 0, { [CLAY]: 29.99 })],
    ['people', (x) => x.people.remove(0)],
    ['hexes', (x) => x.people.hex.fill(24, 140, 150)], // the last ten join the 14th hex: 14 hexes
  ]) {
    w = ready(); fix(w);
    assert.equal(step(w).levels.length, 0, `short of ${name}`);
    assert.equal(w.levels.level[0], 1);
  }
  w = ready();
  assert.equal(step(w).levels.length, 1, '150 people, 15 hexes, 150 years');
});

test('RULES.md "Levelling up": 14 hexes is one short of 15; the civ must hold the hexes (people there), not just own people', () => {
  const w = world(['expansionist'], spread(14, 150));
  setStock(w, 0, { [WOOD]: 80, [STONE]: 30, [CLAY]: 30 });
  w.levels.yearsAt[0] = 500;
  const ev = step(w);
  assert.equal(ev.levels.length, 0, '150 people but 14 hexes');
  w.people.hex[0] = 25;
  assert.equal(step(w, { year: 2 }).levels.length, 1, '15 hexes');
});

test('RULES.md "Levelling up": only one level a year, however much the civ has', () => {
  const w = world(['expansionist'], spread(80, 1600)); // enough land and people for Kingdom (75 hexes, 1200 people)
  setStock(w, 0, { [WOOD]: 1000, [STONE]: 1000, [CLAY]: 1000, [COPPER]: 100, [IRON]: 1000, [SALT]: 100, [GOLD]: 100, [GEMSTONES]: 100, [SPICES]: 100 });
  w.levels.yearsAt[0] = 5000;
  step(w, { year: 1 });
  assert.equal(w.levels.level[0], 2);
});

test('RULES.md "Levelling up": 20 x 20 all-land map, one civ: level 2 needs 60 hexes and 600 people', () => {
  const groups = (hexes, each) => Array.from({ length: hexes }, (_, k) => [21 + k, 0, each]);
  const ready = (hexes, each) => {
    const w = world(['aggressive'], groups(hexes, each), { size: 20 });
    setStock(w, 0, { [WOOD]: 80, [STONE]: 30, [CLAY]: 30 });
    w.levels.yearsAt[0] = 149;
    return w;
  };
  assert.equal(step(ready(60, 10)).levels.length, 1, '600 people on 60 hexes');
  assert.equal(step(ready(60, 9)).levels.length, 0, '540 people');
  assert.equal(step(ready(59, 11)).levels.length, 0, '59 hexes (649 people)');
  const w = ready(60, 10); w.people.remove(0);
  assert.equal(step(w).levels.length, 0, '599 people');
});

test('RULES.md "Levelling up" by type: Nomadic needs 188 years at level 1; Isolationist 120 years and 100 wood, 38 stone, 38 clay', () => {
  const nomad = (years) => {
    const w = world(['nomadic'], l2Land());
    setStock(w, 0, { [WOOD]: 80, [STONE]: 30, [CLAY]: 30 });
    w.levels.yearsAt[0] = years - 1;
    return step(w).levels.length;
  };
  assert.deepEqual([nomad(187), nomad(188)], [0, 1]);
  const iso = (years, wood, stone, clay) => {
    const w = world(['isolationist'], l2Land());
    setStock(w, 0, { [WOOD]: wood, [STONE]: stone, [CLAY]: clay });
    w.levels.yearsAt[0] = years - 1;
    return step(w).levels.length;
  };
  assert.deepEqual([iso(119, 100, 38, 38), iso(120, 100, 38, 38)], [0, 1]);
  assert.equal(iso(120, 99.9, 38, 38), 0);
  assert.equal(iso(120, 100, 37.9, 38), 0);
  assert.equal(iso(120, 100, 38, 37.9), 0);
  assert.equal(iso(120, 80, 30, 30), 0, 'the usual materials are not enough');
  // Higher steps: Nomadic 375 for level 3.
  const w = world(['nomadic'], spread(30, 360));
  w.levels.level[0] = 2;
  setStock(w, 0, { [WOOD]: 200, [STONE]: 150, [CLAY]: 100, [COPPER]: 30 });
  w.levels.yearsAt[0] = 373;
  assert.equal(step(w).levels.length, 0);
  assert.equal(step(w, { year: 2 }).levels.length, 1, '375 years at level 2 (360 people, 30 hexes)');
});

test('RULES.md "Levelling up" 2 to 3 and 3 to 4 and 4 to 5 numbers (people, hexes, materials)', () => {
  const tryStep = (level, groups, stock, years) => {
    const w = world(['expansionist'], groups, { size: 10 });
    w.levels.level[0] = level;
    setStock(w, 0, stock);
    w.levels.yearsAt[0] = years - 1;
    return step(w).levels.length;
  };
  // One civ on 100 land hexes: 30 hexes and 360 people, 50 and 700, 75 and 1200.
  const s3 = { [WOOD]: 200, [STONE]: 150, [CLAY]: 100, [COPPER]: 30 };
  assert.equal(tryStep(2, spread(30, 360), s3, 300), 1);
  assert.equal(tryStep(2, spread(30, 359), s3, 300), 0);
  assert.equal(tryStep(2, spread(29, 360), s3, 300), 0);
  assert.equal(tryStep(2, spread(30, 360), { ...s3, [COPPER]: 29 }, 300), 0);
  assert.equal(tryStep(2, spread(30, 360), s3, 299), 0);
  const s4 = { [STONE]: 300, [COPPER]: 80, [IRON]: 60, [SALT]: 40 };
  assert.equal(tryStep(3, spread(50, 700), s4, 500), 1);
  assert.equal(tryStep(3, spread(50, 699), s4, 500), 0);
  assert.equal(tryStep(3, spread(49, 700), s4, 500), 0);
  assert.equal(tryStep(3, spread(50, 700), { ...s4, [SALT]: 39 }, 500), 0);
  const s5 = { [IRON]: 150, [GOLD]: 30, [GEMSTONES]: 15, [SPICES]: 20 };
  assert.equal(tryStep(4, spread(75, 1200), s5, 800), 1);
  assert.equal(tryStep(4, spread(75, 1199), s5, 800), 0);
  assert.equal(tryStep(4, spread(74, 1200), s5, 800), 0);
  assert.equal(tryStep(4, spread(75, 1200), { ...s5, [SPICES]: 19.9 }, 800), 0);
  assert.equal(tryStep(4, spread(75, 1200), s5, 799), 0);
});

test('RULES.md "Levelling up": a civ with nobody does not count years or level up', () => {
  const w = world(['expansionist', 'expansionist'], l2Land(0));
  w.levels.yearsAt[1] = 1000;
  setStock(w, 1, { [WOOD]: 80, [STONE]: 30, [CLAY]: 30 });
  step(w);
  assert.equal(w.levels.yearsAt[1], 1000);
  assert.equal(w.levels.level[1], 1);
  assert.equal(w.levels.yearsAt[0], 1);
});

test('RULES.md "Falling back": below the level\'s people for 100 years in a row drops one level, keeping the stockpile', () => {
  const w = world(['expansionist'], [[11, 0, 149]]); // level 2 needs 150
  w.levels.level[0] = 2;
  setStock(w, 0, { [WOOD]: 7 });
  for (let y = 1; y <= 99; y++) step(w, { year: y });
  assert.equal(w.levels.level[0], 2);
  assert.equal(w.levels.belowYears[0], 99);
  const ev = step(w, { year: 100 });
  assert.deepEqual(ev.levels, [[0, 2, 1, 100]]);
  assert.equal(w.levels.level[0], 1);
  assert.equal(stockOf(w, 0, WOOD), 7, 'the stockpile is kept');
  assert.equal(w.levels.yearsAt[0], 0, 'years at the level start again');
  assert.equal(w.levels.belowYears[0], 0);
  // Level 1 has no minimum to fall below.
  for (let y = 101; y <= 300; y++) step(w, { year: y });
  assert.equal(w.levels.level[0], 1);
});

test('RULES.md "Falling back": reaching the minimum again resets the count to 0; 150 people is not below 150', () => {
  const w = world(['expansionist'], [[11, 0, 149]]);
  w.levels.level[0] = 2;
  for (let y = 1; y <= 60; y++) step(w, { year: y });
  assert.equal(w.levels.belowYears[0], 60);
  w.people.add(11, 0, 25, 100, 0);
  step(w, { year: 61 });
  assert.equal(w.levels.belowYears[0], 0, '150 people is the minimum itself');
  w.people.remove(39);
  for (let y = 62; y <= 160; y++) step(w, { year: y });
  assert.equal(w.levels.level[0], 2, 'the count started again at 0: 99 years');
  step(w, { year: 161 });
  assert.equal(w.levels.level[0], 1);
});

test('RULES.md "Falling back": the minimum follows the land per civ and is the people needed for the current level', () => {
  const w = world(['expansionist'], [[21, 0, 599]], { size: 20 });
  w.levels.level[0] = 2;
  step(w);
  assert.equal(w.levels.belowYears[0], 1, '600 needed on a 20 × 20 all-land map with one civ');
  const v = world(['expansionist'], [[21, 0, 600]], { size: 20 });
  v.levels.level[0] = 2;
  step(v);
  assert.equal(v.levels.belowYears[0], 0);
  const two = world(['expansionist', 'aggressive'], [[21, 0, 299], [30, 1, 300]], { size: 20 });
  two.levels.level[0] = 2; two.levels.level[1] = 2;
  step(two);
  assert.deepEqual([...two.levels.belowYears], [1, 0], 'two civs: 30 hexes, 300 people each');
  const u = world(['expansionist'], [[21, 0, 359]]);
  u.levels.level[0] = 3;
  step(u);
  assert.equal(u.levels.belowYears[0], 1, 'level 3 needs 360');
  assert.equal(u.levels.minPop(5), 1200);
  assert.equal(u.levels.minHexes(5), 75);
  assert.equal(u.levels.minPop(1), 0);
});

test('RULES.md "Falling back": to climb back it must meet the requirements and spend the materials again', () => {
  const w = world(['expansionist'], l2Land());
  w.levels.level[0] = 2;
  w.levels.yearsAt[0] = 0;
  setStock(w, 0, { [WOOD]: 80, [STONE]: 30, [CLAY]: 30 });
  w.levels.level[0] = 1;
  w.levels.yearsAt[0] = 149;
  step(w);
  assert.equal(w.levels.level[0], 2);
  assert.equal(stockOf(w, 0, WOOD), 0, 'spent again');
});

test('RULES.md "What levels do": per-level effects on birth, shelter, boats and old age', () => {
  const w = world(['expansionist'], l2Land());
  const effects = () => {
    w.levels.setEffects();
    return [w.levels.birthBonus[0], w.levels.shelter[0], w.levels.boats[0], w.levels.oldAgeDelay[0]];
  };
  const out = [];
  for (let L = 1; L <= 5; L++) { w.levels.level[0] = L; out.push(effects()); }
  near(out[0][0], 0); near(out[1][0], 0.005); near(out[2][0], 0.01); near(out[3][0], 0.015); near(out[4][0], 0.02);
  assert.deepEqual(out.map((e) => e[1]), [1, 1, 0.5, 0.5, 0.5]);
  assert.deepEqual(out.map((e) => e[2]), [0, 0, 0, 1, 1]);
  assert.deepEqual(out.map((e) => e[3]), [0, 0, 0, 0, 5]);
});

test('RULES.md "What levels do": hex capacity follows the highest level among civs with people there at the end of last year', () => {
  const w = world(['expansionist', 'aggressive'], [[11, 0, 3], [11, 1, 3], [12, 0, 3], [13, 1, 3]], {
    terrain: (i) => (i === 14 ? FOREST : PLAINS),
  });
  w.levels.level[0] = 2;
  w.levels.level[1] = 1;
  step(w);
  assert.equal(w.map.foodCap[11], 75, 'plains with a level 2 civ present');
  assert.equal(w.map.foodCap[12], 75);
  assert.equal(w.map.foodCap[13], 60, 'only a level 1 civ');
  assert.equal(w.map.foodCap[20], 60, 'an empty hex keeps its level 1 capacity');
  w.levels.level[1] = 5;
  step(w, { year: 2 });
  assert.equal(w.map.foodCap[13], 90, 'plains at level 5: +25% +25%');
  assert.equal(w.map.foodCap[11], 90);
  assert.equal(w.map.foodCap[12], 75, 'only the level 2 civ there');
  assert.equal(w.map.foodCap[20], 60);
  // Level 5 on forest: only +25%.
  const f = world(['expansionist'], [[14, 0, 3]], { terrain: () => FOREST });
  f.levels.level[0] = 5;
  step(f);
  assert.equal(f.map.foodCap[14], 50);
});

test('RULES.md "What levels do": a river hex gets the plains bonus; food above a lowered capacity is lost', () => {
  const w = world(['expansionist'], [[11, 0, 3], [12, 0, 3]], { terrain: () => FOREST });
  w.map.river[11] = 1;
  w.map.foodCap[11] = 70; w.map.food[11] = 70; // river hex: 40 + 30
  w.levels.baseCap[11] = 70;
  w.levels.level[0] = 2;
  step(w);
  assert.equal(w.map.foodCap[11], 87.5, '70 × 1.25');
  assert.equal(w.map.foodCap[12], 40, 'forest without a river');
  // The civ drops back to level 1 and dies out of that hex: capacity falls, the extra food is lost.
  w.map.food[11] = 85;
  w.levels.level[0] = 1;
  step(w, { year: 2 });
  assert.equal(w.map.foodCap[11], 70);
  assert.equal(w.map.food[11], 70);
});

// ---- gathering -------------------------------------------------------------------------------

const adults = (hex, civ, n, t = {}) => [hex, civ, n, t];

test('RULES.md "Gathering": 20% of the adults gather, 0.5 wood a gatherer; the yield goes to the stockpile', () => {
  const w = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [WOOD] } });
  step(w);
  near(stockOf(w, 0, WOOD), 5); // 10 gatherers × 0.5
  assert.equal(w.levels.gatherers[55], 10);
  assert.equal(w.levels.gathered[55], 5);
  assert.equal(w.levels.gatherMask[55], 1 << WOOD);
  step(w, { year: 2 });
  near(stockOf(w, 0, WOOD), 10, 1e-6);
  assert.equal(w.levels.secure[0], 1);
});

test('RULES.md "Gathering": only adults (16 or older) count; gatherers are weighted by 0.5 + cooperation', () => {
  const w = world(['expansionist'], [adults(55, 0, 30, { age: 15 }), adults(55, 0, 20, { age: 16 })], { deposits: { 55: [WOOD] } });
  step(w);
  assert.equal(w.levels.gatherers[55], 4, '20% of the 20 adults');
  const c = world(['expansionist'], [adults(55, 0, 20, { coop: 1 })], { deposits: { 55: [WOOD] } });
  step(c);
  near(c.levels.gatherers[55], 6, 1e-5); // 0.2 × 20 × 1.5
  near(stockOf(c, 0, WOOD), 3, 1e-5);
  const z = world(['expansionist'], [adults(55, 0, 20, { coop: 0 })], { deposits: { 55: [WOOD] } });
  step(z);
  near(z.levels.gatherers[55], 2, 1e-5); // 0.2 × 20 × 0.5
  const kids = world(['expansionist'], [adults(55, 0, 20, { age: 15 })], { deposits: { 55: [WOOD] } });
  step(kids);
  assert.equal(stockOf(kids, 0, WOOD), 0);
});

test('RULES.md "Gathering": Cooperative civs gather 25% more', () => {
  const w = world(['cooperative', 'expansionist'], [adults(55, 0, 50), adults(66, 1, 50)], { deposits: { 55: [WOOD], 66: [WOOD] } });
  step(w);
  near(w.levels.gatherers[55 * 2 + 0], 12.5);
  near(w.levels.gatherers[66 * 2 + 1], 10);
  near(stockOf(w, 0, WOOD), 6.25);
  near(stockOf(w, 1, WOOD), 5);
});

test('RULES.md "Gathering": a deposit gives at most 10 a year (exotic 2.5), and exotic gatherers yield 0.125', () => {
  const w = world(['expansionist'], [adults(55, 0, 200), adults(66, 0, 100)], { deposits: { 55: [WOOD], 66: [GOLD] } });
  w.map.food.fill(1e6);
  step(w);
  assert.equal(w.levels.gatherers[55], 40);
  assert.equal(stockOf(w, 0, WOOD), 10, '40 × 0.5 = 20, capped at 10');
  assert.equal(w.levels.gatherers[66], 20);
  assert.equal(stockOf(w, 0, GOLD), 2.5, '20 × 0.125 = 2.5 exactly the cap');
  const g = world(['expansionist'], [adults(66, 0, 40)], { deposits: { 66: [GOLD] } });
  g.map.food.fill(1e6);
  step(g);
  near(stockOf(g, 0, GOLD), 1, 1e-9);
  const h = world(['expansionist'], [adults(66, 0, 200)], { deposits: { 66: [GEMSTONES] } });
  h.map.food.fill(1e6);
  step(h);
  assert.equal(stockOf(h, 0, GEMSTONES), 2.5);
  const u = world(['expansionist'], [adults(66, 0, 200)], { deposits: { 66: [COPPER] } });
  u.map.food.fill(1e6);
  step(u);
  assert.equal(stockOf(u, 0, COPPER), 10, 'uncommon: 0.5 each, capped at 10');
});

test('RULES.md "Gathering": gatherers split equally among the deposits worked in the hex', () => {
  const w = world(['expansionist'], [adults(55, 0, 60)], { deposits: { 55: [WOOD, STONE, CLAY] } });
  w.map.food.fill(1e6);
  step(w);
  assert.equal(w.levels.gatherers[55], 12);
  for (const m of [WOOD, STONE, CLAY]) near(stockOf(w, 0, m), 2, 1e-6); // 12 / 3 gatherers × 0.5
  assert.equal(w.levels.gatherMask[55], (1 << WOOD) | (1 << STONE) | (1 << CLAY));
});

test('RULES.md "Gathering": a civ works what its next level still needs first; other deposits only if the hex has none of those', () => {
  // Level 1 -> 2 needs wood, stone, clay. Copper and gold are needed by later levels.
  const w = world(['expansionist'], [adults(55, 0, 50), adults(66, 0, 50), adults(77, 0, 50)],
    { deposits: { 55: [WOOD, COPPER, GOLD], 66: [COPPER, GOLD], 77: [SALT] } });
  step(w);
  assert.equal(w.levels.gatherMask[55], 1 << WOOD, 'wood only: the next level needs it');
  assert.equal(w.levels.gatherMask[66], (1 << COPPER) | (1 << GOLD), 'nothing the next level needs: later levels\' materials');
  assert.equal(w.levels.gatherMask[77], 1 << SALT);
  near(stockOf(w, 0, COPPER), 2.5, 1e-6); // 10 gatherers, split in two: 5 × 0.5
  near(stockOf(w, 0, GOLD), 0.625, 1e-6); // 5 × 0.125
});

test('RULES.md "Gathering": a material whose stockpile covers the next level is no longer next; once nothing is needed, nobody gathers', () => {
  const w = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [WOOD, STONE] } });
  setStock(w, 0, { [WOOD]: 80 });
  step(w);
  assert.equal(w.levels.gatherMask[55], 1 << STONE, 'wood is covered for level 2');
  // Level 3: wood is not needed by levels 3 to 5 at all.
  const v = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [WOOD] } });
  v.levels.level[0] = 3;
  step(v);
  assert.equal(stockOf(v, 0, WOOD), 0);
  assert.equal(v.levels.gatherMask[55], 0);
  // A level 2 civ with 200 wood still needs wood for the later... no: level 2 -> 3 needs 200 wood; with 200 it is covered.
  const u = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [WOOD] } });
  u.levels.level[0] = 2;
  setStock(u, 0, { [WOOD]: 200 });
  step(u);
  assert.equal(stockOf(u, 0, WOOD), 200, 'nothing in this hex is still needed');
  setStock(u, 0, { [WOOD]: 199.9 });
  step(u, { year: 2 });
  assert.ok(stockOf(u, 0, WOOD) > 199.9, 'a hundredth short still gathers');
});

test('RULES.md "Gathering": a Kingdom (level 5) gathers nothing', () => {
  const w = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [IRON, GOLD, SPICES, GEMSTONES] } });
  w.levels.level[0] = 5;
  step(w);
  assert.ok(w.levels.stock.every((v) => v === 0));
  const v = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [IRON, GOLD, SPICES, GEMSTONES] } });
  v.levels.level[0] = 4;
  step(v);
  assert.ok(stockOf(v, 0, IRON) > 0, 'but a level 4 civ does');
});

test('RULES.md "Gathering": only the hexes it holds are worked, and only hexes with deposits', () => {
  const w = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 66: [WOOD] } });
  step(w);
  assert.equal(stockOf(w, 0, WOOD), 0);
  assert.ok(w.levels.gatherMask.every((v) => v === 0));
});

test('RULES.md "Gathering": food is secure while at most 20% of the civ went hungry last year', () => {
  const run = (mod) => {
    const w = world(['expansionist'], [adults(55, 0, 50)], { deposits: { 55: [WOOD] } });
    const opt = mod(w) ?? {};
    step(w, opt);
    return [w.levels.secure[0], stockOf(w, 0, WOOD)];
  };
  assert.deepEqual(run(() => {}), [1, 5], 'nobody hungry');
  assert.deepEqual(run(() => ({ hungry: [1] })), [1, 5], 'one hungry person');
  assert.deepEqual(run(() => ({ hungry: [10] })), [1, 5], '10 of 50 is exactly 20%');
  assert.deepEqual(run(() => ({ hungry: [11] })), [0, 0], '11 of 50 is over 20%');
  // Food in the hexes and starvation no longer matter.
  assert.deepEqual(run((w) => { w.map.food[55] = 0; }), [1, 5], 'an empty larder');
  // Only the civ's own people count: a crowd of another civ in the hex changes nothing.
  const w = world(['expansionist', 'aggressive'], [adults(55, 0, 40), adults(55, 1, 200)], { deposits: { 55: [WOOD] } });
  step(w, { hungry: [8, 100] });
  assert.deepEqual([...w.levels.secure], [1, 0], '8 of 40 is 20%; 100 of 200 is 50%');
});

test('RULES.md "Shared hexes": a deposit\'s yield is split among the civs working it by their people in the hex', () => {
  const w = world(['expansionist', 'aggressive'], [adults(55, 0, 30), adults(55, 1, 10)], { deposits: { 55: [WOOD] } });
  w.map.food[55] = 1e6;
  step(w);
  // Gatherers 6 and 2: 4 wood in all, split 30 : 10.
  near(stockOf(w, 0, WOOD), 3, 1e-6);
  near(stockOf(w, 1, WOOD), 1, 1e-6);
  assert.equal(w.levels.gatherers[55 * 2], 6);
  assert.equal(w.levels.gatherers[55 * 2 + 1], 2);
  // The cap is for all civs together.
  const c = world(['expansionist', 'aggressive'], [adults(55, 0, 200), adults(55, 1, 200)], { deposits: { 55: [WOOD] } });
  c.map.food[55] = 1e6;
  step(c);
  near(stockOf(c, 0, WOOD) + stockOf(c, 1, WOOD), 10, 1e-6);
  near(stockOf(c, 0, WOOD), 5, 1e-6);
  // Split by all their people there, not just the gatherers: 20 children count as people.
  const k = world(['expansionist', 'aggressive'], [adults(55, 0, 20), adults(55, 0, 20, { age: 5 }), adults(55, 1, 20)], { deposits: { 55: [WOOD] } });
  k.map.food[55] = 1e6;
  step(k);
  near(stockOf(k, 0, WOOD), 4 * (40 / 60), 1e-6); // 4 wood from 4 + 4 gatherers, split 40 : 20 by people
  near(stockOf(k, 1, WOOD), 4 * (20 / 60), 1e-6);
});

test('RULES.md "Shared hexes": last year\'s fight winner takes the whole yield, whether or not it gathered', () => {
  const w = world(['expansionist', 'aggressive'], [adults(55, 0, 30), adults(55, 1, 10)], { deposits: { 55: [WOOD] } });
  w.map.food[55] = 1e6;
  const fw = new Int8Array(w.map.count).fill(-1);
  fw[55] = 1;
  step(w, { fightWinner: fw });
  near(stockOf(w, 1, WOOD), 4, 1e-6);
  assert.equal(stockOf(w, 0, WOOD), 0);
  assert.equal(w.levels.gathered[55 * 2 + 1], 4);
  // A winner that is not secure (it did not gather at all) still takes the yield.
  const v = world(['expansionist', 'aggressive'], [adults(55, 0, 30), adults(55, 1, 10)], { deposits: { 55: [WOOD] } });
  v.map.food[55] = 1e6;
  step(v, { fightWinner: fw, hungry: [0, 3] });
  near(stockOf(v, 1, WOOD), 3, 1e-6);
  assert.equal(v.levels.gatherers[55 * 2 + 1], 0);
  assert.equal(stockOf(v, 0, WOOD), 0);
  // In a hex with no fight the winner array is ignored.
  const none = new Int8Array(v.map.count).fill(-1);
  const u = world(['expansionist', 'aggressive'], [adults(55, 0, 30), adults(55, 1, 10)], { deposits: { 55: [WOOD] } });
  u.map.food[55] = 1e6;
  step(u, { fightWinner: none });
  assert.ok(stockOf(u, 0, WOOD) > 0 && stockOf(u, 1, WOOD) > 0);
});

// ---- absorbing --------------------------------------------------------------------------------

/** World with civ `k` (a Kingdom) in every neighbour of hex `h` (5 people each) and the given extra groups. */
function ring(types, h, k, extra, opts = {}) {
  const map = makeMap(10, 10, opts.terrain ?? (() => PLAINS));
  const groups = [];
  for (let d = 0; d < 6; d++) {
    const t = map.neighbours[h * 6 + d];
    if (t >= 0 && map.terrain[t] !== DEEP_WATER && !(opts.skip ?? []).includes(t)) groups.push([t, k, 5]);
  }
  const w = world(types, [...groups, ...extra], opts);
  w.levels.level[k] = 5;
  return w;
}

test('RULES.md "Enclosed hexes" and "Absorbing": every person of other civs in a hex a Kingdom encloses joins it at once', () => {
  const w = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 7), adults(77, 1, 5)]);
  const ev = step(w);
  assert.equal(w.levels.inside[55], 0, 'every land neighbour holds the Kingdom');
  assert.equal(w.levels.inside[77], -1);
  assert.equal(ev.switches.length, 7);
  assert.ok(ev.switches.every(([f, t]) => f === 1 && t === 0));
  const civ1 = [];
  for (let i = 0; i < w.people.high; i++) if (w.people.civ[i] === 1) civ1.push(w.people.hex[i]);
  assert.deepEqual(civ1, [77, 77, 77, 77, 77], 'people outside the enclosure stay');
  // The hex itself need not hold the Kingdom, and size does not matter: a crowd bigger than the Kingdom joins too.
  const big = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 100)]);
  assert.equal(step(big).switches.length, 100);
});

test('RULES.md "Enclosed hexes": one land neighbour without the Kingdom, no enclosure; sea neighbours do not count', () => {
  const map = makeMap(10, 10, () => PLAINS);
  const gap = map.neighbours[55 * 6 + 2];
  const w = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 7)], { skip: [gap] });
  assert.equal(step(w).switches.length, 0);
  assert.equal(w.levels.inside[55], -1);
  // The same gap made deep water: the five land neighbours are enough.
  const wet = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 7)], { terrain: (i) => (i === gap ? DEEP_WATER : PLAINS) });
  assert.equal(step(wet).switches.length, 7);
  assert.equal(wet.levels.inside[55], 0);
  // A land hex with no land neighbour is never enclosed.
  const isle = world(['expansionist', 'aggressive'], [adults(55, 0, 5), adults(55, 1, 5)], { terrain: (i) => (i === 55 ? PLAINS : DEEP_WATER) });
  isle.levels.level[0] = 5;
  assert.equal(step(isle).switches.length, 0);
  assert.equal(isle.levels.inside[55], -1);
});

test('RULES.md "Absorbing": only Kingdoms enclose; other Kingdoms\' people are never absorbed', () => {
  const w = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 7)]);
  w.levels.level[0] = 4;
  assert.equal(step(w).switches.length, 0, 'level 4 encloses nothing');
  assert.ok(w.levels.inside.every((v) => v === -1));
  const k = ring(['expansionist', 'aggressive', 'cooperative'], 55, 0, [adults(55, 1, 7), adults(55, 2, 4), adults(88, 1, 50)]);
  k.levels.level[1] = 5;
  const ev = step(k);
  assert.deepEqual(ev.switches, [[2, 0], [2, 0], [2, 0], [2, 0]], 'only the civ that is not a Kingdom');
});

test('RULES.md "Enclosed hexes": enclosed by two Kingdoms, the one with the most people takes it (tie: lower civ number)', () => {
  // Civ 0 and civ 1 both hold every neighbour of 55.
  const both = (extra0, extra1) => {
    const map = makeMap(10, 10, () => PLAINS);
    const groups = [];
    for (let d = 0; d < 6; d++) { const t = map.neighbours[55 * 6 + d]; groups.push([t, 0, 5], [t, 1, 5]); }
    const w = world(['expansionist', 'aggressive', 'cooperative'], [...groups, adults(88, 0, extra0), adults(99, 1, extra1), adults(55, 2, 6)]);
    w.levels.level[0] = 5; w.levels.level[1] = 5;
    const ev = step(w);
    return [w.levels.inside[55], ev.switches.filter(([f]) => f === 2).map(([, t]) => t)];
  };
  assert.deepEqual(both(1, 2), [1, [1, 1, 1, 1, 1, 1]], 'civ 1 has more people');
  assert.deepEqual(both(2, 2), [0, [0, 0, 0, 0, 0, 0]], 'a tie: the lower civ number');
});

test('RULES.md "Absorbing": the people absorbed keep everything else and change only civ', () => {
  const w = ring(['expansionist', 'aggressive'], 55, 0, [adults(55, 1, 4, { coop: 0.9 })]);
  const first = w.people.high - 4;
  step(w);
  for (let i = first; i < first + 4; i++) {
    assert.equal(w.people.civ[i], 0);
    assert.equal(w.people.hex[i], 55);
    assert.equal(w.people.age[i], 25);
    assert.equal(w.people.traits[COOPERATION][i], Math.fround(0.9));
  }
});

// ---- boats -------------------------------------------------------------------------------------

test('RULES.md "Boats": buildReach(map, 3, 1) adds land one water hex away, never water or two water hexes in a row', () => {
  const T = [PLAINS, PLAINS, DEEP_WATER, PLAINS, PLAINS, DEEP_WATER, DEEP_WATER, PLAINS, PLAINS];
  const map = makeMap(9, 1, (i) => T[i]);
  const list = (r, h) => [...r.targets.slice(r.offsets[h], r.offsets[h + 1])];
  const dry = buildReach(map, 3);
  const boat = buildReach(map, 3, 1);
  assert.deepEqual(list(dry, 1), [0]);
  assert.deepEqual(list(boat, 1), [0, 3, 4], 'across the strait: 1 + 1 = 2 and 1 + 1 + 1 = 3');
  assert.deepEqual(list(boat, 4), [1, 3], 'from 4: 3 (cost 1), 1 across the strait (cost 3); 0 would cost 4');
  assert.deepEqual(list(boat, 3), [0, 1, 4], '0 costs 1 + 1 + 1');
  // Two water hexes in a row cannot be crossed.
  assert.ok(!list(boat, 4).includes(7));
  assert.ok(!list(boat, 8).includes(4));
  assert.deepEqual(list(boat, 8), [7]);
  for (let h = 0; h < map.count; h++) for (const t of list(boat, h)) assert.notEqual(map.terrain[t], DEEP_WATER, 'never water');
  assert.deepEqual(list(boat, 2), [], 'water hexes have no reach');
  // Boats only add: everything reachable on foot is still reachable.
  for (let h = 0; h < map.count; h++) for (const t of list(dry, h)) assert.ok(list(boat, h).includes(t));
});

test('RULES.md "Boats": the crossing costs 1 movement point on top of the land beyond; costly land beyond is out of reach', () => {
  const T = [PLAINS, DEEP_WATER, MOUNTAIN, PLAINS, DEEP_WATER, FOREST, PLAINS];
  const map = makeMap(7, 1, (i) => T[i]);
  const list = (r, h) => [...r.targets.slice(r.offsets[h], r.offsets[h + 1])];
  const boat = buildReach(map, 3, 1);
  assert.deepEqual(list(boat, 0), [], 'water 1 + mountain 3 = 4 is too far');
  const b2 = buildReach(map, 3, 1);
  assert.deepEqual(list(b2, 3), [2, 5], 'the mountain on foot (3), and across the water: 1 + forest 2 = 3, then plains would be 4');
  const n5 = buildReach(map, 5, 1);
  assert.deepEqual(list(n5, 0), [2, 3], 'five movement points: 1 + 3 = 4, then plains 5');
  // A costlier boat step: with 1.5 points the strait costs more.
  const slow = buildReach(makeMap(3, 1, (i) => [PLAINS, DEEP_WATER, PLAINS][i]), 2, 1.5);
  assert.deepEqual([...slow.targets.slice(slow.offsets[0], slow.offsets[1])], [], '1.5 + 1 = 2.5 > 2');
});

test('RULES.md "Boats": a civ gets boats at level 4 (Simulation.onLevel) and loses them when it falls back', () => {
  const sim = new Simulation({ seed: 'boats', size: 14, civCount: 2, water: 0.4 });
  const rules = sim.migrationRules;
  assert.deepEqual([...rules.boats], [0, 0]);
  const before = rules.reach[0];
  sim.onLevel(0, 3, 4, 100);
  assert.equal(rules.boats[0], 1);
  assert.equal(rules.boats[1], 0);
  assert.notEqual(rules.reach[0], before);
  assert.ok(rules.reach[0].targets.length >= before.targets.length);
  sim.onLevel(0, 4, 3, 300);
  assert.equal(rules.boats[0], 0);
  assert.equal(rules.reach[0], before, 'back to the shared table');
  // Nomadic keeps its 5 movement points with boats too.
  const nm = new Simulation({ seed: 'boats', size: 14, civCount: 1, civTypes: ['nomadic'] });
  nm.onLevel(0, 3, 4, 10);
  assert.equal(nm.migrationRules.movePoints[0], 5);
  assert.ok(nm.migrationRules.reach[0].targets.length >= buildReach(nm.map, 5).targets.length);
});

// ---- Simulation: stats, end condition, determinism --------------------------------------------

test('stats expose level, name, food security, progress and requirements from the land per civ', () => {
  const sim = new Simulation({ seed: 'lvstats', size: 20, civCount: 2, civTypes: ['nomadic', 'isolationist'] });
  const [a, b] = sim.stats().civs;
  const m = levelMinimums(2, sim.levels.land, 2);
  assert.equal(sim.levels.land, sim.landHexes);
  assert.deepEqual([a.level, a.levelName, b.next.level, b.next.levelName], [1, 'Foragers', 2, 'Farmers']);
  assert.deepEqual([a.next.years, a.next.pop, a.next.hexes], [188, m.pop, m.hexes]);
  assert.deepEqual([b.next.years, b.next.pop, b.next.hexes], [120, m.pop, m.hexes]);
  assert.equal(b.next.materials.wood, 100);
  assert.equal(a.next.materials.wood, 80);
  assert.deepEqual(a.reached, [0, null, null, null, null]);
  assert.equal(a.stockpile.wood, 0);
});

/** A sim with no people or hex minimums, so a short run can reach Kingdom. */
function kingdomSim(extra = {}) {
  const sim = new Simulation({ seed: 'kingdom', size: 10, civCount: 2, startPop: 20, ...extra });
  sim.levels.minHex.fill(0); sim.levels.minPeople.fill(0);
  return sim;
}
const readyForKingdom = (sim, civ) => {
  sim.levels.level[civ] = 4;
  sim.levels.yearsAt[civ] = 10000;
  const need = materialsNeeded(4, sim.civTypes[civ]);
  need.forEach((v, m) => { sim.levels.stock[civ * MATERIAL_COUNT + m] = v; });
};

test('RULES.md "End of the game": First to Kingdom ends the game in the year the first civ reaches level 5; that civ wins', () => {
  const sim = kingdomSim({ endConditions: ['kingdom'] });
  sim.tick(3);
  assert.equal(sim.finished, false);
  readyForKingdom(sim, 1);
  sim.tick(1);
  assert.equal(sim.levels.level[1], 5);
  assert.equal(sim.finished, true);
  assert.equal(sim.endKind, 'kingdom');
  assert.equal(sim.winner, 1);
  assert.equal(sim.endReason, 'Civ 2 became the first Kingdom');
  assert.equal(sim.tickCount, 4);
  assert.deepEqual(sim.stats().firstKingdom, { civ: 1, year: 4 });
  assert.equal(sim.stats().civs[1].reached[4], 4);
});

test('First to Kingdom is off unless ticked, but the Kingdom is still recorded', () => {
  const sim = kingdomSim();
  readyForKingdom(sim, 0);
  sim.tick(2);
  assert.equal(sim.levels.level[0], 5);
  assert.equal(sim.finished, false);
  assert.deepEqual(sim.stats().firstKingdom, { civ: 0, year: 1 });
});

test('RULES.md "First to Kingdom": two civs in the same year: the one with more people at the end of last year, then the lower civ number', () => {
  const sim = kingdomSim({ endConditions: ['kingdom'], civCount: 3 });
  sim.people.remove(25); // civ 1 has 19 people, civ 0 and 2 have 20
  sim.recordYear();
  readyForKingdom(sim, 1); readyForKingdom(sim, 0); readyForKingdom(sim, 2);
  sim.tick(1);
  assert.equal(sim.winner, 0, 'civs 0 and 2 tie on people, 1 has fewer: the lower number');
  const t = kingdomSim({ endConditions: ['kingdom'], civCount: 3 });
  t.people.remove(0); t.recordYear();
  readyForKingdom(t, 0); readyForKingdom(t, 2);
  t.tick(1);
  assert.equal(t.winner, 2, 'civ 2 has more people than civ 0');
  assert.equal(t.levels.kingdomCiv, 2);
});

test('RULES.md "End of the game": order in one year: extinction, last civ, First to Kingdom, dominance, year limit', () => {
  const sim = kingdomSim({ endConditions: ['kingdom', 'years'], endTicks: 10 });
  readyForKingdom(sim, 0);
  sim.tick(1);
  assert.equal(sim.endKind, 'kingdom');
  const both = kingdomSim({ endConditions: ['kingdom', 'years'], endTicks: 10 });
  both.tick(9);
  readyForKingdom(both, 0);
  both.tick(1);
  assert.equal(both.tickCount, 10);
  assert.equal(both.endKind, 'kingdom', 'kingdom is checked before the year limit');
  const last = kingdomSim({ endConditions: ['kingdom', 'lastCiv'] });
  readyForKingdom(last, 0);
  for (let i = 0; i < last.people.high; i++) if (last.people.civ[i] === 1) last.people.remove(i);
  last.tick(1);
  assert.equal(last.endKind, 'lastCiv', 'last civ standing is checked before First to Kingdom');
});

test('levels, stockpiles and hashes are deterministic: same params and seed give the same hash and stockpile', () => {
  const run = () => {
    const sim = new Simulation({ seed: 'lvdet', size: 16, civCount: 4, startPop: 60, civTypes: ['cooperative', 'isolationist', 'nomadic', 'expansionist'] });
    sim.tick(400);
    return [sim.hash(), [...sim.levels.stock], [...sim.levels.level]];
  };
  assert.deepEqual(run(), run());
});

test('a seeded run gathers materials: stockpiles only ever grow until they are spent on a level', () => {
  const sim = new Simulation({ seed: 'gatherrun', size: 12, civCount: 2, startPop: 40, water: 0.2 });
  let prev = sim.levels.stock.slice();
  let grew = false;
  for (let y = 0; y < 300; y++) {
    sim.tick();
    const now = sim.levels.stock;
    for (let c = 0; c < 2; c++) {
      const levelled = sim.levels.yearsAt[c] === 0 && y > 0;
      for (let m = 0; m < MATERIAL_COUNT; m++) {
        const i = c * MATERIAL_COUNT + m;
        if (!levelled) assert.ok(now[i] >= prev[i] - 1e-9, `year ${y} civ ${c} ${MATERIAL_IDS[m]}`);
        if (now[i] > prev[i]) grew = true;
      }
    }
    prev = now.slice();
  }
  assert.ok(grew, 'civs gathered something');
});

test('inspect lists who gathered in a hex this year with materials, gatherers and amount', () => {
  const sim = new Simulation({ seed: 'inspectgather', size: 12, civCount: 1, startPop: 60 });
  sim.tick(40);
  let found = null;
  for (let h = 0; h < sim.map.count && !found; h++) {
    const d = sim.inspect(h % 12, Math.floor(h / 12));
    if (d.gathering.length) found = d;
  }
  assert.ok(found, 'someone gathered');
  const g = found.gathering[0];
  assert.equal(g.civ, 0);
  assert.ok(g.materials.length >= 1 && g.materials.every((m) => found.deposits.includes(m)));
  assert.ok(g.gatherers > 0 && g.amount > 0);
});
