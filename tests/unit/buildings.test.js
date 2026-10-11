// RULES.md "Buildings and wonders" and the edits it caused elsewhere (A year, Migration, Fights, Switching civ,
// Gathering, Levelling up, What levels do, Statistics, End screen), on hand-built hexes and small seeded worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Buildings, ERAS, BUILDING_COST, BUILDINGS, WONDERS, WONDER_RULES, MAX_SHARE, SITE, EFFECT_KEYS, NONE, BUILDING, STANDING, COMMITTED,
  buildingOf, effectText, materialText, reduce,
} from '../../src/sim/buildings.js';
import { Levels, REQUIREMENTS } from '../../src/sim/levels.js';
import { Contact } from '../../src/sim/contact.js';
import { Records, CAPTURES_LOGGED, chronicle } from '../../src/sim/records.js';
import { Simulation } from '../../src/sim/simulation.js';
import { LocalSimHost } from '../../src/host/simHost.js';
import { eat, deaths, births, hungryLoss } from '../../src/sim/life.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { buildReach } from '../../src/sim/migration.js';
import { CIV_TYPES, CIV_TYPE_NAMES } from '../../src/sim/civTypes.js';
import { MATERIAL_IDS, MATERIAL_COUNT, MATERIAL_NAMES, WOOD, STONE, CLAY, COPPER, GOLD } from '../../src/sim/materials.js';
import { PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA, DEEP_WATER, FOOD_CAPACITY } from '../../src/sim/terrain.js';
import { COOPERATION, STRENGTH, AGGRESSION } from '../../src/sim/traits.js';
import { eventText } from '../../src/ui/endScreen.js';
import { buildingsSection, eraFacts, buildingFacts } from '../../src/ui/howText.js';
import { makeMap, scratch } from './helpers.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const near = (got, want, eps = 1e-9) => assert.ok(Math.abs(got - want) <= eps, `${got} vs ${want}`);
/** A material list (MATERIAL_IDS order) from { wood: 40, … }. */
const M = (o) => MATERIAL_IDS.map((id) => o[id] ?? 0);

// ---- a Levels world driven by hand: people per civ per hex are set directly ---------------------------------------

/**
 * types: civ types. Levels reads the end-of-last-year counts, so w.put(hex, civ, n) sets them; w.add() also
 * creates real adults (for gathering). w.step() is one year of Levels.year, collecting level-ups and building events.
 */
function mk(types, { size = 10, terrain = () => PLAINS } = {}) {
  const map = makeMap(size, size, terrain);
  const people = new People(512);
  const lv = new Levels(map, types);
  const civs = types.length;
  const w = {
    map, people, lv, bd: lv.buildings, civs, year: 0, ev: [],
    cnt: new Int32Array(map.count * civs), hostile: new Int32Array(civs), beats: new Int32Array(civs),
    fw: new Int8Array(map.count).fill(-1),
  };
  w.put = (h, c, n) => { w.cnt[h * civs + c] = n; return w; };
  w.add = (h, c, n, age = 25) => {
    for (let k = 0; k < n; k++) { const i = people.add(h, c, age, 100, 0); people.traits[COOPERATION][i] = 0.5; }
    w.cnt[h * civs + c] += n;
    return w;
  };
  w.give = (c, mats) => { for (const [id, v] of Object.entries(mats)) lv.stock[c * MATERIAL_COUNT + MATERIAL_IDS.indexOf(id)] += v; return w; };
  w.set = (c, id, v) => { lv.stock[c * MATERIAL_COUNT + MATERIAL_IDS.indexOf(id)] = v; return w; };
  w.stock = (c, id) => lv.stock[c * MATERIAL_COUNT + MATERIAL_IDS.indexOf(id)];
  w.stockList = (c) => Array.from(lv.stock.subarray(c * MATERIAL_COUNT, (c + 1) * MATERIAL_COUNT));
  w.step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      w.year++;
      lv.hungry.fill(0);
      lv.year(people, map, w.year, w.cnt, w.fw, (c, f, t, y) => w.ev.push(['level', c, f, t, y]), null, w.hostile, w.beats,
        (kind, c, e, y, o) => w.ev.push([kind, c, e, y, o]));
    }
    return w;
  };
  w.events = (kind) => w.ev.filter((e) => e[0] === kind);
  /** Civ c's era building is standing in `hex` (an earlier or later era than its level is fine). */
  w.stand = (c, era, hex) => { w.bd.state[c * ERAS + era - 1] = STANDING; w.bd.hex[c * ERAS + era - 1] = hex; w.bd.totals(); lv.setEffects(); return w; };
  return w;
}
/** Odd columns of rows 1, 3, 5, …: no two are neighbours, so each hex's safety and score stand alone. */
const SPARSE = [11, 13, 15, 17, 19, 31, 33, 35, 37, 39, 51, 53, 55, 57, 59, 71, 73, 75, 77, 79];
const sparse = (n) => SPARSE.slice(0, n);
const nb = (w, h, d) => w.map.neighbours[h * 6 + d];

// ---- a Contact scene with building bonuses --------------------------------------------------------------------------

const FIGHT_HEX = 12; // the middle of a 5 × 5 map
/**
 * groups: [civ, n] in FIGHT_HEX. eff: { civ: { kind: value } } building bonuses. last: the end-of-last-year counts ([civ, n]
 * in FIGHT_HEX; default the present ones: the holder is then the bigger side). strengths/coop: per civ; agg: everyone's aggression.
 * Civ 0 is Aggressive (always fights) and the rest Cooperative unless types say otherwise.
 */
function fight(groups, { terrain = PLAINS, eff = {}, last = null, strengths = null, coop = null, agg = 0.5, types = null } = {}) {
  const civs = Math.max(...groups.map(([c]) => c)) + 1;
  const kinds = types ?? Array.from({ length: civs }, (_, c) => (c === 0 ? 'aggressive' : 'cooperative'));
  const map = makeMap(5, 5, () => terrain);
  map.foodCap.fill(1e6); map.food.fill(1e6);
  const people = new People(32768);
  for (const [c, n] of groups) {
    for (let k = 0; k < n; k++) {
      const i = people.add(FIGHT_HEX, c, 25, 100, 0);
      people.traits[AGGRESSION][i] = agg;
      people.traits[STRENGTH][i] = strengths ? strengths[c] : 0.5;
      people.traits[COOPERATION][i] = coop ? coop[c] : 0.5;
    }
  }
  const contact = new Contact(map, kinds);
  const bonus = {};
  for (const k of EFFECT_KEYS) bonus[k] = new Float64Array(civs);
  for (const [c, o] of Object.entries(eff)) for (const [k, v] of Object.entries(o ?? {})) bonus[k][c] = v;
  contact.eff = bonus;
  const lastPop = new Int32Array(map.count * civs);
  for (const [c, n] of last ?? groups) lastPop[FIGHT_HEX * civs + c] = n;
  const out = { deaths: [], fights: [], switches: [], n: 0 };
  out.n = contact.year(people, map, lastPop, 100, new Rng('fw'), new Rng('fs'),
    (slot, cause) => out.deaths.push({ civ: people.civ[slot], cause }),
    (hex, attacker, defender, holder, winner, d) => out.fights.push({ hex, attacker, defender, holder, winner, deaths: d }),
    (from, to) => out.switches.push([from, to]));
  return out;
}

// ---- the numbers ------------------------------------------------------------------------------------------------------

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

test('RULES.md "Era buildings": costs and years of work per era equal the table; people per hex are the unlocked level\'s', () => {
  const rows = table('### Era buildings');
  assert.equal(rows.length, 4);
  rows.forEach((r, e) => {
    assert.deepEqual([...BUILDING_COST[e].materials], parseMaterials(r[2]), `era ${e + 1} materials`);
    assert.equal(BUILDING_COST[e].years, Number(r[3]));
    assert.equal(new Levels(makeMap(4, 4, () => PLAINS), ['expansionist']).perHexFor(e + 1), Number(r[4]));
    assert.equal(REQUIREMENTS[e].perHex, Number(r[4]));
  });
  assert.deepEqual([...BUILDING_COST[0].materials], M({ wood: 40, stone: 30, clay: 15 }));
  assert.deepEqual([...BUILDING_COST[1].materials], M({ wood: 100, stone: 80, clay: 50, copper: 15 }));
  assert.deepEqual([...BUILDING_COST[2].materials], M({ stone: 150, copper: 40, iron: 30, salt: 20 }));
  assert.deepEqual([...BUILDING_COST[3].materials], M({ iron: 80, gold: 15, gemstones: 8, spices: 10 }));
  assert.deepEqual(BUILDING_COST.map((c) => c.years), [30, 50, 80, 120]);
  assert.equal(ERAS, 4);
});

test('RULES.md "Wonders": materials, years and bonuses per era equal the table', () => {
  const rows = table('### Wonders');
  assert.equal(rows.length, 4);
  rows.forEach((r, e) => {
    assert.equal(r[1].replaceAll('*', ''), WONDERS[e].name);
    assert.deepEqual([...WONDERS[e].materials], parseMaterials(r[2]));
    assert.equal(WONDERS[e].years, Number(r[3]));
  });
  assert.deepEqual(WONDERS.map((w) => w.years), [60, 100, 150, 200]);
  assert.deepEqual(WONDERS.map((w) => w.name), ['Sun Circle', 'Hanging Gardens', 'Great Wall', 'Grand Library']);
  assert.deepEqual({ ...WONDERS[0].effects }, { birth: 0.01, loyalty: 0.5 });
  assert.deepEqual({ ...WONDERS[1].effects }, { food: 0.3 });
  assert.deepEqual({ ...WONDERS[2].effects }, { defence: 1, strength: 0.5 });
  assert.deepEqual({ ...WONDERS[3].effects }, { gather: 1, years: 0.3 });
});

test('RULES.md "Wonders" and "Bonuses together": decision, giving-up and cap numbers', () => {
  assert.deepEqual({ ...WONDER_RULES.lean }, { expansionist: 0.75, aggressive: 0.8, cooperative: 1.2, isolationist: 1.3, nomadic: 1 });
  assert.equal(WONDER_RULES.landCap, 1.5);
  assert.equal(WONDER_RULES.commitScore, 1);
  assert.equal(WONDER_RULES.checkYears, 25);
  assert.equal(WONDER_RULES.giveUpSafety, 0.5);
  assert.equal(WONDER_RULES.giveUpYears, 200);
  assert.equal(WONDER_RULES.refund, 0.5);
  assert.equal(MAX_SHARE, 0.75);
  assert.deepEqual({ ...SITE }, { neighbourWeight: 0.2, sharedFactor: 0.5, threatFactor: 0.25 });
});

test('RULES.md "Era buildings": every type\'s four buildings and their bonuses', () => {
  const E = (o) => o;
  const want = {
    expansionist: [E({ birth: 0.0025 }), E({ food: 0.05 }), E({ land: 0.1 }), E({ food: 0.05, birth: 0.0025 })],
    aggressive: [E({ strength: 0.25, warLoss: 0.2 }), E({ warLoss: 0.5 }), E({ strength: 0.25 }), E({ defence: 0.5, strength: 0.15 })],
    cooperative: [E({ gather: 0.2 }), E({ loyalty: 0.5, attract: 0.5 }), E({ cost: 0.15, defence: 0.25 }), E({ birth: 0.005, attract: 0.5 })],
    isolationist: [E({ oldAge: 4 }), E({ foodHarsh: 0.25 }), E({ defence: 0.75 }), E({ gather: 0.3, years: 0.1 })],
    nomadic: [E({ hunger: 0.25 }), E({ gatherRare: 0.3 }), E({ move: 1, strength: 0.1 }), E({ strength: 0.15, hunger: 0.25 })],
  };
  assert.deepEqual(Object.keys(BUILDINGS).sort(), [...CIV_TYPES].sort());
  for (const type of CIV_TYPES) {
    assert.equal(BUILDINGS[type].length, 4);
    BUILDINGS[type].forEach((b, e) => assert.deepEqual({ ...b.effects }, want[type][e], `${type} era ${e + 1}`));
  }
  const names = {
    expansionist: ['Trailhead Lodge', 'Granary', 'Road Network', 'Colonial Office'],
    aggressive: ['War Totem', 'Barracks', 'Forge', 'Citadel'],
    cooperative: ['Council Fire', 'Market', 'Guild Hall', 'Senate'],
    isolationist: ['Ancestor Shrine', 'Terraces', 'Walls', 'Observatory'],
    nomadic: ['Tent Circle', 'Caravanserai', 'Horse Paddock', "Khan's Court"],
  };
  for (const type of CIV_TYPES) assert.deepEqual(BUILDINGS[type].map((b) => b.name), names[type]);
  assert.equal(buildingOf('nomadic', 3).name, 'Horse Paddock');
  assert.equal(buildingOf('nomadic', 5), null);
  assert.equal(buildingOf('nope', 1), null);
});

