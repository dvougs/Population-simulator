// RULES.md "Peace and trade" (Terms, Trade, Empire), "Settlements" holder, "Supply routes"
// through partners' land, and the diplomacy events in the History log, on hand-built worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Diplomacy, DIPLOMACY, TRADE, MATERIAL_VALUE, WAR, TRUCE, PEACE, NO_RELATION } from '../../src/sim/diplomacy.js';
import { Settlements, SETTLE } from '../../src/sim/settlements.js';
import { Contact } from '../../src/sim/contact.js';
import { Levels } from '../../src/sim/levels.js';
import { Records, EVENT_TYPES, DIPLOMACY_LOGGED } from '../../src/sim/records.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { eventText } from '../../src/ui/endScreen.js';
import { MATERIAL_COUNT, MATERIAL_IDS } from '../../src/sim/materials.js';
import { PLAINS, DEEP_WATER } from '../../src/sim/terrain.js';
import { STRENGTH, AGGRESSION, COOPERATION } from '../../src/sim/traits.js';
import { makeMap } from './helpers.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const near = (got, want, eps = 1e-6) => assert.ok(Math.abs(got - want) <= eps, `${got} vs ${want}`);
const M = MATERIAL_COUNT;
const WOOD = 0, STONE = 1, GOLD = 6;

// ---- the numbers ---------------------------------------------------------------------------------------------------

test('RULES.md "Peace and trade": the numbers', () => {
  assert.equal(DIPLOMACY.quietYears, 2);
  assert.equal(DIPLOMACY.span, 20);
  assert.equal(DIPLOMACY.exhaustPct, 10);
  assert.equal(DIPLOMACY.refuseWinThirds, 2);
  assert.equal(DIPLOMACY.truceYears, 50);
  assert.equal(DIPLOMACY.truceYearsAggressive, 30);
  assert.equal(DIPLOMACY.tribute, 0.2);
  assert.equal(DIPLOMACY.peaceAggression, 0.15);
  assert.equal(DIPLOMACY.tradeCalm, 0.05);
  assert.equal(DIPLOMACY.tradeCalmYears, 20);
  assert.equal(DIPLOMACY.tradeCalmMax, 0.15);
  assert.equal(DIPLOMACY.aggressivePeaceRatio, 1.5);
  assert.deepEqual({ ...TRADE.value }, { common: 1, uncommon: 4, exotic: 15 });
  assert.deepEqual([...MATERIAL_VALUE], [1, 1, 1, 4, 4, 4, 15, 15, 15]);
  assert.equal(TRADE.price, 1.25);
  assert.equal(TRADE.volume, 60);
  assert.equal(TRADE.market, 1.5);
  assert.equal(TRADE.coop, 1.25);
  assert.equal(TRADE.oldRoute, 1.5);
  assert.equal(TRADE.oldRouteYears, 50);
  assert.equal(TRADE.lossPerStep, 0.02);
  assert.equal(TRADE.minLoad, 0.01);
  assert.ok(RULES.includes('have not fought a battle in the last 2 years'));
  assert.ok(RULES.includes('Goods lose 2% of what was sent for every step'));
  assert.ok(RULES.includes('A pair may trade 60 value a year'));
});

// ---- relations and terms -------------------------------------------------------------------------------------------

const line = () => makeMap(10, 10, () => PLAINS);
const noForgive = () => {};
/** A Diplomacy over a plain map; fights and year ends are driven by hand. */
function dip(types = ['expansionist', 'expansionist']) {
  const d = new Diplomacy(line(), types);
  d.ev = [];
  d.on = (...a) => d.ev.push(a);
  d.forgiven = [];
  d.forgive = (a, b) => d.forgiven.push([a, b]);
  d.pop = new Int32Array(types.length).fill(100);
  d.fightY = (year, winner, loser, byW = 0, byL = 0) => d.fight(year, winner, loser, byW, byL, d.on);
  d.end = (year, st = { capital: [-1, -1], store: new Float64Array(0), storeCap: [] }) => d.endYear(year, d.pop, st, d.forgive, d.on);
  return d;
}

test('RULES.md "Peace and trade": civs that never fought have no relation; declare() makes war and logs a declaration; war stays war', () => {
  const d = dip();
  assert.equal(d.relation(0, 1), NO_RELATION);
  assert.equal(d.relation(0, 0), NO_RELATION);
  d.declare(0, 1, 5, d.on);
  assert.equal(d.relation(0, 1), WAR);
  assert.equal(d.relation(1, 0), WAR);
  assert.deepEqual(d.ev, [['declared', 0, 1, 5, NO_RELATION]]);
  assert.equal(d.fightY(6, 1, 0, 1, 0), false);
  assert.equal(d.relation(0, 1), WAR);
});