test('RULES.md "Era buildings": Isolationist civs pay the same for a building (no 25% more)', () => {
  const w = mk(['isolationist', 'expansionist']);
  const out = new Float64Array(MATERIAL_COUNT);
  for (let e = 1; e <= 4; e++) {
    assert.deepEqual([...w.bd.buildingCost(0, e, out)], [...BUILDING_COST[e - 1].materials]);
    assert.deepEqual([...w.bd.buildingCost(1, e, out)], [...BUILDING_COST[e - 1].materials]);
  }
});

// ---- starting ---------------------------------------------------------------------------------------------------

test('RULES.md "Starting": the building starts in the first year the stockpile holds the cost; the materials are taken at once', () => {
  const w = mk(['expansionist']).put(45, 0, 10);
  w.give(0, { wood: 40, stone: 29.99, clay: 15 }).step();
  assert.equal(w.bd.state[0], NONE, 'a hundredth of stone short');
  assert.deepEqual(w.stockList(0), M({ wood: 40, stone: 29.99, clay: 15 }), 'nothing taken');
  w.set(0, 'stone', 30).set(0, 'wood', 41.5).step();
  assert.equal(w.bd.state[0], BUILDING);
  assert.equal(w.bd.hex[0], 45);
  assert.equal(w.bd.work[0], 0, 'work begins the next year');
  near(w.stock(0, 'wood'), 1.5); near(w.stock(0, 'stone'), 0, 1e-9); near(w.stock(0, 'clay'), 0);
  // Not started twice: more materials stay in the stockpile while it is being built.
  w.give(0, { wood: 100, stone: 100, clay: 100 }).step();
  near(w.stock(0, 'wood'), 101.5);
  assert.equal(w.bd.work[0], 1);
});

test('RULES.md "Starting": a civ at level 2 builds its era 2 building, at the era 2 cost', () => {
  const w = mk(['expansionist']).put(45, 0, 12);
  w.lv.level[0] = 2;
  w.give(0, { wood: 100, stone: 80, clay: 50, copper: 14.9 }).step();
  assert.equal(w.bd.state[1], NONE);
  assert.equal(w.bd.state[0], NONE, 'the era 1 building is not built after the civ has moved on');
  w.set(0, 'copper', 15).step();
  assert.equal(w.bd.state[1], BUILDING);
  assert.deepEqual(w.stockList(0).map((v) => Math.round(v * 1000) / 1000), M({}));
});

test('RULES.md "Starting": a Kingdom builds nothing, and a civ with nobody builds nothing', () => {
  const k = mk(['expansionist']).put(45, 0, 20);
  k.lv.level[0] = 5;
  k.give(0, { wood: 1000, stone: 1000, clay: 1000, copper: 1000, iron: 1000, salt: 1000, gold: 1000, gemstones: 1000, spices: 1000 }).step();
  assert.ok(k.bd.state.every((s) => s === NONE));
  const n = mk(['expansionist', 'aggressive']).put(45, 0, 10);
  n.give(1, { wood: 100, stone: 100, clay: 100 }).step();
  assert.equal(n.bd.state[ERAS], NONE);
  assert.equal(n.stock(1, 'wood'), 100);
});

// ---- the hex ----------------------------------------------------------------------------------------------------

/** Build an era 1 building for civ 0 in a fresh world after `setup(w)`, and return the hex it picked (−1 if none). */
function pick(types, setup, level = 1) {
  const w = mk(types);
  w.lv.level[0] = level;
  setup(w);
  w.give(0, { wood: 1000, stone: 1000, clay: 1000, copper: 1000 });
  w.step();
  return w.bd.hex[(level - 1)];
}

test('RULES.md "The hex": hexes with at least the people the work needs come first, whatever the score', () => {
  // Hex 45 has 9 people (one short of 10) and six neighbours that are also civ 0's; hex 88 has exactly 10 and stands alone.
  const h = pick(['expansionist'], (w) => {
    w.put(45, 0, 9);
    for (let d = 0; d < 6; d++) w.put(nb(w, 45, d), 0, 1);
    w.put(88, 0, 10);
  });
  assert.equal(h, 88);
  // With 10 there it is the score that decides: 10 × 2.2 beats 10.
  const h2 = pick(['expansionist'], (w) => {
    w.put(45, 0, 10);
    for (let d = 0; d < 6; d++) w.put(nb(w, 45, d), 0, 1);
    w.put(88, 0, 10);
  });
  assert.equal(h2, 45);
});

test('RULES.md "The hex": score = people × (1 + 0.2 × own land neighbours holding its people)', () => {
  // 12 people with 2 own neighbours: 12 × 1.4 = 16.8 against 15 alone.
  const two = pick(['expansionist'], (w) => { w.put(45, 0, 12).put(nb(w, 45, 0), 0, 1).put(nb(w, 45, 3), 0, 1).put(88, 0, 15); });
  assert.equal(two, 45);
  // One neighbour: 14.4 against 15.
  const one = pick(['expansionist'], (w) => { w.put(45, 0, 12).put(nb(w, 45, 0), 0, 1).put(88, 0, 15); });
  assert.equal(one, 88);
  // A neighbour of another civ's people, or an empty one, adds nothing.
  const other = pick(['expansionist', 'aggressive'], (w) => { w.put(45, 0, 12).put(nb(w, 45, 0), 1, 5).put(nb(w, 45, 3), 1, 5).put(88, 0, 15); });
  assert.equal(other, 88);
});

test('RULES.md "The hex": × 0.5 if another civ also lives there', () => {
  // 20 × 0.5 = 10 against 11 alone; and 20 alone beats 11.
  assert.equal(pick(['expansionist', 'cooperative'], (w) => { w.put(45, 0, 20).put(45, 1, 1).put(88, 0, 11); }), 88);
  assert.equal(pick(['expansionist', 'cooperative'], (w) => { w.put(45, 0, 20).put(88, 0, 11); }), 45);
  // 22 × 0.5 = 11 ties 11: the lower index.
  assert.equal(pick(['expansionist', 'cooperative'], (w) => { w.put(45, 0, 22).put(45, 1, 1).put(88, 0, 11); }), 45);
  assert.equal(pick(['expansionist', 'cooperative'], (w) => { w.put(45, 0, 21).put(45, 1, 1).put(88, 0, 11); }), 88);
});

test('RULES.md "The hex": × 0.25 if a civ that threatens it lives there or next to it', () => {
  const setup = (hostile, where) => (w) => {
    w.put(45, 0, 40).put(88, 0, 11);
    w.put(where === 'same' ? 45 : nb(w, 45, 2), 1, 1);
    if (hostile) w.hostile[0] = 1 << 1;
  };
  // 40 × 0.25 = 10 < 11 when threatened (next to it), 40 × 0.5 × 0.25 = 5 when it lives there too.
  assert.equal(pick(['expansionist', 'aggressive'], setup(true, 'next')), 88);
  assert.equal(pick(['expansionist', 'aggressive'], setup(true, 'same')), 88);
  // The same civ nearby but not a threat: shared hex halves (20 > 11), a neighbour does nothing.
  assert.equal(pick(['expansionist', 'aggressive'], setup(false, 'next')), 45);
  assert.equal(pick(['expansionist', 'aggressive'], setup(false, 'same')), 45);
  // Two hexes away is not next to it.
  const far = pick(['expansionist', 'aggressive'], (w) => {
    w.put(45, 0, 40).put(88, 0, 11).put(nb(w, nb(w, 45, 2), 2), 1, 1);
    w.hostile[0] = 1 << 1;
  });
  assert.equal(far, 45);
});

test('RULES.md "The hex": ties go to the lower index; no people anywhere means no site', () => {
  assert.equal(pick(['expansionist'], (w) => { w.put(77, 0, 10).put(20, 0, 10).put(60, 0, 10); }), 20);
  const w = mk(['expansionist', 'aggressive']).put(45, 1, 30);
  w.give(0, { wood: 100, stone: 100, clay: 100 });
  assert.equal(w.bd.site(0, w.cnt, 10, 0), -1);
});

test('RULES.md "The hex": one building or wonder per hex, so the next era\'s building goes elsewhere', () => {
  const w = mk(['expansionist']).put(45, 0, 30).put(88, 0, 12);
  w.lv.level[0] = 2;
  w.stand(0, 1, 45);
  w.give(0, { wood: 100, stone: 80, clay: 50, copper: 15 }).step();
  assert.equal(w.bd.state[1], BUILDING);
  assert.equal(w.bd.hex[1], 88, '45 holds the era 1 building');
  assert.ok(w.bd.occupied(45) && w.bd.occupied(88) && !w.bd.occupied(46));
});

test('RULES.md "The hex": deep water hexes are never chosen', () => {
  const w = mk(['expansionist']);
  w.map.terrain[45] = DEEP_WATER;
  w.put(45, 0, 50).put(88, 0, 10).give(0, { wood: 100, stone: 100, clay: 100 }).step();
  assert.equal(w.bd.hex[0], 88);
});

// ---- work, standing, loss ---------------------------------------------------------------------------------------

test('RULES.md "Work": a year counts when the hex held the people the work needs (10 yes, 9 no); after 30 years it stands', () => {
  const w = mk(['expansionist']).put(45, 0, 10);
  w.give(0, { wood: 40, stone: 30, clay: 15 }).step(); // year 1: starts
  w.step(3); // years 2 to 4
  assert.equal(w.bd.work[0], 3);
  w.put(45, 0, 9).step(5);
  assert.equal(w.bd.work[0], 3, '9 people: the years do not count');
  assert.equal(w.bd.state[0], BUILDING);
  w.put(45, 0, 10).step(26); // 3 + 26 = 29
  assert.equal(w.bd.work[0], 29);
  assert.equal(w.bd.state[0], BUILDING, '29 years of work');
  assert.equal(w.events('built').length, 0);
  near(w.bd.eff.birth[0], 0);
  w.step();
  assert.equal(w.bd.state[0], STANDING, '30 years of work');
  assert.deepEqual(w.events('built'), [['built', 0, 1, w.year, -1]]);
  near(w.bd.eff.birth[0], 0.0025, 1e-12);
  near(w.lv.birthBonus[0], 0.0025, 1e-12);
});

test('RULES.md "Work": each era counts years with its own people per hex (12, 14 and 16)', () => {
  for (const [era, need] of [[2, 12], [3, 14], [4, 16]]) {
    const w = mk(['aggressive']).put(45, 0, need - 1);
    w.lv.level[0] = era;
    w.bd.state[era - 1] = BUILDING; w.bd.hex[era - 1] = 45;
    w.step(3);
    assert.equal(w.bd.work[era - 1], 0, `era ${era}: ${need - 1} people`);
    w.put(45, 0, need).step(3);
    assert.equal(w.bd.work[era - 1], 3, `era ${era}: ${need} people`);
  }
});

test('RULES.md "Work": the years of work are 30, 50, 80 and 120', () => {
  BUILDING_COST.forEach((c, e) => {
    const w = mk(['aggressive']).put(45, 0, 20);
    w.lv.level[0] = e + 1;
    w.lv.minHex.fill(0); w.lv.minPeople.fill(0);
    w.bd.state[e] = BUILDING; w.bd.hex[e] = 45;
    w.step(c.years - 1);
    assert.equal(w.bd.state[e], BUILDING, `era ${e + 1} after ${c.years - 1}`);
    w.step();
    assert.equal(w.bd.state[e], STANDING, `era ${e + 1} after ${c.years}`);
  });
});

test('RULES.md "Lost": nobody left in the hex destroys a standing building, its bonus goes, the civ keeps its level', () => {
  const w = mk(['expansionist']).put(45, 0, 10).put(88, 0, 10);
  w.lv.level[0] = 2;
  w.stand(0, 1, 45); w.stand(0, 2, 88);
  w.step();
  near(w.lv.birthBonus[0], 0.005 + 0.0025, 1e-12);
  assert.equal(w.bd.destroyed[0], 0);
  w.put(45, 0, 0).step(); // the era 1 building goes
  assert.equal(w.bd.state[0], NONE);
  assert.equal(w.bd.hex[0], -1);
  assert.equal(w.bd.destroyed[0], 1);
  assert.equal(w.bd.state[1], STANDING, 'the other one stands');
  assert.deepEqual(w.events('destroyed'), [['destroyed', 0, 1, w.year, -1]]);
  near(w.lv.birthBonus[0], 0.005, 1e-12);
  assert.equal(w.lv.level[0], 2);
  // An earlier era's building is not rebuilt, whatever the stockpile holds.
  w.give(0, { wood: 1000, stone: 1000, clay: 1000, copper: 1000 }).put(45, 0, 10).step(3);
  assert.equal(w.bd.state[0], NONE);
});

test('RULES.md "Lost": a destroyed current-era building is rebuilt at full cost before the civ can climb again', () => {
  const w = mk(['expansionist']);
  for (let k = 0; k < 15; k++) w.put(11 + k, 0, 10);
  w.stand(0, 1, 40); // nobody lives there
  w.lv.yearsAt[0] = 500;
  w.give(0, { wood: 80, stone: 30, clay: 30 });
  w.step();
  assert.equal(w.lv.level[0], 1, 'the building is gone');
  assert.equal(w.bd.destroyed[0], 1);
  assert.deepEqual(w.events('destroyed'), [['destroyed', 0, 1, 1, -1]]);
  assert.equal(w.bd.state[0], BUILDING, 'started again as soon as the stockpile held the full cost');
  assert.deepEqual(w.stockList(0), M({ wood: 40, stone: 0, clay: 15 }), 'the full cost 40 wood, 30 stone, 15 clay was taken');
  w.give(0, { wood: 40, stone: 30, clay: 15 }).step();
  assert.equal(w.lv.level[0], 1, 'a building being built does not unlock the level');
});

test('RULES.md "Lost": work in progress is lost with its materials when the hex empties', () => {
  const w = mk(['expansionist']).put(45, 0, 10).put(88, 0, 10);
  w.give(0, { wood: 40, stone: 30, clay: 15 }).step();
  w.step(10);
  assert.equal(w.bd.work[0], 10);
  w.put(45, 0, 0).step();
  assert.equal(w.bd.state[0], NONE);
  assert.equal(w.bd.work[0], 0);
  assert.equal(w.bd.destroyed[0], 0, 'unfinished work is not a destroyed building');
  assert.deepEqual(w.events('destroyed'), []);
  assert.deepEqual(w.stockList(0), M({}), 'no refund');
});

// ---- levelling --------------------------------------------------------------------------------------------------

function readyForLevel2(types = ['expansionist']) {
  const w = mk(types);
  for (let k = 0; k < 15; k++) w.put(11 + k, 0, 10);
  w.lv.yearsAt[0] = 149;
  return w;
}

test('RULES.md "Buildings first": a civ that meets every level requirement still waits for its era building', () => {
  const w = readyForLevel2();
  w.give(0, { wood: 80, stone: 30, clay: 30 }).step();
  assert.equal(w.lv.level[0], 1, 'no building');
  const b = readyForLevel2();
  b.bd.state[0] = BUILDING; b.bd.hex[0] = 11; b.bd.work[0] = 29;
  b.give(0, { wood: 80, stone: 30, clay: 30 });
  b.bd.aCheck[0] = 1e9;
  b.put(11, 0, 9).put(12, 0, 11).step(); // 9 people: the last year of work does not count
  assert.equal(b.lv.level[0], 1, 'being built is not standing');
  assert.equal(b.bd.work[0], 29);
  b.put(11, 0, 10).put(12, 0, 10).step();
  assert.equal(b.bd.state[0], STANDING);
  assert.equal(b.lv.level[0], 2, 'the year it stands, the level follows');
  assert.deepEqual(b.stockList(0).map((v) => Math.round(v * 100) / 100), M({}), 'only the level\'s materials were left');
});

test('RULES.md "Buildings first": the building and the level are paid separately (building cost is not part of the level cost)', () => {
  const w = readyForLevel2();
  w.give(0, { wood: 120, stone: 60, clay: 45 }).step();
  assert.equal(w.bd.state[0], BUILDING, 'building started');
  assert.deepEqual(w.stockList(0), M({ wood: 80, stone: 30, clay: 30 }));
  assert.equal(w.lv.level[0], 1);
});

test('RULES.md "Levelling up": levels 2, 3 and 4 also need their own era building, Kingdom needs the era 4 one', () => {
  for (const level of [1, 2, 3, 4]) {
    const make = () => {
      const w = mk(['aggressive']).put(45, 0, 20);
      w.lv.level[0] = level;
      w.lv.minHex.fill(0); w.lv.minPeople.fill(0);
      for (let m = 0; m < MATERIAL_COUNT; m++) w.lv.stock[m] = w.lv.levelCost(0, level, m);
      w.lv.yearsAt[0] = 5000;
      return w;
    };
    assert.equal(make().step().lv.level[0], level, `level ${level} without the era ${level} building`);
    const v = make();
    v.stand(0, level, 45);
    v.bd.aCheck[level - 1] = 1e9;
    assert.equal(v.step().lv.level[0], level + 1, `level ${level} with it`);
    // The building of another era does not do.
    if (level < 4) {
      const o = make();
      o.stand(0, level + 1, 45);
      assert.equal(o.step().lv.level[0], level, `level ${level} with the next era's building`);
    }
  }
});

// ---- wonder decision --------------------------------------------------------------------------------------------

/** Civ 0 of `type` at level 1 on `n` sparse hexes (1 person each), its era 1 building standing; civ 1 expansionist elsewhere. */
function wonderWorld(type, n, { building = true } = {}) {
  const w = mk([type, 'expansionist']);
  for (const h of sparse(n)) w.put(h, 0, 1);
  if (building) { w.bd.state[0] = STANDING; w.bd.hex[0] = 11; }
  return w;
}
/** The hexes civ 1 shares with civ 0, k of them, and civ 1 a threat that civ 0 does not beat. */
function threaten(w, k) {
  sparse(k).forEach((h) => w.put(h, 1, 1));
  w.hostile[0] = 1 << 1;
}
const committed = (w) => w.bd.attempt[0] === COMMITTED;

test('RULES.md "The decision": score = lean × land, committing at 1 or more (land = hexes ÷ hexes the next level needs, 8 here)', () => {
  // Two civs on 100 land hexes: level 2 needs round(7.5) = 8 hexes.
  const cases = [
    // [type, hexes that commit, one fewer that does not]
    ['cooperative', 7, 6], // 1.2 × 0.875 = 1.05; 1.2 × 0.75 = 0.9
    ['isolationist', 7, 6], // 1.3 × 0.875; 1.3 × 0.75 = 0.975
    ['nomadic', 8, 7], // 1 × 1 = 1 exactly; 0.875
    ['aggressive', 10, 9], // 0.8 × 1.25 = 1 exactly; 0.9
    ['expansionist', 11, 10], // 0.75 × 1.375 = 1.03; 0.75 × 1.25 = 0.94
  ];
  for (const [type, yes, no] of cases) {
    assert.ok(committed(wonderWorld(type, yes).step()), `${type} with ${yes} hexes`);
    assert.ok(!committed(wonderWorld(type, no).step()), `${type} with ${no} hexes`);
  }
  assert.equal(new Levels(makeMap(10, 10, () => PLAINS), ['a', 'b']).minHex[2], 8);
});

test('RULES.md "The decision": the land factor counts at most 1.5', () => {
  // Expansionist 0.75: 8 hexes (land 1) is 0.75, and more land helps only up to 1.5 (1.125).
  assert.ok(!committed(wonderWorld('expansionist', 8).step()));
  assert.ok(committed(wonderWorld('expansionist', 12).step()));
  assert.ok(committed(wonderWorld('expansionist', 20).step()));
  // 15 hexes is 1.875 of the 8 needed, capped at 1.5: Nomadic with safety 0.6 scores 0.9, not 1.125.
  const capped = wonderWorld('nomadic', 15);
  threaten(capped, 6);
  assert.ok(!committed(capped.step()));
  const ok = wonderWorld('nomadic', 15);
  threaten(ok, 4); // safety 0.733 × 1.5 = 1.1
  assert.ok(committed(ok.step()));
});

test('RULES.md "The decision": safety = 1 − the share of its hexes holding, or next to, people of a threat it does not beat', () => {
  const w = wonderWorld('cooperative', 8);
  w.bd.state[0] = STANDING;
  const cnt = w.cnt;
  const danger = 1 << 1;
  assert.equal(w.bd.safety(0, cnt, 0), 1);
  assert.equal(w.bd.safety(0, cnt, danger), 1, 'a threat nowhere');
  threaten(w, 2);
  near(w.bd.safety(0, cnt, danger), 0.75);
  // A threat in a non-held hex next to a held one exposes that one only.
  const v = wonderWorld('cooperative', 8);
  let t = -1;
  for (let h = 0; h < v.map.count && t < 0; h++) {
    let own = 0;
    for (let d = 0; d < 6; d++) if (v.cnt[nb(v, h, d) * 2] > 0) own++;
    if (own === 1 && v.cnt[h * 2] === 0 && nb(v, h, 0) >= 0) t = h;
  }
  v.put(t, 1, 5);
  near(v.bd.safety(0, v.cnt, danger), 0.875);
  // A civ with no hexes has safety 1.
  assert.equal(mk(['cooperative', 'aggressive']).bd.safety(0, new Int32Array(200), danger), 1);
});

test('RULES.md "The decision": a threat the civ beats does not count', () => {
  const w = wonderWorld('nomadic', 15);
  threaten(w, 6);
  w.beats[0] = 1 << 1;
  assert.ok(committed(w.step()));
  const v = wonderWorld('nomadic', 15);
  threaten(v, 6);
  v.hostile[0] = 0; // not a threat at all
  assert.ok(committed(v.step()));
});

test('RULES.md "Who thinks about it": only with its own era building standing, and never once the wonder is finished', () => {
  assert.ok(!committed(wonderWorld('cooperative', 8, { building: false }).step()));
  const building = wonderWorld('cooperative', 8, { building: false });
  building.bd.state[0] = BUILDING; building.bd.hex[0] = 11;
  assert.ok(!committed(building.step()), 'being built is not enough');
  const done = wonderWorld('cooperative', 8);
  done.bd.wYear[0] = 5; done.bd.wOwner[0] = 1; done.bd.wHex[0] = 99;
  assert.ok(!committed(done.step()));
  // Only the wonder of the civ's own era: a level 2 civ does not go for the Sun Circle.
  const l2 = wonderWorld('cooperative', 13);
  l2.lv.level[0] = 2;
  l2.bd.state[0] = NONE; l2.bd.state[1] = STANDING; l2.bd.hex[1] = 11;
  assert.ok(l2.step().bd.attempt[1] === COMMITTED && l2.bd.attempt[0] === NONE);
});