test('RULES.md "Terms" truce by quiet: 1 quiet year is not enough, 2 make a truce; nobody pays; revenge is forgiven', () => {
  const d = dip();
  d.fightY(10, 0, 1, 1, 0);
  d.end(10); assert.equal(d.relation(0, 1), WAR, 'year of the battle');
  d.end(11); assert.equal(d.relation(0, 1), WAR, '1 year');
  d.end(12);
  assert.equal(d.relation(0, 1), TRUCE);
  assert.deepEqual(d.ev, [['truce', 0, 1, 12, 0]]);
  assert.deepEqual(d.forgiven, [[0, 1]]);
  assert.equal(d.truces, 1);
  assert.equal(d.truceEnd[0 * 2 + 1], 62);
});

test('RULES.md "Terms" truce by quiet: the count runs from the declaration if later, and a battle in year 11 restarts it', () => {
  const d = dip();
  d.declare(0, 1, 10, d.on);
  d.end(11);
  assert.equal(d.relation(0, 1), WAR);
  d.end(12);
  assert.equal(d.relation(0, 1), TRUCE, 'two years after the declaration with no battle');
  const e = dip();
  e.fightY(10, 0, 1, 1, 0);
  e.fightY(11, 0, 1, 1, 0);
  e.end(12);
  assert.equal(e.relation(0, 1), WAR);
  e.end(13);
  assert.equal(e.relation(0, 1), TRUCE);
});

test('RULES.md "Terms" a truce lasts 50 years (30 with an Aggressive civ), then peace; a declaration breaks peace and the 2-year count starts again', () => {
  for (const [types, len] of [[['expansionist', 'cooperative'], 50], [['expansionist', 'aggressive'], 30]]) {
    const d = dip(types);
    d.fightY(1, 0, 1, 1, 0);
    d.end(3);
    assert.equal(d.relation(0, 1), TRUCE);
    d.end(3 + len - 1);
    assert.equal(d.relation(0, 1), TRUCE, `${len}: still a truce one year before`);
    d.end(3 + len);
    assert.equal(d.relation(0, 1), PEACE, `${len}: peace after`);
    d.end(3 + len + 500);
    assert.equal(d.relation(0, 1), PEACE, 'peace lasts');
  }
  const d = dip();
  d.fightY(1, 0, 1, 1, 0);
  d.end(3);
  d.end(53);
  assert.equal(d.relation(0, 1), PEACE);
  d.tradeYears[1] = 45; d.open[1] = 1;
  d.ev.length = 0;
  d.declare(1, 0, 100, d.on);
  assert.equal(d.relation(0, 1), WAR);
  assert.deepEqual(d.ev, [['declared', 1, 0, 100, PEACE]], 'the declaration reports the peace it broke');
  assert.equal(d.tradeYears[1], 0, 'the years of open trade start again');
  assert.equal(d.open[1], 0);
  d.end(101);
  assert.equal(d.relation(0, 1), WAR, 'the 2-year count starts again');
  d.end(102);
  assert.equal(d.relation(0, 1), TRUCE);
});

test('RULES.md "Terms" a fight resets the years of open trade', () => {
  const d = dip();
  d.fightY(1, 0, 1, 1, 0);
  d.end(21);
  d.tradeYears[1] = 45; d.open[1] = 1;
  d.fightY(30, 0, 1, 1, 0);
  assert.equal(d.tradeYears[1], 0);
  assert.equal(d.open[1], 0);
});

test('RULES.md "Terms" truce by exhaustion: war deaths of 10% of its people over the last 20 years (9 no, 10 yes); the loser asks and pays 20% of its capital store', () => {
  const d = dip();
  d.fightY(10, 1, 0, 9, 0); // civ 0 lost 9 of its 100
  d.end(10);
  assert.equal(d.relation(0, 1), WAR, '9 of 100 is not enough');
  d.fightY(11, 1, 0, 1, 0); // 10 in all
  const st = { capital: [0, 1], store: new Float64Array(2 * M), storeCap: [100, 100] };
  st.store[0 * M + WOOD] = 50; st.store[0 * M + GOLD] = 10;
  st.store[1 * M + WOOD] = 95;
  d.end(11, st);
  assert.equal(d.relation(0, 1), TRUCE);
  assert.deepEqual(d.ev.at(-1), ['truce', 0, 1, 11, 1], 'civ 0 asked: value is 1 + civ');
  near(st.store[0 * M + WOOD], 45, 1e-9); // 20% of 50 is 10, but civ 1 has room for 5
  near(st.store[1 * M + WOOD], 100, 1e-9);
  near(st.store[0 * M + GOLD], 8, 1e-9);
  near(st.store[1 * M + GOLD], 2, 1e-9);
});