test('RULES.md "Who thinks about it": decides in the first year it qualifies and again every 25 years', () => {
  const w = wonderWorld('nomadic', 7); // 0.875: no
  w.step();
  assert.ok(!committed(w));
  sparse(8).forEach((h) => w.put(h, 0, 1)); // now 1.0
  w.step(24); // years 2 to 25
  assert.ok(!committed(w), 'year 25 is only 24 years after the check in year 1');
  w.step(); // year 26
  assert.ok(committed(w));
  assert.equal(w.bd.aSince[0], 26);
});

// ---- committed civs ---------------------------------------------------------------------------------------------

/** A Cooperative civ committed to the Sun Circle in year 1, ready to level (15 hexes of 10 people, 150 years at level 1). */
function committedCoop() {
  const w = mk(['cooperative', 'expansionist']);
  for (const h of sparse(15)) w.put(h, 0, 10);
  w.bd.state[0] = STANDING; w.bd.hex[0] = 11;
  w.lv.yearsAt[0] = 500;
  w.give(0, { wood: 80, stone: 30, clay: 30 }); // the level only
  w.step();
  return w;
}

test('RULES.md "Committed": a committed civ does not level up until it has started the wonder', () => {
  const w = committedCoop();
  assert.ok(committed(w));
  assert.equal(w.lv.level[0], 1, 'everything else was ready');
  w.step(5);
  assert.equal(w.lv.level[0], 1);
  assert.equal(w.bd.aHex[0], -1);
  // The wonder\'s materials arrive on top of the level\'s: it starts, in another hex, and the level follows.
  w.give(0, { wood: 160, stone: 120, clay: 80 }).step();
  assert.equal(w.bd.aHex[0], 13, 'the lowest free hex: 11 holds the building');
  assert.equal(w.bd.aWork[0], 0);
  assert.equal(w.lv.level[0], 2);
  assert.deepEqual(w.stockList(0).map((v) => Math.round(v * 100) / 100), M({}));
  assert.deepEqual(w.events('level'), [['level', 0, 1, 2, w.year]]);
});

test('RULES.md "Committed": it starts in the first year the stockpile holds the cost (a hundredth short waits)', () => {
  const w = committedCoop();
  w.give(0, { wood: 160 - 80, clay: 80 - 30 }).set(0, 'stone', 119.99).step();
  assert.equal(w.bd.aHex[0], -1);
  assert.equal(w.lv.level[0], 1);
  w.set(0, 'stone', 120).step();
  assert.ok(w.bd.aHex[0] >= 0);
});

test('RULES.md "Giving up": after 200 years without starting; keeps the stockpile; decides again 25 years later', () => {
  const w = committedCoop(); // committed in year 1
  w.lv.yearsAt[0] = -100000; // so that the level does not follow the moment it stops waiting
  w.give(0, { wood: 10 });
  w.step(199); // up to year 200
  assert.ok(committed(w), '199 years after');
  w.step(); // year 201: 200 years since
  assert.ok(!committed(w));
  assert.equal(w.bd.aHex[0], -1);
  near(w.stock(0, 'wood'), 90);
  assert.equal(w.bd.aCheck[0], 201);
  w.step(24); // year 225
  assert.ok(!committed(w));
  w.step(); // year 226
  assert.ok(committed(w), 'decided again and committed');
  assert.equal(w.bd.aSince[0], 226);
});

test('RULES.md "Giving up": checked every 25 years, safety below 0.5 gives up (0.5 itself stays)', () => {
  // 16 hexes: Cooperative scores 1.2 × 1.5 while safe.
  const make = () => {
    const w = mk(['cooperative', 'expansionist']);
    for (const h of sparse(16)) w.put(h, 0, 10);
    w.bd.state[0] = STANDING; w.bd.hex[0] = 11;
    w.step();
    assert.ok(committed(w));
    return w;
  };
  const half = make();
  threaten(half, 8); // safety exactly 0.5
  half.step(25);
  assert.ok(committed(half), 'safety 0.5 at year 26');
  const below = make();
  threaten(below, 9); // 7 / 16
  below.step(24); // years 2 to 25: not a check year
  assert.ok(committed(below), 'only every 25 years');
  below.step(); // year 26
  assert.ok(!committed(below));
  assert.equal(below.bd.aCheck[0], 26);
});

// ---- finishing, refunds, capture ---------------------------------------------------------------------------------

/** Civs in `civs` are all building the Sun Circle, `left` years of work short each, with 10 people in their hexes. */
function race(types, builders, left = 1) {
  const w = mk(types);
  builders.forEach(([c, n], k) => {
    const h = 11 + 2 * k;
    w.put(h, c, n);
    const i = c * ERAS;
    w.bd.attempt[i] = COMMITTED; w.bd.aHex[i] = h; w.bd.aWork[i] = WONDERS[0].years - left;
    w.bd.state[i] = STANDING; w.bd.hex[i] = 60 + c; w.put(60 + c, c, 10); w.bd.aCheck[i] = 1e9;
  });
  return w;
}

test('RULES.md "Work": the first to finish gets the wonder; a wonder takes 60 years of work', () => {
  const w = race(['expansionist', 'aggressive'], [[0, 10], [1, 10]], 2);
  w.bd.aWork[ERAS] = 60 - 1; // civ 1 is a year ahead
  w.step();
  assert.equal(w.bd.wOwner[0], 1);
  assert.equal(w.bd.wBuilder[0], 1);
  assert.equal(w.bd.wYear[0], 1);
  assert.equal(w.bd.wHex[0], 13);
  assert.deepEqual(w.events('wonder'), [['wonder', 1, 1, 1, -1]]);
  assert.equal(w.bd.attempt[ERAS], NONE);
  // Civ 0 was still building: it stops and gets half of the wonder's materials back.
  assert.equal(w.bd.attempt[0], NONE);
  assert.equal(w.bd.aHex[0], -1);
  assert.deepEqual(w.stockList(0), M({ wood: 80, stone: 60, clay: 40 }));
  assert.deepEqual(w.stockList(1), M({}));
  // The bonus is the winner's alone, from that year.
  near(w.bd.eff.birth[1], 0.01); near(w.bd.eff.loyalty[1], 0.5);
  near(w.bd.eff.birth[0], 0.0025, 1e-12); // its own Trailhead Lodge only
  near(w.lv.birthBonus[1], 0.01, 1e-12);
});

test('RULES.md "Work": a year counts only with 10 people in the wonder\'s hex', () => {
  const w = race(['expansionist'], [[0, 9]], 1);
  w.step(3);
  assert.equal(w.bd.wYear[0], -1);
  assert.equal(w.bd.aWork[0], 59);
  w.put(11, 0, 10).step();
  assert.equal(w.bd.wOwner[0], 0);
});

test('RULES.md "Work": several finishing in the same year: the most people at the end of last year, then the lower civ number', () => {
  const more = race(['expansionist', 'aggressive', 'cooperative'], [[0, 10], [1, 30], [2, 20]]);
  more.step();
  assert.equal(more.bd.wOwner[0], 1, 'civ 1 has the most people (30 + 10 in its building hex)');
  assert.deepEqual(more.stockList(0), M({ wood: 80, stone: 60, clay: 40 }));
  assert.deepEqual(more.stockList(2), M({ wood: 80, stone: 60, clay: 40 }));
  assert.equal(more.events('wonder').length, 1);
  const tie = race(['expansionist', 'aggressive', 'cooperative'], [[2, 15], [0, 15], [1, 15]]);
  tie.step();
  assert.equal(tie.bd.wOwner[0], 0, 'equal people: the lower civ number');
});

test('RULES.md "Work": civs still gathering for the wonder stop, with no refund', () => {
  const w = race(['expansionist', 'aggressive'], [[1, 10]]);
  w.bd.attempt[0] = COMMITTED; // civ 0 is committed but has not started
  w.step();
  assert.equal(w.bd.wOwner[0], 1);
  assert.equal(w.bd.attempt[0], NONE);
  assert.deepEqual(w.stockList(0), M({}));
});

test('RULES.md "Wonders": once finished, no civ at that era thinks about it or builds it again', () => {
  const w = race(['expansionist', 'cooperative'], [[0, 10]]);
  for (const h of sparse(15).slice(5)) w.put(h, 1, 1); // 10 hexes: Cooperative would commit (1.2 × 1.25)
  w.step();
  assert.equal(w.bd.wOwner[0], 0);
  w.bd.state[ERAS] = STANDING; w.bd.hex[ERAS] = 33;
  w.step(60);
  assert.equal(w.bd.attempt[ERAS], NONE);
  assert.equal(w.bd.aHex[ERAS], -1);
  assert.equal(w.bd.wOwner[0], 0);
});

test('RULES.md "Captured": the owner keeps it while it has people in the hex; with none, the civ with the most people takes it', () => {
  const w = mk(['expansionist', 'aggressive', 'cooperative']);
  w.bd.wOwner[0] = 0; w.bd.wHex[0] = 45; w.bd.wYear[0] = 1; w.bd.wBuilder[0] = 0;
  w.put(45, 0, 1).put(45, 1, 50);
  w.step();
  assert.equal(w.bd.wOwner[0], 0, 'one person is enough');
  assert.deepEqual(w.events('captured'), []);
  near(w.bd.eff.birth[0], 0.01);
  w.put(45, 0, 0).put(45, 2, 10).step();
  assert.equal(w.bd.wOwner[0], 1);
  assert.equal(w.bd.wCaptures[0], 1);
  assert.deepEqual(w.events('captured'), [['captured', 1, 1, 2, 0]]);
  near(w.bd.eff.birth[1], 0.01); near(w.bd.eff.birth[0], 0);
  assert.equal(w.bd.wBuilder[0], 0, 'the builder is remembered');
  // The new owner keeps it even when others have more people.
  w.put(45, 2, 500).step();
  assert.equal(w.bd.wOwner[0], 1);
});

test('RULES.md "Captured": a tie goes to the lower civ number', () => {
  const w = mk(['expansionist', 'aggressive', 'cooperative']);
  w.bd.wOwner[0] = 0; w.bd.wHex[0] = 45; w.bd.wYear[0] = 1;
  w.put(45, 2, 10).put(45, 1, 10).step();
  assert.equal(w.bd.wOwner[0], 1);
});

test('RULES.md "Captured": with nobody there it is abandoned, gives no bonus, and is taken again when a civ settles', () => {
  const w = mk(['expansionist', 'aggressive']);
  w.bd.wOwner[0] = 0; w.bd.wHex[0] = 45; w.bd.wYear[0] = 1;
  w.put(88, 0, 5).step(); // nobody at 45
  assert.equal(w.bd.wOwner[0], -1);
  assert.deepEqual(w.events('abandoned'), [['abandoned', 0, 1, 1, -1]]);
  near(w.bd.eff.birth[0], 0);
  assert.equal(w.bd.wHex[0], 45, 'the wonder is never destroyed');
  assert.equal(w.bd.wCaptures[0], 0);
  assert.equal(w.bd.list(10).find((x) => x.kind === 'wonder').status, 'abandoned');
  w.step(3);
  assert.equal(w.events('abandoned').length, 1, 'logged once');
  w.put(45, 1, 3).step();
  assert.equal(w.bd.wOwner[0], 1);
  assert.equal(w.bd.wCaptures[0], 1);
  assert.deepEqual(w.events('captured'), [['captured', 1, 1, w.year, -1]]);
  near(w.bd.eff.birth[1], 0.01);
});

// ---- bonuses together --------------------------------------------------------------------------------------------

test('RULES.md "Bonuses together": the bonuses of everything standing and every wonder owned are summed', () => {
  const w = mk(['aggressive', 'expansionist', 'cooperative']);
  w.put(45, 0, 20).put(46, 1, 20).put(47, 2, 20);
  w.stand(0, 1, 45); w.stand(0, 3, 45);
  near(w.bd.eff.strength[0], 0.5, 1e-12); // War Totem 25% + Forge 25%
  near(w.bd.eff.warLoss[0], 0.2, 1e-12);
  w.stand(0, 2, 45);
  near(w.bd.eff.warLoss[0], 0.7, 1e-12); // + Barracks
  // Something being built gives nothing.
  w.bd.state[3] = BUILDING; w.bd.totals();
  near(w.bd.eff.strength[0], 0.5, 1e-12);
  // Expansionist: Trailhead and Colonial Office birth, Sun Circle birth.
  w.stand(1, 1, 46); w.stand(1, 4, 46);
  w.bd.wOwner[0] = 1; w.bd.totals();
  near(w.bd.eff.birth[1], 0.0025 + 0.0025 + 0.01, 1e-12);
  near(w.bd.eff.food[1], 0.05, 1e-12);
  // Cooperative: Market and Senate attract add up (no cap), Guild Hall cost and defence.
  w.stand(2, 2, 47); w.stand(2, 3, 47); w.stand(2, 4, 47);
  near(w.bd.eff.attract[2], 1, 1e-12);
  near(w.bd.eff.cost[2], 0.15, 1e-12);
  near(w.bd.eff.defence[2], 0.25, 1e-12);
  near(w.bd.eff.birth[2], 0.005, 1e-12);
});

test('RULES.md "Bonuses together": loyalty, war-loss and hunger count at most 75%', () => {
  const w = mk(['cooperative', 'nomadic']);
  w.put(45, 0, 20).put(46, 1, 20);
  w.stand(0, 2, 45); // Market: loyalty 50%
  near(w.bd.eff.loyalty[0], 0.5);
  w.bd.wOwner[0] = 0; w.bd.totals(); // Sun Circle: + 50%
  near(w.bd.eff.loyalty[0], 0.75, 1e-12);
  assert.ok(w.bd.eff.loyalty[0] <= MAX_SHARE);
  near(w.bd.eff.attract[0], 0.5, 1e-12, 'attract is not capped');
  w.stand(1, 1, 46); w.stand(1, 4, 46);
  near(w.bd.eff.hunger[1], 0.5, 1e-12);
});

test('RULES.md "Bonuses together": every bonus kind a building or wonder gives is a known kind', () => {
  const kinds = new Set();
  for (const type of CIV_TYPES) for (const b of BUILDINGS[type]) for (const k of Object.keys(b.effects)) kinds.add(k);
  for (const wd of WONDERS) for (const k of Object.keys(wd.effects)) kinds.add(k);
  for (const k of kinds) assert.ok(EFFECT_KEYS.includes(k), k);
  for (const k of EFFECT_KEYS) assert.ok(kinds.has(k), `${k} is given by something`);
});

// ---- bonuses applied ---------------------------------------------------------------------------------------------

test('"Births": a civ\'s birth bonus is its level\'s 0.5 pt per level above 1 plus the buildings\' and wonders\'; it adds to the birth chance', () => {
  const w = mk(['expansionist', 'cooperative']);
  w.put(45, 0, 20).put(46, 1, 20);
  w.stand(0, 1, 45).stand(0, 4, 45);
  w.bd.wOwner[0] = 1; w.bd.wHex[0] = 46; w.bd.wYear[0] = 1; w.bd.totals(); w.lv.setEffects();
  near(w.lv.birthBonus[0], 0.005, 1e-12);
  w.lv.level[0] = 3; w.lv.level[1] = 2; w.lv.setEffects();
  near(w.lv.birthBonus[0], 0.01 + 0.005, 1e-12);
  near(w.lv.birthBonus[1], 0.005 + 0.01, 1e-12);
  // In births(): chance + bonus, per civ. A bonus covering the whole chance makes every fertile fed adult a parent.
  const map = makeMap(10, 10, () => PLAINS);
  const run = (bonus) => {
    const p = new People(4096);
    for (let k = 0; k < 2000; k++) p.add(11 + (k % 50), k % 2, 25, 100, 0);
    const s = scratch(map, p);
    return births(p, map, new Rng('birth'), s.pop, s.parents, () => {}, null, 0, bonus);
  };
  assert.equal(run(Float64Array.of(1, 1)), 2000);
  const none = run(null);
  assert.equal(run(Float64Array.of(0, 0)), none);
  const sun = run(Float64Array.of(0.01, 0.01));
  assert.ok(sun > none, `${sun} births with +1 pt against ${none}`);
  const one = run(Float64Array.of(0, 1));
  assert.ok(one >= 1000 && one < 1300, `only civ 1 gets the bonus: ${one}`);
});

test('RULES.md "What levels do": food capacity adds the biggest food bonus among the civs living in the hex, hills/mountain/desert/tundra with Terraces', () => {
  const terr = { 11: PLAINS, 12: HILLS, 13: MOUNTAIN, 14: DESERT, 15: TUNDRA, 16: FOREST };
  const w = mk(['expansionist', 'isolationist', 'cooperative'], { terrain: (i) => terr[i] ?? PLAINS });
  for (const h of [11, 12, 13, 14, 15, 16]) w.put(h, 0, 1);
  w.stand(0, 2, 11); // Granary +5% in every hex it lives in
  w.step();
  for (const h of [11, 12, 13, 14, 15, 16]) near(w.map.foodCap[h], FOOD_CAPACITY[terr[h]] * 1.05, 1e-3);
  near(w.map.foodCap[20], FOOD_CAPACITY[PLAINS], 1e-3);
  // Terraces: +25% on hills, mountain, desert and tundra only.
  const t = mk(['isolationist', 'expansionist'], { terrain: (i) => terr[i] ?? PLAINS });
  for (const h of [11, 12, 13, 14, 15, 16]) t.put(h, 0, 1);
  t.stand(0, 2, 11);
  t.step();
  for (const h of [12, 13, 14, 15]) near(t.map.foodCap[h], FOOD_CAPACITY[terr[h]] * 1.25, 1e-3);
  near(t.map.foodCap[11], FOOD_CAPACITY[PLAINS], 1e-3);
  near(t.map.foodCap[16], FOOD_CAPACITY[FOREST], 1e-3);
  // Colonial Office + Granary of the same civ add up; Hanging Gardens +30% beats a civ with +5% in the same hex (the biggest, not the sum).
  const s = mk(['expansionist', 'cooperative'], { terrain: (i) => terr[i] ?? PLAINS });
  s.put(11, 0, 1).put(11, 1, 1).put(12, 0, 1);
  s.stand(0, 2, 11).stand(0, 4, 12);
  s.step();
  near(s.map.foodCap[11], FOOD_CAPACITY[PLAINS] * 1.1, 1e-3);
  s.bd.wOwner[1] = 1; s.bd.wHex[1] = 11; s.bd.wYear[1] = 1;
  s.step();
  near(s.map.foodCap[11], FOOD_CAPACITY[PLAINS] * 1.3, 1e-3);
  near(s.map.foodCap[12], FOOD_CAPACITY[HILLS] * 1.1, 1e-3);
});

test('RULES.md "What levels do": a food bonus adds to the level\'s (plains at level 2 with a Granary: 1 + 0.25 + 0.05); excess food is lost', () => {
  const w = mk(['expansionist', 'aggressive']).put(11, 0, 3);
  w.lv.level[0] = 2;
  w.stand(0, 2, 11);
  w.step();
  near(w.map.foodCap[11], FOOD_CAPACITY[PLAINS] * 1.3, 1e-3);
  w.map.food[11] = w.map.foodCap[11];
  w.put(11, 0, 0).put(12, 1, 1).step(); // the civ leaves: the Granary is destroyed, capacity back to level 1
  near(w.map.foodCap[11], FOOD_CAPACITY[PLAINS], 1e-3);
  assert.equal(w.map.food[11], w.map.foodCap[11]);
  // Level 5 plains with Hanging Gardens: + 0.25 + 0.25 + 0.3.
  const k = mk(['expansionist', 'aggressive']).put(11, 0, 3);
  k.lv.level[0] = 5;
  k.bd.wOwner[1] = 0; k.bd.wHex[1] = 11; k.bd.wYear[1] = 1;
  k.step();
  near(k.map.foodCap[11], FOOD_CAPACITY[PLAINS] * 1.8, 1e-3);
});

test('RULES.md "Gathering": a gathering bonus multiplies the gatherers by 1 + the bonus (Council Fire +20% on top of Cooperative ×1.25)', () => {
  const run = (setup) => {
    const w = mk(['cooperative', 'expansionist']);
    w.add(55, 0, 30);
    w.map.deposits[55] |= 1 << WOOD;
    setup(w);
    w.step();
    return w.stock(0, 'wood');
  };
  // 30 adults at cooperation 0.5: effort 30; gatherers 20% × 30 × 1.25 = 7.5; 0.5 wood each.
  near(run(() => {}), 0.5 * 7.5, 1e-6);
  near(run((w) => w.stand(0, 1, 55)), 0.5 * 7.5 * 1.2, 1e-6);
  // Grand Library: gathering ×2 (+100%), owned by the civ.
  const library = (w) => { w.bd.wOwner[3] = 0; w.bd.wHex[3] = 55; w.bd.wYear[3] = 1; w.bd.totals(); };
  near(run(library), 0.5 * 7.5 * 2, 1e-6);
  // Both add: ×(1 + 0.2 + 1).
  near(run((w) => { w.stand(0, 1, 55); library(w); }), 0.5 * 7.5 * 2.2, 1e-6);
});

test('RULES.md "Gathering": Observatory +30% and Caravanserai +30% on uncommon and exotic materials only', () => {
  const iso = mk(['isolationist']);
  iso.add(55, 0, 30);
  iso.map.deposits[55] |= 1 << WOOD;
  iso.stand(0, 4, 55);
  iso.step();
  near(iso.stock(0, 'wood'), 0.5 * 6 * 1.3, 1e-6); // 20% × 30 = 6 gatherers
  // Level 2 -> 3 wants wood (common) and copper (uncommon): each gets half the 10 gatherers; Caravanserai +30% on copper only.
  const run = (caravanserai) => {
    const w = mk(['nomadic']);
    w.lv.level[0] = 2;
    w.add(55, 0, 50);
    w.map.deposits[55] |= (1 << WOOD) | (1 << COPPER);
    if (caravanserai) w.stand(0, 2, 55);
    else { w.bd.state[1] = BUILDING; w.bd.hex[1] = 55; w.bd.work[1] = 1; }
    w.step();
    return [w.stock(0, 'wood'), w.stock(0, 'copper')];
  };
  const [wood, copper] = run(true);
  near(wood, 0.5 * 10 / 2, 1e-6);
  near(copper, 0.5 * 10 * 1.3 / 2, 1e-6);
  const [wood0, copper0] = run(false);
  near(wood0, 2.5, 1e-6); near(copper0, 2.5, 1e-6);
});

test('RULES.md "Gathering": the next spend is the era\'s building, then the wonder (only if committed and not started), then the level', () => {
  const w = mk(['expansionist']);
  w.put(45, 0, 20);
  const lv = w.lv;
  const out = new Float64Array(MATERIAL_COUNT);
  const bcost = (e) => Array.from(w.bd.buildingCost(0, e, out));
  const lcost = (l) => MATERIAL_IDS.map((_, m) => lv.levelCost(0, l, m));
  const sum = (...lists) => lists.reduce((a, l) => a.map((v, m) => v + l[m]), new Array(MATERIAL_COUNT).fill(0));
  const rest = sum(bcost(2), lcost(2), bcost(3), lcost(3), bcost(4), lcost(4));
  const target = (c = 0) => Array.from(lv.target.subarray(c * MATERIAL_COUNT, (c + 1) * MATERIAL_COUNT));
  const later = (c = 0) => Array.from(lv.later.subarray(c * MATERIAL_COUNT, (c + 1) * MATERIAL_COUNT));
  lv.targets(0);
  assert.deepEqual(target(), bcost(1), 'building first');
  assert.deepEqual(later(), sum(bcost(1), lcost(1), rest));
  w.bd.state[0] = BUILDING; w.bd.hex[0] = 45; lv.targets(0);
  assert.deepEqual(target(), lcost(1), 'being built: the level');
  assert.deepEqual(later(), sum(lcost(1), rest));
  w.bd.state[0] = STANDING; lv.targets(0);
  assert.deepEqual(target(), lcost(1));
  w.bd.attempt[0] = COMMITTED; lv.targets(0);
  assert.deepEqual(target(), Array.from(WONDERS[0].materials), 'committed, not started: the wonder');
  assert.deepEqual(later(), sum(Array.from(WONDERS[0].materials), lcost(1), rest));
  w.bd.aHex[0] = 13; lv.targets(0);
  assert.deepEqual(target(), lcost(1), 'started: the level');
  // At level 2 the target is the era 2 building; a Kingdom wants nothing.
  w.bd.attempt[0] = NONE; w.bd.aHex[0] = -1; lv.level[0] = 2; lv.targets(0);
  assert.deepEqual(target(), bcost(2));
  lv.level[0] = 5; lv.targets(0);
  assert.deepEqual(target(), new Array(MATERIAL_COUNT).fill(0));
});