test('RULES.md "Terms" exhaustion counts only the last 20 years: deaths 20 years back no longer count', () => {
  const d = dip();
  d.fightY(10, 1, 0, 10, 0);
  d.end(10);
  assert.equal(d.relation(0, 1), TRUCE); // this year and the 19 before
  const e = dip();
  e.fightY(10, 1, 0, 6, 0);
  e.end(10);
  for (let y = 11; y < 29; y++) e.end(y);
  e.fightY(29, 1, 0, 4, 0); // years 10 and 29 are both inside 29-19..29? 29-10 = 19: yes
  e.end(29);
  assert.equal(e.relation(0, 1), TRUCE);
  const f = dip();
  f.fightY(10, 1, 0, 6, 0);
  f.end(10);
  for (let y = 11; y < 30; y++) f.end(y);
  f.fightY(30, 1, 0, 4, 0); // year 10 has dropped out
  f.end(30);
  assert.equal(f.relation(0, 1), WAR);
});

test('RULES.md "Terms" if both are exhausted the larger share of its people asks, on a tie the lower civ', () => {
  const d = dip();
  d.pop[1] = 50;
  d.fightY(10, 0, 1, 20, 12); // civ 1 lost 20 of 50 (40%), civ 0 lost 12 of 100
  d.end(10);
  assert.deepEqual(d.ev.at(-1), ['truce', 0, 1, 10, 2]);
  const t = dip();
  t.fightY(10, 0, 1, 10, 10);
  t.end(10);
  assert.deepEqual(t.ev.at(-1), ['truce', 0, 1, 10, 1], 'tie: the lower civ asks');
});

test('RULES.md "Terms" Aggressive refuses a truce when it won at least 2 of 3 fights in the 20 years; 1 of 3 accepts', () => {
  const run = (winsByAggressive) => {
    const d = dip(['expansionist', 'aggressive']);
    for (let k = 0; k < 3; k++) {
      if (k < winsByAggressive) d.fightY(10 + k, 1, 0, k === 0 ? 10 : 0, 0);
      else d.fightY(10 + k, 0, 1, 0, 0);
    }
    d.end(12);
    return d;
  };
  assert.equal(run(3).relation(0, 1), WAR);
  assert.equal(run(2).relation(0, 1), WAR, '2 of 3 refuses');
  const ok = run(1);
  assert.equal(ok.relation(0, 1), TRUCE, '1 of 3 accepts');
  assert.equal(ok.truceEnd[1], 12 + 30, 'with an Aggressive civ the truce is 30 years');
  // An Aggressive asker is accepted by an ordinary civ however often that one won; quiet years never need consent.
  const q = dip(['expansionist', 'aggressive']);
  q.fightY(10, 1, 0, 10, 0);
  q.fightY(11, 1, 0, 0, 0);
  q.end(11);
  assert.equal(q.relation(0, 1), WAR, 'exhausted civ 0 asked the Aggressive winner (2 of 2), refused');
  q.end(13);
  assert.equal(q.relation(0, 1), TRUCE, 'quiet 2 years: truce anyway');
});

test('RULES.md "Terms" civs that died out keep their last relation', () => {
  const d = dip();
  d.fightY(1, 0, 1, 1, 0);
  d.pop[1] = 0;
  d.end(100);
  assert.equal(d.relation(0, 1), WAR);
});

test('RULES.md "Terms" tribute: the payer keeps what the other has no room for', () => {
  const d = dip();
  const st = { capital: [0, 1], store: new Float64Array(2 * M), storeCap: [100, 100] };
  st.store[0 * M + STONE] = 40;
  st.store[1 * M + STONE] = 100; // full
  d.tribute(st, 0, 1);
  assert.equal(st.store[0 * M + STONE], 40);
  st.store[1 * M + STONE] = 96;
  d.tribute(st, 0, 1);
  near(st.store[0 * M + STONE], 36);
  near(st.store[1 * M + STONE], 100);
});

test('RULES.md "Contact" calm: +0.15 at peace, +0.05 for every whole 20 years of trade, at most +0.15 more', () => {
  const d = dip();
  const calm = (t) => { d.tradeYears[1] = t; return d.calm(0, 1); };
  near(calm(0), 0.15, 1e-12);
  near(calm(19), 0.15, 1e-12);
  near(calm(20), 0.2, 1e-12);
  near(calm(40), 0.25, 1e-12);
  near(calm(60), 0.3, 1e-12);
  near(calm(1000), 0.3, 1e-12);
});

// ---- trade ---------------------------------------------------------------------------------------------------------

/**
 * Civ 0's capital is hex 40 and civ 1's is hex 43, on a straight row of plains (3 steps). Hexes 40, 41 are civ 0's and
 * 42, 43 civ 1's. wants/stores: { civ: { material: amount } }.
 */
function market({ types = ['expansionist', 'expansionist'], rel = PEACE, terrain = () => PLAINS, held = [0, 0, 1, 1], want = {}, store = {}, cap = 1e6 } = {}) {
  const map = makeMap(10, 10, terrain);
  const d = new Diplomacy(map, types);
  d.rel[1] = rel;
  const st = { capital: [40, 43], holder: new Int8Array(map.count).fill(-1), store: new Float64Array(map.count * M), storeCap: new Float64Array(map.count).fill(cap) };
  held.forEach((c, k) => { st.holder[40 + k] = c; });
  const w = new Float64Array(2 * M);
  for (const [c, mats] of Object.entries(want)) for (const [id, v] of Object.entries(mats)) w[c * M + MATERIAL_IDS.indexOf(id)] = v;
  for (const [c, mats] of Object.entries(store)) for (const [id, v] of Object.entries(mats)) st.store[st.capital[c] * M + MATERIAL_IDS.indexOf(id)] = v;
  const ev = [];
  const go = ({ boats = null, hasMarket = () => false, year = 1 } = {}) => d.trade(st, w, boats, hasMarket, year, (...a) => ev.push(a));
  const has = (c, id) => st.store[st.capital[c] * M + MATERIAL_IDS.indexOf(id)];
  return { map, d, st, ev, go, has };
}

test('RULES.md "Trade" a caravan: buys what it needs that the other has spare, pays 1.25 x in its own spare, 2% lost per step', () => {
  const t = market({ want: { 0: { stone: 10 } }, store: { 0: { wood: 100 }, 1: { stone: 100 } } });
  t.go();
  assert.equal(t.d.steps[1], 3);
  const keep = 1 - 0.02 * 3;
  const q = 10 / keep; // sent so that 10 arrive
  near(t.has(0, 'stone'), 10);
  near(t.has(1, 'stone'), 100 - q);
  const paid = q * 1.25;
  near(t.has(0, 'wood'), 100 - paid);
  near(t.has(1, 'wood'), paid * keep);
  assert.deepEqual(t.ev, [['trade', 0, 1, 1, 0]]);
  assert.equal(t.d.tradeYears[1], 1);
  assert.equal(t.d.tradeOpen(0, 1), true);
  near(t.d.bought[0], q);
  near(t.d.sold[1], q);
  // The first trade is an event once only.
  t.have = null;
  t.go({ year: 2 });
  assert.equal(t.ev.length, 1);
});

test('RULES.md "Trade" values: a unit of exotic is worth 15, uncommon 4, common 1, the buyer pays 1.25 x that in its spare', () => {
  for (const [id, value] of [['gold', 15], ['iron', 4], ['stone', 1]]) {
    const t = market({ want: { 0: { [id]: 1 } }, store: { 0: { wood: 100 }, 1: { [id]: 50 } } });
    t.go();
    const q = 1 / 0.94;
    near(t.has(0, id), 1);
    near(t.has(1, id), 50 - q);
    near(t.has(0, 'wood'), 100 - q * value * 1.25, 1e-9);
  }
});