test('RULES.md "Gathering": a committed civ works the wonder\'s materials, the level\'s when it has started; the cost bonus applies', () => {
  const mkc = (started) => {
    const w = mk(['cooperative', 'expansionist']);
    w.add(55, 0, 40);
    w.map.deposits[55] |= 1 << WOOD;
    w.bd.state[0] = STANDING; w.bd.hex[0] = 55; w.bd.aCheck[0] = 1e9;
    w.bd.attempt[0] = COMMITTED; w.bd.aHex[0] = started ? 56 : -1; w.bd.aSince[0] = 1; w.bd.aWork[0] = 1;
    if (started) w.put(56, 0, 10);
    w.give(0, { wood: 100 }); // covers the level (80), not the wonder (160)
    w.step();
    return w;
  };
  const w = mkc(false);
  assert.ok(w.lv.nextMask[0] & (1 << WOOD), 'wood is still needed for the wonder');
  const v = mkc(true);
  assert.ok(!(v.lv.nextMask[0] & (1 << WOOD)), 'the level only needs 80');
});

test('RULES.md "Levelling up": land bonus (Road Network) lowers hexes and people to ⌈× (1 − bonus)⌉, at least 1 hex', () => {
  const w = mk(['expansionist']);
  const lv = w.lv;
  assert.deepEqual([2, 3, 4, 5].map((l) => lv.minHexesFor(0, l)), [15, 30, 50, 75]);
  w.stand(0, 3, 45);
  assert.deepEqual([2, 3, 4, 5].map((l) => lv.minHexesFor(0, l)), [14, 27, 45, 68], '13.5 → 14, 27, 45, 67.5 → 68');
  assert.deepEqual([2, 3, 4, 5].map((l) => lv.minPopFor(0, l)), [135, 324, 630, 1080], 'people 150, 360, 700, 1200');
  assert.equal(lv.minHexesFor(0, 1), 0);
  assert.equal(lv.minPopFor(0, 1), 0);
  // At least one hex on a tiny map.
  const t = mk(['expansionist'], { size: 4 });
  t.stand(0, 3, 5);
  assert.equal(t.lv.minHexesFor(0, 2), 2, '15% of 16 = 2.4 → 2; 2 × 0.9 = 1.8 → 2');
  const tiny = mk(['a', 'b', 'c', 'd', 'e', 'f'], { size: 3 });
  assert.equal(tiny.lv.minHex[2], 1);
  assert.equal(tiny.lv.minHexesFor(0, 2), 1);
});

test('RULES.md "Levelling up": a land bonus applies when levelling and to the minimum that keeps the level', () => {
  // Level 3 -> 4 for an Expansionist with a Road Network: 45 hexes and 630 people (instead of 50 and 700).
  const make = (hexes, total) => {
    const w = mk(['expansionist']);
    w.lv.level[0] = 3;
    for (let k = 0; k < hexes; k++) w.put(11 + k, 0, Math.floor(total / hexes) + (k < total % hexes ? 1 : 0));
    w.lv.yearsAt[0] = 5000;
    w.give(0, { stone: 300, copper: 80, iron: 60, salt: 40 });
    w.bd.state[2] = STANDING; w.bd.hex[2] = 11; w.bd.aCheck[2] = 1e9; w.bd.totals(); w.lv.setEffects();
    return w;
  };
  assert.equal(make(45, 630).step().lv.level[0], 4);
  assert.equal(make(44, 630).step().lv.level[0], 3, '44 hexes');
  assert.equal(make(45, 629).step().lv.level[0], 3, '629 people');
  // Falling back counts from the reduced minimum: 630 people hold level 3 → no wait, level 3 needs 324.
  const f = mk(['expansionist']);
  f.lv.level[0] = 3;
  f.put(11, 0, 324).stand(0, 3, 11);
  f.bd.aCheck[2] = 1e9;
  f.step();
  assert.equal(f.lv.belowYears[0], 0, '324 is the reduced minimum for level 3');
  f.put(11, 0, 323).step();
  assert.equal(f.lv.belowYears[0], 1);
});

test('RULES.md "Levelling up": a years bonus (Observatory 10%, Grand Library 30%) lowers the years to ⌈× (1 − bonus)⌉', () => {
  const w = mk(['isolationist', 'nomadic', 'expansionist']);
  const lv = w.lv;
  assert.equal(lv.yearsFor(0, 1), 120);
  assert.equal(lv.yearsFor(1, 1), 188);
  w.stand(0, 4, 45);
  assert.equal(lv.yearsFor(0, 1), 108, '120 × 0.9');
  assert.equal(lv.yearsFor(0, 4), 576, '640 × 0.9');
  w.bd.wOwner[3] = 0; w.bd.totals();
  assert.equal(lv.yearsFor(0, 4), 384, '640 × 0.6');
  assert.equal(lv.yearsFor(0, 1), 72);
  w.bd.wOwner[3] = 1; w.bd.totals();
  assert.equal(lv.yearsFor(1, 1), 132, '188 × 0.7 = 131.6');
  assert.equal(lv.yearsFor(2, 1), 150, 'a civ without it');
  const act = mk(['isolationist']);
  for (let k = 0; k < 15; k++) act.put(11 + k, 0, 10);
  act.stand(0, 4, 11);
  act.bd.state[0] = STANDING; act.bd.hex[0] = 11; act.bd.aCheck[0] = 1e9;
  act.give(0, { wood: 100, stone: 38, clay: 38 });
  act.lv.yearsAt[0] = 107;
  act.step();
  assert.equal(act.lv.level[0], 2, '108 years');
  const short = mk(['isolationist']);
  for (let k = 0; k < 15; k++) short.put(11 + k, 0, 10);
  short.stand(0, 4, 11);
  short.bd.state[0] = STANDING; short.bd.hex[0] = 11; short.bd.aCheck[0] = 1e9;
  short.give(0, { wood: 100, stone: 38, clay: 38 });
  short.lv.yearsAt[0] = 106;
  assert.equal(short.step().lv.level[0], 1, '107 years');
});

test('RULES.md "Levelling up": a cost bonus (Guild Hall 15%) lowers every material cost of levels and buildings to ⌈× 0.85⌉', () => {
  const w = mk(['cooperative', 'expansionist']);
  const out = new Float64Array(MATERIAL_COUNT);
  assert.deepEqual(MATERIAL_IDS.map((_, m) => w.lv.levelCost(0, 1, m)), M({ wood: 80, stone: 30, clay: 30 }));
  w.stand(0, 3, 45);
  assert.equal(w.bd.costPct(0), 85);
  assert.deepEqual(MATERIAL_IDS.map((_, m) => w.lv.levelCost(0, 1, m)), M({ wood: 68, stone: 26, clay: 26 }), '80 → 68, 30 → 25.5 → 26');
  assert.deepEqual(MATERIAL_IDS.map((_, m) => w.lv.levelCost(0, 2, m)), M({ wood: 170, stone: 128, clay: 85, copper: 26 }), '200 → 170, 150 → 127.5 → 128, 100 → 85, 30 → 25.5 → 26');
  assert.deepEqual(Array.from(w.bd.buildingCost(0, 1, out)), M({ wood: 34, stone: 26, clay: 13 }), '40 → 34, 30 → 26, 15 → 12.75 → 13');
  assert.deepEqual(Array.from(w.bd.buildingCost(0, 4, out)), M({ iron: 68, gold: 13, gemstones: 7, spices: 9 }), '80 → 68, 15 → 12.75 → 13, 8 → 6.8 → 7, 10 → 8.5 → 9');
  assert.deepEqual(Array.from(w.bd.buildingCost(1, 1, out)), M({ wood: 40, stone: 30, clay: 15 }), 'another civ pays full');
  assert.equal(reduce(0, 85), 0);
  assert.equal(reduce(100, 100), 100);
  assert.equal(reduce(1, 85), 1);
  // Applied: the building starts at the reduced cost; the level is bought for it too.
  const a = mk(['cooperative']).put(45, 0, 10).put(46, 0, 10);
  a.stand(0, 3, 45);
  a.give(0, { wood: 34, stone: 26, clay: 13 }).step();
  assert.equal(a.bd.state[0], BUILDING);
  assert.deepEqual(a.stockList(0), M({}));
});

test('"Fights": strength bonus multiplies each side\'s strength by 1 + bonus; defence adds to the terrain bonus', () => {
  const win = (holderN, holderEff, attackerN, attackerEff, terrain = PLAINS) => {
    const f = fight([[1, holderN], [0, attackerN]], { terrain, eff: { 1: holderEff, 0: attackerEff }, last: [[1, holderN]] });
    assert.equal(f.fights[0].holder, 1);
    return f.fights[0].winner;
  };
  // Strength 0.5 each: 20 people are 10.
  assert.equal(win(20, {}, 21, {}), 0, 'baseline: 10.5 beats 10');
  assert.equal(win(20, { strength: 0.1 }, 21, {}), 1, '11 against 10.5');
  assert.equal(win(20, { strength: 0.1 }, 23, {}), 0, '11 against 11.5');
  assert.equal(win(29, {}, 20, { strength: 0.5 }), 0, 'attacker 15 against 14.5: the attacker\'s strength counts');
  assert.equal(win(31, {}, 20, { strength: 0.5 }), 1, '15 against 15.5');
  // Defence: hills 1.5 + 0.5 = 2 for the holder; the attacker has none of it.
  assert.equal(win(20, { defence: 0.5 }, 40, {}, HILLS), 1, '20 against 20 ties to the holder');
  assert.equal(win(20, { defence: 0.5 }, 41, {}, HILLS), 0, '20.5 against 20');
  assert.equal(win(20, {}, 31, { defence: 5 }, HILLS), 0, 'the attacker\'s defence bonus is not used (15.5 against 15)');
  assert.equal(win(20, { defence: 0.75 }, 35, {}, PLAINS), 1, 'Walls on plains: 17.5 against 17.5');
  assert.equal(win(20, { defence: 0.75 }, 36, {}, PLAINS), 0);
  // Strength and defence multiply: holder 1.1 × (1 + 0.5 + 0.5) on hills = 2.2 → 22 against 22.
  assert.equal(win(20, { defence: 0.5, strength: 0.1 }, 44, {}, HILLS), 1);
  assert.equal(win(20, { defence: 0.5, strength: 0.1 }, 45, {}, HILLS), 0);
});

test('"Fights": a war-loss bonus (War Totem 20%, Barracks 50%) shrinks the loser\'s deaths to ⌈20% × (1 − bonus)⌉, at least 1', () => {
  const dead = (n, warLoss) => {
    const f = fight([[0, 20], [1, n]], { eff: { 1: { warLoss } }, strengths: [1, 0], last: [[0, 20], [1, n]] });
    assert.equal(f.fights[0].winner, 0);
    return f.deaths.filter((d) => d.civ === 1).length;
  };
  assert.equal(dead(50, 0), 10);
  assert.equal(dead(50, 0.2), 8, '10 × 0.8');
  assert.equal(dead(50, 0.5), 5);
  assert.equal(dead(50, 0.7), 3, '3 exactly');
  assert.equal(dead(50, 0.75), 3, '2.5 → 3');
  assert.equal(dead(51, 0.5), 6, '5.1 → 6');
  assert.equal(dead(1, 0.75), 1, 'always at least one');
  assert.equal(dead(4, 0.5), 1);
  // Only the loser benefits.
  const won = fight([[0, 40], [1, 10]], { eff: { 0: { warLoss: 0.75 } }, strengths: [1, 0], last: [[0, 40], [1, 10]] });
  assert.equal(won.deaths.filter((d) => d.civ === 0).length, 2, 'the winner loses 5% (rounded down) whatever its bonus');
});