test('RULES.md "Trade" a buyer cannot buy more than it can pay for', () => {
  // 5 spare wood pays for 5 / 1.25 = 4 value of stone.
  const t = market({ want: { 0: { stone: 50 } }, store: { 0: { wood: 5 }, 1: { stone: 100 } } });
  t.go();
  near(t.has(1, 'stone'), 100 - 4);
  near(t.has(0, 'wood'), 0, 1e-9);
  near(t.has(0, 'stone'), 4 * 0.94);
  // A buyer with nothing spare buys nothing, and then there is no trade event.
  const n = market({ want: { 0: { stone: 50 } }, store: { 1: { stone: 100 } } });
  n.go();
  assert.equal(n.has(0, 'stone'), 0);
  assert.deepEqual(n.ev, []);
  // The wanted stock is not spare: the seller keeps what it is saving for.
  const k = market({ want: { 0: { stone: 50 }, 1: { stone: 100 } }, store: { 0: { wood: 100 }, 1: { stone: 100 } } });
  k.go();
  assert.equal(k.has(0, 'stone'), 0);
});

test('RULES.md "Trade" volume: 60 value a year, half each way; x1.5 Market, x1.25 Cooperative, x1.5 old route (after 50 years of open trade)', () => {
  const vol = (opts, go = {}) => {
    const t = market({ want: { 0: { stone: 1000 } }, store: { 0: { wood: 1000 }, 1: { stone: 1000 } }, ...opts });
    if (go.years) t.d.tradeYears[1] = go.years;
    t.go({ hasMarket: go.market ? (h) => h === 43 : () => false });
    return t.d.bought[0];
  };
  near(vol(), 30, 1e-9);
  near(vol({}, { market: true }), 45, 1e-9);
  near(vol({ types: ['cooperative', 'expansionist'] }), 37.5, 1e-9);
  near(vol({ types: ['expansionist', 'cooperative'] }), 37.5, 1e-9);
  near(vol({}, { years: 48 }), 30, 1e-9);
  near(vol({}, { years: 49 }), 45, 1e-9, 'the 50th year of open trade is an old route');
  near(vol({ types: ['cooperative', 'expansionist'] }, { market: true, years: 49 }), 30 * 1.5 * 1.25 * 1.5, 1e-9);
  // Both directions: each side buys up to half.
  const t = market({ want: { 0: { stone: 1000 }, 1: { wood: 1000 } }, store: { 0: { wood: 1000 }, 1: { stone: 1000 } } });
  t.go();
  near(t.d.bought[0], 30, 1e-9);
  near(t.d.bought[1], 30, 1e-9);
});

test('RULES.md "Trade" exotic materials are bought first, and the oldRoute event is logged once at 50 years', () => {
  const t = market({ want: { 0: { gold: 1000, stone: 1000 } }, store: { 0: { wood: 1000 }, 1: { gold: 1000, stone: 1000 } } });
  t.go();
  near(t.has(0, 'gold') / 0.94 * 15, 30, 1e-9);
  assert.equal(t.has(0, 'stone'), 0, 'the 30 value budget was spent on gold');
  const o = market({ want: {}, store: {} });
  o.d.tradeYears[1] = 48;
  o.go({ year: 7 }); assert.deepEqual(o.ev, []);
  o.go({ year: 8 }); assert.deepEqual(o.ev, [['oldRoute', 0, 1, 8, 0]]);
  o.go({ year: 9 }); assert.equal(o.ev.length, 1);
});

test('RULES.md "Trade" only pairs in a truce or at peace trade; war or no relation does not', () => {
  for (const rel of [NO_RELATION, WAR]) {
    const t = market({ rel, want: { 0: { stone: 10 } }, store: { 0: { wood: 100 }, 1: { stone: 100 } } });
    t.d.tradeYears[1] = 7;
    t.go();
    assert.equal(t.has(0, 'stone'), 0);
    assert.equal(t.d.tradeOpen(0, 1), false);
    assert.equal(t.d.tradeYears[1], 7, 'unchanged by a closed year');
  }
  const tr = market({ rel: TRUCE, want: { 0: { stone: 10 } }, store: { 0: { wood: 100 }, 1: { stone: 100 } } });
  tr.go();
  near(tr.has(0, 'stone'), 10);
});

test('RULES.md "Trade" the road: over either civ\'s land only; land nobody holds or a third civ holds blocks it', () => {
  const steps = (opts, boats = null) => { const t = market(opts); t.go({ boats }); return t.d.steps[1]; };
  assert.equal(steps({}), 3);
  assert.equal(steps({ held: [0, 0, 0, 1] }), 3);
  assert.equal(steps({ held: [0, -1, 1, 1] }), -1, 'land nobody holds');
  assert.equal(steps({ types: ['expansionist', 'expansionist', 'expansionist'], held: [0, 2, 1, 1] }), -1, 'a third civ\'s land');
  const t = market({ held: [0, -1, 1, 1] });
  t.go();
  assert.equal(t.d.tradeOpen(0, 1), false, 'no road, no open trade');
  assert.equal(t.d.tradeYears[1], 0);
});

test('RULES.md "Trade" the road crosses water within the larger boat range of the two', () => {
  const wet = (i) => (i === 41 || i === 42 ? DEEP_WATER : PLAINS);
  const steps = (boats) => { const t = market({ terrain: wet, held: [0, -1, -1, 1] }); t.go({ boats }); return t.d.steps[1]; };
  assert.equal(steps(null), -1);
  assert.equal(steps([0, 0]), -1);
  assert.equal(steps([1, 0]), -1, 'two water hexes in a row, range 1');
  assert.equal(steps([2, 0]), 3);
  assert.equal(steps([0, 2]), 3, 'the larger of the two');
});

// ---- the empire ---------------------------------------------------------------------------------------------------

const rowLand = (i) => (i >= 50 && i < 60 ? PLAINS : DEEP_WATER); // a single row 50 to 59
function empire(types, put, { open = 0, boats = 0, terrain = rowLand } = {}) {
  const map = makeMap(10, 10, terrain);
  const st = new Settlements(map, types, 'seed');
  const civs = types.length;
  st.open = new Uint8Array(civs * civs);
  if (open) st.open[1] = 1;
  st.boats = new Int32Array(civs).fill(boats);
  const cnt = new Int32Array(map.count * civs);
  for (const [h, c, n] of put) cnt[h * civs + c] = n;
  st.update(cnt, new Int8Array(map.count).fill(-1), new Uint8Array(civs).fill(1), 1, null);
  st.connect(map);
  return { map, st, cut: (h) => st.cut[h] };
}

test('RULES.md "Empire": hexes joined to the capital over own land are not cut; one behind another civ\'s land is an enclave', () => {
  const put = [[50, 0, 20], [51, 0, 5], [52, 1, 10], [53, 0, 3]];
  const e = empire(['expansionist', 'expansionist'], put);
  assert.deepEqual([50, 51, 52, 53].map(e.cut), [0, 0, 0, 1]);
  assert.equal(e.st.capital[0], 50);
  assert.equal(e.st.capital[1], 52);
  assert.equal(e.cut(54), 0, 'a hex nobody holds is not an enclave');
});

test('RULES.md "Empire": land of a civ it trades with, empty land and boat range join hexes', () => {
  const put = [[50, 0, 20], [51, 0, 5], [52, 1, 10], [53, 0, 3]];
  const e = empire(['expansionist', 'expansionist'], put, { open: true });
  assert.deepEqual([50, 51, 52, 53].map(e.cut), [0, 0, 0, 0], 'trade open: through the partner\'s land');
  const gap = empire(['expansionist', 'expansionist'], [[50, 0, 20], [53, 0, 3]]);
  assert.equal(gap.cut(53), 0, 'over empty land');
  const sea = (boats) => empire(['expansionist'], [[50, 0, 20], [53, 0, 3]], { boats, terrain: (i) => (i === 51 || i === 52 ? DEEP_WATER : rowLand(i)) });
  assert.equal(sea(1).cut(53), 1, 'two water hexes in a row, boat range 1');
  assert.equal(sea(2).cut(53), 0, 'range 2');
});

test('RULES.md "Empire": the totals leave out the stores of enclaves', () => {
  const e = empire(['expansionist', 'expansionist'], [[50, 0, 20], [51, 0, 5], [52, 1, 10], [53, 0, 3]]);
  e.st.store[51 * M + WOOD] = 7;
  e.st.store[53 * M + WOOD] = 100;
  const out = new Float64Array(2 * M);
  e.st.totals(out);
  assert.equal(out[0 * M + WOOD], 7);
});