test('"Switching civ": a loyalty bonus multiplies the chance of switching away by 1 − bonus (Market/Sun Circle 50%, capped at 75%)', () => {
  const rate = (loyalty) => {
    const n = 8000;
    const f = fight([[0, n], [1, 4]], { eff: { 0: { loyalty } }, coop: [1, 0], agg: 0, types: ['expansionist', 'expansionist'] });
    assert.equal(f.n, 0);
    return f.switches.length / n;
  };
  near(rate(0), 0.02, 0.004);
  near(rate(0.5), 0.01, 0.003);
  near(rate(0.75), 0.005, 0.002);
});

test('"Switching civ": an attract bonus (Market, Senate) pulls other civs\' people in by 1 + bonus; the target is picked by the weights', () => {
  const n = 8000;
  const f = (attract, types = ['expansionist', 'expansionist']) => fight([[0, n], [1, 40]], { eff: { 1: { attract } }, coop: [1, 0], agg: 0, types });
  const base = f(0);
  near(base.switches.length / n, 0.02, 0.004);
  near(f(0.5).switches.length / n, 0.03, 0.005);
  near(f(1).switches.length / n, 0.04, 0.006);
  // Two others: civ 1 has +100%, civ 2 none, same people: civ 1 gets two thirds, and the chance is weighted (1 + 2) / 2 = 1.5 times the base.
  const t = fight([[0, n], [1, 20], [2, 20]], { eff: { 1: { attract: 1 } }, coop: [1, 0, 0], agg: 0, types: ['expansionist', 'expansionist', 'expansionist'] });
  near(t.switches.length / n, 0.03, 0.005);
  const to1 = t.switches.filter(([, to]) => to === 1).length / t.switches.length;
  near(to1, 2 / 3, 0.06);
});

test('"A year" Eating: a hunger bonus multiplies hunger\'s health loss by 1 − bonus before rounding, with shelter', () => {
  const loss = (terrain, civ, shelter, mul) => {
    const map = makeMap(10, 10, () => terrain);
    map.food.fill(0);
    const people = new People(8);
    const i = people.add(55, civ, 25, 100, 0);
    const s = scratch(map, people);
    eat(people, map, new Rng('h'), s.pop, s.seen, s.picked, null, null, shelter, mul);
    return 100 - people.health[i];
  };
  const base = loss(PLAINS, 0, null, null);
  assert.equal(base, hungryLoss(0.5, 0.5, 0.5, 0.5, PLAINS));
  assert.equal(base, 35);
  assert.equal(loss(PLAINS, 0, null, Float64Array.of(0.75)), 26, 'Tent Circle 25%: round(26.25)');
  assert.equal(loss(PLAINS, 0, null, Float64Array.of(0.5)), 18, 'Tent Circle + Khan\'s Court: round(17.5)');
  assert.equal(loss(PLAINS, 1, null, Float64Array.of(1, 0.5)), 18, 'per civ');
  assert.equal(loss(PLAINS, 0, null, Float64Array.of(1, 0.5)), 35);
  // Shelter (level 3) and the bonus multiply: desert, round(35 × climate × 0.5 × 0.75).
  const desert = loss(DESERT, 0, null, null);
  const sheltered = loss(DESERT, 0, Float64Array.of(0.5), null);
  const both = loss(DESERT, 0, Float64Array.of(0.5), Float64Array.of(0.75));
  assert.equal(sheltered, hungryLoss(0.5, 0.5, 0.5, 0.5, DESERT, 0.5));
  assert.equal(both, hungryLoss(0.5, 0.5, 0.5, 0.5, DESERT, 0.5 * 0.75));
  assert.ok(both < sheltered && sheltered < desert);
  // Wired through Levels.hungerMul.
  const w = mk(['nomadic']).put(45, 0, 10);
  w.stand(0, 1, 45);
  w.step();
  near(w.lv.hungerMul[0], 0.75);
  w.stand(0, 4, 45);
  w.step();
  near(w.lv.hungerMul[0], 0.5);
  assert.equal(mk(['expansionist']).lv.hungerMul[0], 1);
});

test('"What levels do": an old-age bonus (Ancestor Shrine 4 years) delays old age, on top of the Kingdom\'s 5', () => {
  const w = mk(['isolationist']).put(45, 0, 10);
  assert.equal(w.lv.oldAgeDelay[0], 0);
  w.stand(0, 1, 45);
  assert.equal(w.lv.oldAgeDelay[0], 4);
  w.lv.level[0] = 5; w.lv.setEffects();
  assert.equal(w.lv.oldAgeDelay[0], 9);
  // In deaths(): old age starts at 45 for life expectancy 0.5; at 48 with a 4-year delay nobody dies of it, at 49 the chance is 0 too.
  const run = (delay) => {
    const people = new People(512);
    for (let k = 0; k < 400; k++) people.add(0, 0, 49, 100, 0);
    let d = 0;
    deaths(people, new Rng('old'), () => { d++; }, delay);
    return d;
  };
  assert.ok(run(null) > 10, 'without it: chance 4/40 each');
  assert.equal(run(Int32Array.of(4)), 0);
  assert.ok(run(Int32Array.of(3)) > 0);
});

test('"Migration" Reach: Horse Paddock gives a walker +1 movement point (Nomadic 6, not 5), and only walkers', () => {
  const sim = new Simulation({ seed: 'move', size: 14, civCount: 2, startPop: 20, civTypes: ['nomadic', 'expansionist'] });
  const r = sim.migrationRules;
  const bd = sim.levels.buildings;
  assert.deepEqual([...r.movePoints], [5, 0]);
  const reach5 = r.reach[0];
  const home = sim.people.hex[0];
  bd.state[2] = STANDING; bd.hex[2] = home; bd.totals();
  sim.applyMove();
  assert.equal(r.movePoints[0], 6);
  assert.notEqual(r.reach[0], reach5);
  assert.equal(r.reach[0].targets.length, buildReach(sim.map, 6, 0).targets.length);
  assert.ok(r.reach[0].targets.length >= reach5.targets.length);
  // A walker\'s table is the shared one for 6 points; applying again changes nothing.
  const table6 = r.reach[0];
  sim.applyMove();
  assert.equal(r.reach[0], table6);
  // Others walk one hex whatever they have.
  bd.eff.move[1] = 1;
  sim.applyMove();
  assert.equal(r.movePoints[1], 0);
  // Gone with the building.
  bd.state[2] = NONE; bd.totals();
  sim.applyMove();
  assert.equal(r.movePoints[0], 5);
  assert.equal(r.reach[0], reach5);
  // Boats and the extra point keep working together.
  bd.state[2] = STANDING; bd.totals();
  sim.levels.level[0] = 4; sim.onLevel(0, 3, 4, 1);
  sim.applyMove();
  assert.equal(r.movePoints[0], 6);
  assert.equal(r.boats[0], 1);
});

// ---- the World and the host -------------------------------------------------------------------------------------

test('Simulation.buildings(), inspect(...).buildings and host.buildings(): plain data of everything on the map', () => {
  const sim = new Simulation({ seed: 'list', size: 12, civCount: 2, startPop: 30, civTypes: ['cooperative', 'nomadic'] });
  assert.deepEqual(sim.buildings(), []);
  const bd = sim.levels.buildings;
  const home0 = sim.people.hex[0];
  const home1 = sim.people.hex[40];
  bd.state[1] = STANDING; bd.hex[1] = home0;
  bd.state[ERAS] = BUILDING; bd.hex[ERAS] = home1; bd.work[ERAS] = 7;
  bd.wOwner[3] = 1; bd.wBuilder[3] = 0; bd.wHex[3] = home0 + 1; bd.wYear[3] = 500; bd.wCaptures[3] = 2;
  bd.totals();
  const list = sim.buildings();
  assert.equal(list.length, 3);
  const market = list.find((b) => b.id === 'market');
  assert.deepEqual(
    { kind: market.kind, name: market.name, era: market.era, civ: market.civ, hex: market.hex, status: market.status, work: market.work, years: market.years },
    { kind: 'building', name: 'Market', era: 1 + 1, civ: 0, hex: home0, status: 'standing', work: 0, years: 50 },
  );
  assert.equal(market.col, home0 % 12);
  assert.equal(market.row, Math.floor(home0 / 12));
  assert.deepEqual(market.bonuses, ['its people switch to other civs 50% less often', 'people of other civs in its hexes join it 50% more often']);
  const tent = list.find((b) => b.id === 'tentCircle');
  assert.deepEqual([tent.status, tent.work, tent.years, tent.civ], ['building', 7, 30, 1]);
  const library = list.find((b) => b.kind === 'wonder');
  assert.deepEqual([library.name, library.civ, library.builder, library.year, library.captures, library.status, library.work, library.years],
    ['Grand Library', 1, 0, 500, 2, 'standing', 200, 200]);
  assert.deepEqual(library.bonuses, ['gathering ×2', 'years needed at a level −30%']);
  bd.wOwner[3] = -1; bd.totals();
  assert.equal(sim.buildings().find((b) => b.kind === 'wonder').status, 'abandoned');
  assert.doesNotThrow(() => structuredClone(sim.buildings()));
  // Inspect: only the buildings in that hex.
  const here = sim.inspect(home0 % 12, Math.floor(home0 / 12));
  assert.deepEqual(here.buildings.map((b) => b.id), ['market']);
  assert.doesNotThrow(() => structuredClone(here));
  const empty = sim.inspect(0, 0);
  assert.ok(Array.isArray(empty.buildings));
  // The host passes it on.
  const host = new LocalSimHost();
  assert.deepEqual(host.buildings(), [], 'before a game');
  host.start({ seed: 'list', size: 12, civCount: 2, startPop: 30 });
  assert.deepEqual(host.buildings(), []);
  host.sim.levels.buildings.state[0] = STANDING;
  host.sim.levels.buildings.hex[0] = host.sim.people.hex[0];
  const items = host.buildings();
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'building');
  assert.doesNotThrow(() => structuredClone(items));
});

test('Levels.summary and Buildings.summary: plain data for the sheet (status, cost after bonuses, progress, bonuses together)', () => {
  const w = mk(['cooperative', 'expansionist']).put(45, 0, 10);
  w.stand(0, 3, 45);
  w.bd.state[0] = BUILDING; w.bd.hex[0] = 46; w.bd.work[0] = 12;
  const s = w.lv.summary(0);
  assert.equal(s.next.building, 'Council Fire');
  assert.equal(s.next.buildingStanding, false);
  assert.equal(s.next.waitingForWonder, false);
  assert.equal(s.buildings.eras.length, 4);
  const e1 = s.buildings.eras[0];
  assert.deepEqual([e1.building.status, e1.building.work, e1.building.years, e1.building.hex], ['building', 12, 30, 46]);
  assert.deepEqual(e1.building.cost, { wood: 34, stone: 26, clay: 13, copper: 0, iron: 0, salt: 0, gold: 0, gemstones: 0, spices: 0 });
  assert.equal(e1.wonder.status, 'free');
  assert.equal(s.buildings.eras[2].building.status, 'standing');
  assert.deepEqual(s.buildings.bonuses, { cost: 0.15, defence: 0.25 });
  assert.deepEqual(s.buildings.bonusText, effectText({ defence: 0.25, cost: 0.15 }));
  assert.equal(s.buildings.eras[0].building.destroyed, 0);
  // Wonder statuses.
  w.bd.attempt[0] = COMMITTED;
  assert.equal(w.lv.summary(0).buildings.eras[0].wonder.status, 'gathering');
  assert.equal(w.lv.summary(0).next.waitingForWonder, true);
  w.bd.aHex[0] = 47; w.bd.aWork[0] = 3;
  const b = w.lv.summary(0).buildings.eras[0].wonder;
  assert.deepEqual([b.status, b.work, b.years], ['building', 3, 60]);
  w.bd.wYear[0] = 9; w.bd.wOwner[0] = 1; w.bd.totals();
  assert.equal(w.lv.summary(0).buildings.eras[0].wonder.status, 'building', 'still building by its own attempt');
  w.bd.aHex[0] = -1; w.bd.attempt[0] = NONE;
  assert.equal(w.lv.summary(0).buildings.eras[0].wonder.status, 'taken');
  assert.equal(w.lv.summary(1).buildings.eras[0].wonder.status, 'owned');
  assert.equal(w.lv.summary(1).buildings.eras[0].wonder.owner, 1);
  assert.deepEqual(w.lv.summary(1).buildings.bonuses.loyalty, 0.5);
  // A Kingdom has no next building.
  w.lv.level[0] = 5;
  assert.equal(w.lv.summary(0).next, null);
});