test('RULES.md "Empire": an enclave gathers 50% as much', () => {
  const gathered = (blocker) => {
    const map = makeMap(10, 10, rowLand);
    map.deposits[57] |= 1 << WOOD;
    const people = new People(256);
    const put = (hex, civ, n) => { for (let k = 0; k < n; k++) { const i = people.add(hex, civ, 25, 100, 0); people.traits[COOPERATION][i] = 0.5; } };
    put(55, 0, 50); put(57, 0, 20);
    if (blocker) put(56, 1, 60);
    const levels = new Levels(map, ['expansionist', 'expansionist']);
    const cnt = new Int32Array(map.count * 2);
    for (let i = 0; i < people.high; i++) if (people.alive[i]) cnt[people.hex[i] * 2 + people.civ[i]]++;
    levels.hungryHex.fill(0);
    levels.year(people, map, 1, cnt, new Int8Array(map.count).fill(-1), () => {}, () => {});
    return { g: levels.gathered[57 * 2], cut: levels.settlements.cut[57] };
  };
  const free = gathered(false);
  const cutOff = gathered(true);
  assert.equal(free.cut, 0);
  assert.equal(cutOff.cut, 1);
  assert.ok(free.g > 0);
  near(cutOff.g, free.g * 0.5, 1e-6);
});

// ---- settlements ---------------------------------------------------------------------------------------------------

function holders(rel, first, second, types = ['expansionist', 'expansionist']) {
  const map = makeMap(10, 10, () => PLAINS);
  const st = new Settlements(map, types, 'seed');
  st.rel = new Uint8Array(types.length * types.length);
  st.rel[1] = rel;
  const civs = types.length;
  const level = new Uint8Array(civs).fill(1);
  const upd = (counts, year) => {
    const cnt = new Int32Array(map.count * civs);
    for (const [c, n] of counts) cnt[41 * civs + c] = n;
    st.update(cnt, new Int8Array(map.count).fill(-1), level, year, null);
  };
  upd(first, 1);
  upd(second, 2);
  return st.holder[41];
}

test('RULES.md "Settlements" holder: 1.25 x takes a hex at war or with no relation, never in a truce or at peace (unless the holder left)', () => {
  for (const [rel, takes] of [[NO_RELATION, 1], [WAR, 1], [TRUCE, 0], [PEACE, 0]]) {
    assert.equal(holders(rel, [[0, 20]], [[0, 20], [1, 25]]), takes, `relation ${rel}: 25 v 20 (1.25 x)`);
  }
  assert.equal(holders(WAR, [[0, 20]], [[0, 20], [1, 24]]), 0, 'just under 1.25 x holds');
  assert.equal(holders(TRUCE, [[0, 20]], [[0, 20], [1, 100]]), 0, 'any numbers');
  assert.equal(holders(PEACE, [[0, 20]], [[0, 0], [1, 3]]), 1, 'a hex whose holder left changes hands');
});

// ---- food through partners' land -----------------------------------------------------------------------------------

/** Row 4 of a 20-wide map is hexes 80 to 99, a line. The supplier at 80 (20 people, full food); the hungry settlement at 80 + gap (20 people, no food). */
function foodLine(gap, { between = 0, open = 0, size = 20 } = {}) {
  const types = ['expansionist', 'expansionist'];
  const map = makeMap(size, size, () => PLAINS);
  const st = new Settlements(map, types, 'seed');
  st.open = new Uint8Array(4);
  st.open[1] = open;
  const cnt = new Int32Array(map.count * 2);
  cnt[80 * 2 + 0] = 20;
  cnt[(80 + gap) * 2 + 0] = 20;
  for (let h = 81; h < 80 + gap; h++) cnt[h * 2 + between] = 1;
  st.update(cnt, new Int8Array(map.count).fill(-1), new Uint8Array(2).fill(1), 1, null);
  for (let h = 81; h < 80 + gap; h++) map.food[h] = 0;
  map.food[80 + gap] = 0;
  st.hungry = new Int32Array(map.count);
  st.hungry[80 + gap] = 2;
  st.carry(map, new Float64Array(2 * MATERIAL_COUNT), 2);
  return map.food[80 + gap];
}

test('RULES.md "Supply routes": food goes up to 12 steps and loses 4% a step (12 steps: 10 sent, 5.2 arrive; 13 steps: none)', () => {
  near(foodLine(1), 9.6, 1e-5);
  near(foodLine(12), 10 * (1 - 0.04 * 12), 1e-5);
  assert.equal(foodLine(13), 0);
});

test('RULES.md "Supply routes": food passes through the land of a civ it trades with, but not one it does not trade with', () => {
  near(foodLine(3, { between: 1, open: 1 }), 10 * (1 - 0.04 * 3), 1e-5);
  assert.equal(foodLine(3, { between: 1, open: 0 }), 0);
  near(foodLine(3, { between: 0, open: 0 }), 10 * (1 - 0.04 * 3), 1e-5, 'own land needs no partner');
});

// ---- records and text ----------------------------------------------------------------------------------------------

test('RULES.md History log: diplomacy events (truce with its tribute payer, war, trade, old route), at most 24 kept', () => {
  assert.equal(DIPLOMACY_LOGGED, 24);
  for (const t of ['truce', 'warAgain', 'trade', 'oldRoute']) assert.ok(EVENT_TYPES.includes(t), t);
  const people = new People(8);
  const rec = new Records(3, 3);
  rec.diplomacy('truce', 0, 1, 30, 2);
  rec.diplomacy('truce', 0, 2, 31, 0);
  rec.diplomacy('war', 0, 1, 90, 0);
  rec.diplomacy('trade', 1, 2, 40, 0);
  rec.diplomacy('oldRoute', 1, 2, 90, 0);
  rec.diplomacy('nonsense', 1, 2, 90, 0);
  const ev = rec.data(people, 100).events;
  assert.deepEqual(ev.map((e) => [e.type, e.year, e.civ, e.other]), [
    ['truce', 30, 0, 1], ['truce', 31, 0, 2], ['trade', 40, 1, 2], ['oldRoute', 90, 1, 2], ['warAgain', 90, 0, 1],
  ]);
  assert.equal(ev.find((e) => e.year === 30).tribute, 1, 'value 2 means civ 1 paid');
  assert.equal(ev.find((e) => e.year === 31).tribute, null);
  const many = new Records(3, 3);
  for (let k = 0; k < 40; k++) many.diplomacy('trade', 0, 1, k, 0);
  assert.equal(many.data(people, 100).events.filter((e) => e.type === 'trade').length, 24);
});

test('RULES.md "End screen" History lines for diplomacy events', () => {
  assert.equal(eventText({ type: 'truce', civ: 0, other: 1, year: 30, tribute: null }), 'Civ 1 and Civ 2 made a truce');
  assert.equal(eventText({ type: 'truce', civ: 0, other: 1, year: 30, tribute: 0 }), 'Civ 1 and Civ 2 made a truce; Civ 1 asked for it and paid tribute');
  assert.equal(eventText({ type: 'warAgain', civ: 0, other: 2, year: 90 }), 'Civ 1 and Civ 3 went back to war');
  assert.equal(eventText({ type: 'trade', civ: 1, other: 2, year: 40 }), 'Civ 2 and Civ 3 began to trade');
  assert.equal(eventText({ type: 'oldRoute', civ: 1, other: 2, year: 90 }), 'The trade road between Civ 2 and Civ 3 became an old route');
});

// ---- seeded runs ---------------------------------------------------------------------------------------------------

test('seeded run: relations and trade show up in stats, nobody fights battles inside a truce or at peace, and the same params give the same hash', () => {
  const run = () => {
    const s = new Simulation({ seed: 'peace2', size: 12, civCount: 4, startPop: 40, civTypes: ['aggressive', 'expansionist', 'cooperative', 'aggressive'] });
    const fought = [];
    const onBattle = s.onBattle;
    s.onBattle = (h, a, d, ...rest) => {
      const r = s.diplomacy.relation(a, d);
      if (r === TRUCE || r === PEACE) fought.push([s.tickCount, a, d]);
      return onBattle(h, a, d, ...rest);
    };
    s.tick(400);
    return { s, fought };
  };
  const a = run();
  const b = run();
  assert.equal(a.s.hash(), b.s.hash());
  assert.deepEqual(a.fought, [], 'a battle fought in a truce or at peace');
  const st = a.s.stats();
  assert.ok(st.truces > 0, 'truces were made');
  assert.ok(st.relations.some((r) => r.relation === 'peace' && r.tradeOpen), 'a pair at peace trades');
  assert.ok(st.civs.some((c) => c.trade.bought > 0 && c.trade.partner >= 0));
  const types = new Set(a.s.records.data(a.s.people, 400).events.map((e) => e.type));
  assert.ok(types.has('truce') && types.has('trade'));
  assert.ok(a.s.levels.settlements.store.every((v) => v >= 0), 'no store below 0');
  assert.equal(typeof st.truces, 'number');
  for (const r of st.relations) assert.ok(['war', 'truce', 'peace'].includes(r.relation));
  for (const c of st.civs) assert.ok(c.trade.bought >= 0 && c.trade.sold >= 0 && c.trade.partner >= -1);
});