// ---- records and the end screen ---------------------------------------------------------------------------------

test('RULES.md "History log": a finished wonder is logged, and so are the first 16 captures (abandoned and re-taken included)', () => {
  const rec = new Records(3, 3, 10);
  const people = new People(4);
  rec.building('wonder', 1, 2, 300, -1);
  rec.building('captured', 2, 2, 350, 1);
  rec.building('captured', 0, 3, 400, -1);
  rec.building('abandoned', 0, 3, 410, -1);
  rec.building('built', 0, 1, 10, -1);
  rec.building('destroyed', 0, 1, 10, -1);
  const ev = rec.data(people, 500).events;
  assert.deepEqual(ev, [
    { type: 'wonder', civ: 1, year: 300, era: 2 },
    { type: 'captured', civ: 2, year: 350, era: 2, other: 1 },
    { type: 'captured', civ: 0, year: 400, era: 3, other: null },
  ]);
  const many = new Records(3, 3, 10);
  for (let k = 0; k < 20; k++) many.building('captured', k % 3, 1, 100 + k, (k + 1) % 3);
  assert.equal(CAPTURES_LOGGED, 16);
  const logged = many.data(people, 500).events.filter((e) => e.type === 'captured');
  assert.equal(logged.length, 16);
  assert.deepEqual(logged.map((e) => e.year), Array.from({ length: 16 }, (_, k) => 100 + k), 'the first 16');
  // Wonders are not limited by the captures, and the log has room for everything.
  for (let e = 1; e <= 4; e++) many.building('wonder', 0, e, 900 + e, -1);
  assert.equal(many.data(people, 1000).events.filter((x) => x.type === 'wonder').length, 4);
  assert.ok(many.evCount <= many.room());
});

test('RULES.md "History log": on the same year famines, then level-ups and wonders, first contacts, milestones, extinctions', () => {
  const rec = new Records(3, 3, 10);
  const people = new People(4);
  rec.level(2, 2, 7);
  rec.building('captured', 1, 1, 7, 0);
  rec.building('wonder', 0, 1, 7, -1);
  const ev = rec.data(people, 8).events.filter((e) => e.year === 7);
  assert.deepEqual(ev.map((e) => [e.type, e.civ]), [['wonder', 0], ['captured', 1], ['level', 2]]);
});

test('RULES.md "History chronicle": finished wonders rank with level-ups, captures with first contacts, above milestones and famines', () => {
  const ms = (civ, year, people) => ({ type: 'milestone', civ, year, people });
  const events = [
    { type: 'extinction', civ: 2, year: 900 },
    { type: 'wonder', civ: 0, year: 300, era: 1 },
    { type: 'wonder', civ: 1, year: 600, era: 2 },
    { type: 'level', civ: 0, year: 200, level: 2 },
    ...Array.from({ length: 6 }, (_, k) => ({ type: 'captured', civ: k % 3, year: 700 + k, era: 1, other: (k + 1) % 3 })),
    ...Array.from({ length: 6 }, (_, k) => ms(k % 3, 100 + k, 100)),
    { type: 'famine', civ: 0, year: 50, endYear: 52, deaths: 500, startPop: 1000, ongoing: false },
  ];
  const lines = chronicle(events);
  assert.equal(lines.length, 12);
  const types = lines.map((e) => e.type);
  assert.equal(types.filter((t) => t === 'wonder').length, 2);
  assert.equal(types.filter((t) => t === 'captured').length, 6);
  assert.equal(types.filter((t) => t === 'extinction').length, 1);
  assert.equal(types.filter((t) => t === 'level').length, 1);
  assert.equal(types.filter((t) => t === 'milestone').length, 2, 'milestones fill what is left');
  assert.ok(!types.includes('famine'));
  assert.deepEqual(lines.map((e) => e.year), lines.map((e) => e.year).sort((a, b) => a - b), 'oldest first');
});

test('RULES.md End screen History: wonder lines read "finished", "captured … from …" and "took over the abandoned …"', () => {
  assert.equal(eventText({ type: 'wonder', civ: 0, year: 5, era: 2 }), 'Civ 1 finished the Hanging Gardens');
  assert.equal(eventText({ type: 'wonder', civ: 2, year: 5, era: 1 }), 'Civ 3 finished the Sun Circle');
  assert.equal(eventText({ type: 'captured', civ: 0, year: 5, era: 3, other: 1 }), 'Civ 1 captured the Great Wall from Civ 2');
  assert.equal(eventText({ type: 'captured', civ: 3, year: 5, era: 3, other: 0 }), 'Civ 4 captured the Great Wall from Civ 1', 'civ 0 is a real civ');
  assert.equal(eventText({ type: 'captured', civ: 1, year: 5, era: 3, other: null }), 'Civ 2 took over the abandoned Great Wall');
  assert.equal(eventText({ type: 'captured', civ: 1, year: 5, era: 4, other: null }), 'Civ 2 took over the abandoned Grand Library');
  assert.equal(eventText({ type: 'level', civ: 0, year: 5, level: 2 }), 'Civ 1 reached level 2, Farmers');
});

// ---- words ------------------------------------------------------------------------------------------------------

test('effectText and materialText: plain words for every bonus kind and material list', () => {
  assert.deepEqual(effectText({ birth: 0.0025 }), ['birth chance +0.25 pt']);
  assert.deepEqual(effectText({ birth: 0.01 }), ['birth chance +1 pt']);
  assert.deepEqual(effectText({ birth: 0.005 }), ['birth chance +0.5 pt']);
  assert.deepEqual(effectText({ food: 0.05 }), ['food capacity +5% in every hex it lives in']);
  assert.deepEqual(effectText({ foodHarsh: 0.25 }), ['food capacity +25% on hills, mountain, desert and tundra']);
  assert.deepEqual(effectText({ gather: 0.2 }), ['gathering +20%']);
  assert.deepEqual(effectText({ gather: 1 }), ['gathering ×2']);
  assert.deepEqual(effectText({ gatherRare: 0.3 }), ['gathering of uncommon and exotic materials +30%']);
  assert.deepEqual(effectText({ strength: 0.15 }), ['strength in fights +15%']);
  assert.deepEqual(effectText({ defence: 0.5 }), ['defence +50% in every hex it holds']);
  assert.deepEqual(effectText({ warLoss: 0.2 }), ['20% fewer war deaths when it loses a fight']);
  assert.deepEqual(effectText({ oldAge: 4 }), ['old age starts 4 years later']);
  assert.deepEqual(effectText({ hunger: 0.25 }), ['hunger\'s health loss −25%']);
  assert.deepEqual(effectText({ loyalty: 0.5 }), ['its people switch to other civs 50% less often']);
  assert.deepEqual(effectText({ attract: 0.5 }), ['people of other civs in its hexes join it 50% more often']);
  assert.deepEqual(effectText({ move: 1 }), ['+1 movement point (for walkers, the Nomadic)']);
  assert.deepEqual(effectText({ land: 0.1 }), ['hexes and people needed for levels −10%']);
  assert.deepEqual(effectText({ cost: 0.15 }), ['materials for levels and buildings −15%']);
  assert.deepEqual(effectText({ years: 0.3 }), ['years needed at a level −30%']);
  assert.deepEqual(effectText({}), []);
  assert.deepEqual(effectText({ strength: 0.25, warLoss: 0.2 }), ['strength in fights +25%', '20% fewer war deaths when it loses a fight']);
  assert.equal(materialText(M({ wood: 40, stone: 30, clay: 15 })), '40 wood, 30 stone, 15 clay');
  assert.equal(materialText(M({ iron: 80, gold: 15, gemstones: 8, spices: 10 })), '80 iron, 15 gold, 8 gemstones, 10 spices');
  assert.equal(materialText(M({})), '');
  assert.deepEqual(MATERIAL_NAMES.length, MATERIAL_COUNT);
});

test('RULES.md "Buildings and wonders" in How to play: the section\'s numbers are read from buildings.js', () => {
  const eras = eraFacts();
  assert.equal(eras.length, 4);
  eras.forEach((f, e) => {
    assert.equal(f.era, e + 1);
    assert.equal(f.cost, materialText(BUILDING_COST[e].materials));
    assert.equal(f.years, BUILDING_COST[e].years);
    assert.equal(f.perHex, REQUIREMENTS[e].perHex);
    assert.equal(f.wonder.name, WONDERS[e].name);
    assert.equal(f.wonder.cost, materialText(WONDERS[e].materials));
    assert.equal(f.wonder.years, WONDERS[e].years);
    assert.deepEqual(f.wonder.bonuses, effectText(WONDERS[e].effects));
  });
  const facts = buildingFacts();
  assert.deepEqual(facts.map((f) => f.type), CIV_TYPES);
  for (const f of facts) {
    assert.equal(f.name, CIV_TYPE_NAMES[f.type]);
    assert.deepEqual(f.buildings.map((b) => b.name), BUILDINGS[f.type].map((b) => b.name));
    f.buildings.forEach((b, e) => assert.deepEqual(b.bonuses, effectText(BUILDINGS[f.type][e].effects)));
  }
  const s = buildingsSection();
  assert.equal(s.id, 'buildings');
  assert.deepEqual(s.eras, eras);
  const text = [...s.paras, ...s.after].join(' ');
  assert.match(text, /10, 12, 14 and 16 at levels 1, 2, 3 and 4/);
  assert.match(text, /20 buildings in all|20 in all/);
  assert.match(text, /every 25 years/);
  assert.match(text, /Isolationist 1\.3/);
  assert.match(text, /Cooperative 1\.2/);
  assert.match(text, /Expansionist 0\.75/);
  assert.match(text, /× 1\.5/);
  assert.match(text, /200 years/);
  assert.match(text, /below 0\.5/);
  assert.match(text, /half of their materials/);
});

// ---- a seeded run -----------------------------------------------------------------------------------------------

test('a seeded run: civs build, buildings are deterministic, levels wait for them, hash is the same twice', () => {
  const run = () => {
    const sim = new Simulation({ seed: 'build-run', size: 14, civCount: 3, startPop: 60, civTypes: ['cooperative', 'expansionist', 'nomadic'] });
    const bd = sim.levels.buildings;
    const log = [];
    for (let y = 0; y < 500; y++) {
      sim.tick();
      for (let c = 0; c < 3; c++) {
        // A level above 1 only after the earlier era's building was standing at some point.
        if (sim.levels.level[c] > 1) assert.ok(bd.state[c * ERAS] === STANDING || bd.destroyed[c * ERAS] > 0, `civ ${c} year ${y} level ${sim.levels.level[c]}`);
      }
    }
    for (let c = 0; c < 3; c++) log.push([...bd.state.subarray(c * ERAS, (c + 1) * ERAS)], [...bd.work.subarray(c * ERAS, (c + 1) * ERAS)]);
    return { hash: sim.hash(), log, list: sim.buildings(), levels: [...sim.levels.level] };
  };
  const a = run();
  assert.deepEqual(run(), a);
  assert.ok(a.log.some((s) => s.some((v) => v > 0)), 'someone started or finished a building');
});
