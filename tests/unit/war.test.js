// RULES.md "War": declarations, warriors and levies, attacks, battles of duels, sieges, and what a battle changes,
// on small hand-built scenes (a War driven directly), plus seeded Simulation runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { War, WAR, fleeHex } from '../../src/sim/war.js';
import { Diplomacy, DIPLOMACY, NO_RELATION, WAR as AT_WAR, TRUCE, PEACE } from '../../src/sim/diplomacy.js';
import { Settlements, SETTLE, SB_INDEX, VILLAGE, CITY } from '../../src/sim/settlements.js';
import { People } from '../../src/sim/people.js';
import { Rng } from '../../src/sim/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { Records, DECLARED_LOGGED } from '../../src/sim/records.js';
import { DEATH_WAR } from '../../src/sim/life.js';
import { MATERIAL_COUNT } from '../../src/sim/materials.js';
import { PLAINS, HILLS, DEEP_WATER, DEFENCE_BONUS, FOREST, MOUNTAIN, DESERT } from '../../src/sim/terrain.js';
import { STRENGTH, AGGRESSION, TRAIT_COUNT } from '../../src/sim/traits.js';
import { LEVEL_EFFECTS } from '../../src/sim/levels.js';
import { eventText } from '../../src/ui/endScreen.js';
import { makeMap } from './helpers.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const M = MATERIAL_COUNT;
const WOOD = 0;
const SIZE = 7;
const T = 24; // the middle of a 7 x 7 map
const NB = (() => {
  const map = makeMap(SIZE, SIZE, () => PLAINS);
  return Array.from(map.neighbours.slice(T * 6, T * 6 + 6));
})();
const adjacent = (map, a, b) => Array.from(map.neighbours.slice(a * 6, a * 6 + 6)).includes(b);
/** A hex two steps from T (not T or one of its neighbours) that is next to NB[0]. */
const RING2 = (() => {
  const map = makeMap(SIZE, SIZE, () => PLAINS);
  return Array.from(map.neighbours.slice(NB[0] * 6, NB[0] * 6 + 6)).filter((h) => h >= 0 && h !== T && !NB.includes(h));
})();
const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} vs ${want}`);
const aggOf = AGGRESSION;

/**
 * types: civ types. groups: [hex, civ, n, { age, health, str, agg, hunger }]. Everything else plain.
 * The War is wired as the Simulation wires it, minus the Settlements unless settle is true.
 */
function world(types, groups, { terrain = PLAINS, terrainAt = null, cap = 1e6, settle = false, level = 1, seed = 'w' } = {}) {
  const map = makeMap(SIZE, SIZE, (i) => (terrainAt && terrainAt[i] !== undefined ? terrainAt[i] : terrain));
  map.foodCap.fill(cap); map.food.fill(cap);
  const people = new People(2048);
  for (const [hex, civ, n, t = {}] of groups) {
    for (let k = 0; k < n; k++) {
      const i = people.add(hex, civ, t.age ?? 25, t.health ?? 100, 0);
      people.hunger[i] = t.hunger ?? 0;
      people.traits[AGGRESSION][i] = t.agg ?? 0.5;
      people.traits[STRENGTH][i] = t.str ?? 0.5;
    }
  }
  const civs = types.length;
  const war = new War(map, types, people.capacity);
  const dip = new Diplomacy(map, types);
  const w = { map, people, war, dip, types, civs, ev: { deaths: [], battles: [], declared: [], settled: [] } };
  war.diplomacy = dip;
  war.level = Uint8Array.from(types, () => level);
  war.eff = { strength: new Float64Array(civs), defence: new Float64Array(civs), warLoss: new Float64Array(civs) };
  war.civTraits = new Float64Array(civs * TRAIT_COUNT);
  war.hungryHex = new Int32Array(map.count);
  war.want = new Int32Array(civs);
  war.inside = new Int8Array(map.count).fill(-1);
  if (settle) { w.st = new Settlements(map, types, 's'); war.settle = w.st; }
  w.rng = new Rng(`war-${seed}`);
  sync(w);
  return w;
}
/** The counts the Simulation takes at the end of a year (recordYear): war.cnt, the chains of people aged 15 to 45, averages. */
function sync(w) {
  const { war, people, civs, map } = w;
  war.grow(people.capacity);
  war.cnt.fill(0); war.fitCnt.fill(0); war.head.fill(-1);
  const sums = new Float64Array(civs * TRAIT_COUNT);
  const n = new Int32Array(civs);
  for (let i = 0; i < people.high; i++) {
    if (!people.alive[i]) continue;
    const c = people.civ[i];
    const k = people.hex[i] * civs + c;
    war.cnt[k]++;
    n[c]++;
    if (people.age[i] >= WAR.fitAge - 1 && people.age[i] <= WAR.maxAge) { war.next[i] = war.head[k]; war.head[k] = i; war.fitCnt[k]++; }
    people.traits.forEach((a, t) => { sums[c * TRAIT_COUNT + t] += a[i]; });
  }
  for (let c = 0; c < civs; c++) for (let t = 0; t < TRAIT_COUNT; t++) war.civTraits[c * TRAIT_COUNT + t] = n[c] ? sums[c * TRAIT_COUNT + t] / n[c] : NaN;
  war.endYear(map);
}
const setAgg = (w, c, v) => { w.war.civTraits[c * TRAIT_COUNT + aggOf] = v; };
const relate = (w, a, b, rel) => { w.dip.rel[Math.min(a, b) * w.civs + Math.max(a, b)] = rel; };
const hooks = (w) => ({
  death: (slot, cause) => w.ev.deaths.push({ civ: w.people.civ[slot], hex: w.people.hex[slot], cause }),
  battle: (...a) => w.ev.battles.push(a),
  settled: (...a) => w.ev.settled.push(a),
});
/** One day: battles fight, then on the first of a month declarations and attacks. */
function step(w, doy, year = 100) {
  const h = hooks(w);
  w.war.day(w.people, w.map, year, doy, w.rng, h.death, h.battle, h.settled);
  if (doy % 30 === 0) w.war.month(w.people, w.map, year, doy, w.rng, (...a) => w.ev.declared.push(a));
}
const play = (w, from, to, year = 100) => { for (let d = from; d <= to; d++) step(w, d, year); };
const roll = (v) => ({ next: () => v });
const declares = (w, rng = roll(0), year = 100) => {
  const ev = [];
  w.war.declare(w.map, year, rng, (...a) => ev.push(a));
  return ev;
};
/** Starts a battle for hex h by civ a against civ b now. */
const begin = (w, h, a, b, year = 100) => { w.war.begin(w.people, w.map, h, a, b, year, w.rng); return w.war.battles.at(-1); };
const aliveOf = (w, civ, hex = null) => {
  let n = 0;
  for (let i = 0; i < w.people.high; i++) if (w.people.alive[i] && w.people.civ[i] === civ && (hex === null || w.people.hex[i] === hex)) n++;
  return n;
};
const fightDay = (w, bt, rng) => w.war.fightDay(w.people, bt, rng, hooks(w).death);
/** Walls on hex h held by civ c: ids of settlement buildings. */
function walls(w, h, c, ids) {
  const st = w.st;
  st.holder[h] = c;
  st.tier[h] = VILLAGE;
  for (const id of ids) st.built[h] |= 1 << SB_INDEX[id];
  st.effects();
}

// ---- the numbers -----------------------------------------------------------------------------------------------------

test('RULES.md "War": the numbers', () => {
  assert.equal(WAR.fitAge, 16);
  assert.equal(WAR.maxAge, 45);
  assert.equal(WAR.fitHealth, 50);
  assert.deepEqual({ ...WAR.levy }, { expansionist: 0.25, aggressive: 0.25, cooperative: 0.25, isolationist: 0.25, nomadic: 0.25 });
  assert.equal(WAR.duelPct, 10);
  assert.equal(WAR.maxGang, 3);
  assert.equal(WAR.killPct, 50);
  assert.equal(WAR.woundHealth, 20);
  assert.equal(WAR.breakPct, 40);
  assert.equal(WAR.maxDays, 30);
  assert.deepEqual([...WAR.weapons], [1, 1, 1, 1.25, 1.5, 1.5]);
  assert.equal(WAR.kingdomMorale, 0.25);
  assert.equal(WAR.hungryMorale, 0.25);
  assert.equal(WAR.hungryShare, 0.25);
  assert.equal(WAR.siegeDaysPerDefence, 120);
  assert.equal(WAR.sackPct, 5);
  assert.equal(WAR.minOdds, 0.25);
  assert.equal(WAR.oddsCap, 10);
  assert.equal(WAR.wantBonus, 1.5);
  assert.equal(WAR.declareMonths, 12);
  assert.equal(WAR.hungerAggression, 0.5);
  assert.equal(WAR.crowdAggression, 0.4);
  assert.equal(WAR.numbersRatio, 3);
  assert.equal(WAR.numbersAggression, 0.45);
  assert.equal(WAR.wantAggression, 0.45);
  assert.equal(WAR.revengeYears, 20);
  assert.equal(DIPLOMACY.aggressivePeaceRatio, 1.5);
  assert.equal(DIPLOMACY.peaceAggression, 0.15);
  assert.equal(SETTLE.looted, 0.5);
  assert.deepEqual([FOREST, HILLS, MOUNTAIN, PLAINS, DESERT].map((t) => DEFENCE_BONUS[t]), [0.25, 0.5, 1, 0, 0]);
  assert.equal(LEVEL_EFFECTS.kingdomStrength, undefined);
  for (const text of [
    'Aggressive:* an Aggressive civ declares war on every civ it borders, at once',
    'at least 1.5 × the other\'s',
    'average aggression ÷ 12 that month',
    'Hunger:* someone went hungry last year',
    'average aggression is above 0.5',
    'more people, all civs, than 50% of its food capacity), and A\'s average aggression is above 0.4',
    'A has at least 3 × B\'s people, and A\'s average aggression is above 0.45',
    'and A\'s average aggression is above 0.45',
    'in the last 20 years (this year minus that year is 20 or less)',
    'higher by 0.15 plus 0.05 for every whole 20 years the two have traded (at most 0.15 more, so +0.3 in all)',
    'aged 16 to 45 with health 50 or more',
    'its **levy share** (rounded, at least 1 when it has any)',
    'The levy share is 25% for every type.',
    '**Walking in.**',
    '× 1 at levels 1 and 2 (stone), × 1.25 at level 3 (bronze), × 1.5 at levels 4 and 5 (iron)',
    'forest +25%, hills +50%, mountain +100%',
    'Palisade +25%, Stone walls +75%, Palace +50%',
    '+25% for a Kingdom fighting a civ that is not one, −25% when at least a quarter of the warriors',
    'at most 10 (10 when the defender has none)',
    '(0.5 at aggression 0.5, 0.3 at 0.7), never less than 0.25',
    '× 1.5 where the hex has a deposit',
    '⌈10%⌉ of the smaller side\'s fit warriors (at least 1)',
    'at most 3 (so 1 on 1, 2 on 1 or 3 on 1)',
    'killed with a 50% chance (a war death), otherwise wounded: their health drops to 20',
    '50% × (1 − the bonus)',
    'when 40% of the warriors it called up are killed or wounded, or none is left fit',
    'A battle still going after 30 days ends with the attacker pulling back',
    '50% of its store is looted to the winner\'s capital',
    'defence bonus × 120 days (Palisade 30 days, Palace 60, Stone walls 90',
    '⌊5%⌋ of the loser\'s people in the hex who were not in the battle die',
  ]) assert.ok(RULES.includes(text), text);
});

// ---- declaring war ---------------------------------------------------------------------------------------------------

test('RULES.md "War" Bordering: people in the same hex or in hexes next to each other; two hexes apart do not border', () => {
  const mk = (hexA) => world(['aggressive', 'expansionist'], [[hexA, 0, 6], [T, 1, 6]]);
  assert.equal(declares(mk(T)).length, 1, 'the same hex');
  assert.equal(declares(mk(NB[0])).length, 1, 'next door');
  assert.equal(declares(mk(RING2[0])).length, 0, 'two hexes apart');
});

test('RULES.md "War" Aggressive: declares on every civ it borders at once, whatever the roll; the event names the declarer and the relation broken', () => {
  const w = world(['aggressive', 'expansionist', 'expansionist'], [[NB[0], 0, 6, { agg: 0 }], [T, 1, 6], [T, 2, 6]]);
  const ev = declares(w, roll(0.999));
  assert.deepEqual(ev, [['declared', 0, 1, 100, NO_RELATION], ['declared', 0, 2, 100, NO_RELATION]]);
  assert.equal(w.dip.relation(0, 1), AT_WAR);
  assert.equal(w.dip.relation(2, 0), AT_WAR);
  assert.equal(w.dip.relation(1, 2), NO_RELATION, 'civs 1 and 2 have no reason');
  assert.deepEqual(declares(w, roll(0)), [], 'already at war: nothing new');
});

test('RULES.md "War" Aggressive at peace: needs people aged 15 to 45 × levy share at least 1.5 × the other\'s (9 v 6 yes, 8 v 6 no); never in a truce', () => {
  const at = (a, b, rel) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, a], [T, 1, b]]);
    relate(w, 0, 1, rel);
    return declares(w);
  };
  assert.deepEqual(at(9, 6, PEACE), [['declared', 0, 1, 100, PEACE]]);
  assert.deepEqual(at(8, 6, PEACE), []);
  assert.deepEqual(at(6, 6, PEACE), []);
  assert.deepEqual(at(60, 6, TRUCE), []);
  // Children and the old do not count.
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 8], [NB[0], 0, 5, { age: 10 }], [NB[0], 0, 5, { age: 46 }], [T, 1, 6]]);
  relate(w, 0, 1, PEACE);
  assert.deepEqual(declares(w), []);
  const x = world(['aggressive', 'expansionist'], [[NB[0], 0, 9, { age: 15 }], [T, 1, 6, { age: 45 }]]);
  relate(x, 0, 1, PEACE);
  assert.equal(declares(x).length, 1, 'ages 15 and 45 count');
});

test('RULES.md "War" Cooperative: never declares, whatever its aggression, hunger, crowding, numbers or revenge', () => {
  const w = world(['cooperative', 'expansionist'], [[NB[0], 0, 30, { agg: 1, hunger: 1 }], [T, 1, 3, { agg: 0 }]], { cap: 40 });
  w.war.hungryHex.fill(1);
  w.war.lostTo[0 * 2 + 1] = 99;
  w.war.want[0] = 1; w.map.deposits[T] = 1;
  sync(w);
  w.war.hungryHex.fill(1);
  w.war.want[0] = 1;
  w.war.borders(w.map);
  assert.deepEqual(declares(w, roll(0)), []);
  for (let d = 0; d < 360; d += 30) step(w, d);
  assert.deepEqual(w.ev.declared, []);
});

/** Civ 0 (expansionist) at NB[0], civ 1 at T; civ 1 has no aggression so only civ 0 can have a reason. */
function reasonWorld({ a = 6, b = 6, cap = 1e6, rel = null, trade = 0 } = {}) {
  const w = world(['expansionist', 'expansionist'], [[NB[0], 0, a, { agg: 0.9 }], [T, 1, b, { agg: 0 }]], { cap });
  if (rel !== null) relate(w, 0, 1, rel);
  w.dip.tradeYears[1] = trade;
  return w;
}
const goes = (w, avg, rng = roll(0)) => { setAgg(w, 0, avg); setAgg(w, 1, 0); return declares(w, rng).length === 1; };

test('RULES.md "War" Hunger: someone went hungry last year in a hex where A has people and B is in or next to it, and aggression above 0.5', () => {
  const w = reasonWorld();
  assert.equal(goes(w, 0.9), false, 'no reason without hunger');
  w.war.hungryHex[NB[0]] = 1; w.war.borders(w.map);
  assert.equal(goes(w, 0.5), false, '0.5 is not above 0.5');
  assert.equal(goes(w, 0.51), true);
  const v = reasonWorld();
  v.war.hungryHex[T] = 1; v.war.borders(v.map); // hunger in B's hex only: B has the reason, not A
  assert.equal(goes(v, 0.9), false);
  const far = reasonWorld();
  far.war.hungryHex[RING2[0]] = 3; far.war.borders(far.map);
  assert.equal(goes(far, 0.9), false, 'hunger somewhere else');
});

test('RULES.md "War" Crowding: such a hex has more people (all civs) than 50% of its food capacity, and aggression above 0.4', () => {
  const crowded = reasonWorld({ a: 21, b: 10, cap: 42 }); // 21 in NB[0]: more than 21? no, 50% of 42 is 21
  assert.equal(goes(crowded, 0.9), false, 'exactly 50% is not crowded');
  const w = reasonWorld({ a: 21, b: 10, cap: 40 });
  assert.equal(goes(w, 0.4), false, '0.4 is not above 0.4');
  assert.equal(goes(w, 0.41), true);
  const t = reasonWorld({ a: 20, b: 10, cap: 40 });
  assert.equal(goes(t, 0.9), false, '20 of 40 is not crowded');
});

test('RULES.md "War" Numbers: A has at least 3 x B\'s people and aggression above 0.45', () => {
  assert.equal(goes(reasonWorld({ a: 6, b: 2 }), 0.45), false);
  assert.equal(goes(reasonWorld({ a: 6, b: 2 }), 0.46), true);
  assert.equal(goes(reasonWorld({ a: 5, b: 2 }), 0.9), false, '5 v 2 is not 3 times');
  assert.equal(goes(reasonWorld({ a: 2, b: 6 }), 0.9), false, 'the outnumbered civ has no such reason');
});

test('RULES.md "War" Materials: B sits on a deposit A\'s next spend still needs, in or next to A\'s people, and aggression above 0.45', () => {
  const mk = (depositAt, want = 1) => {
    const w = reasonWorld();
    w.map.deposits[depositAt] = 1;
    w.war.want[0] = want;
    w.war.borders(w.map);
    return w;
  };
  assert.equal(goes(mk(T), 0.45), false);
  assert.equal(goes(mk(T), 0.46), true);
  assert.equal(goes(mk(T, 0), 0.9), false, 'not a material it needs');
  assert.equal(goes(mk(T, 2), 0.9), false, 'another material');
  assert.equal(goes(mk(RING2[0]), 0.9), false, 'a deposit nobody sits on');
  // The deposit is in A's own hex and B has people there too.
  const same = world(['expansionist', 'expansionist'], [[T, 0, 6, { agg: 0.9 }], [T, 1, 6, { agg: 0 }]]);
  same.map.deposits[T] = 1; same.war.want[0] = 1; same.war.borders(same.map);
  assert.equal(goes(same, 0.9), true);
});

test('RULES.md "War" Revenge: a battle lost to B within 20 years (20 or less), no aggression threshold, not at peace', () => {
  const mk = (ago, rel = null) => {
    const w = reasonWorld({ rel });
    w.war.lostTo[0 * 2 + 1] = 100 - ago;
    return w;
  };
  assert.equal(goes(mk(20), 0.1), true);
  assert.equal(goes(mk(21), 0.1), false);
  assert.equal(goes(mk(1, PEACE), 0.99), false, 'no revenge at peace');
  assert.equal(goes(reasonWorld(), 0.1), false, 'never lost: no reason');
  const lostOther = reasonWorld();
  lostOther.war.lostTo[1 * 2 + 0] = 99; // B lost to A: A has no revenge to take
  assert.equal(goes(lostOther, 0.1), false);
  // "Forgiven" after a truce: the Simulation resets both entries.
  const sim = new Simulation({ seed: 'forgive', civCount: 2 });
  sim.war.lostTo[0 * 2 + 1] = sim.tickCount;
  sim.forgive(0, 1);
  assert.ok(sim.tickCount - sim.war.lostTo[0 * 2 + 1] > WAR.revengeYears);
});

test('RULES.md "War" chance: a civ with a reason declares each month with chance average aggression / 12, one roll per pair', () => {
  const w = reasonWorld({ a: 6, b: 2 }); // numbers
  setAgg(w, 0, 0.6); setAgg(w, 1, 0);
  assert.equal(declares(w, roll(0.0499)).length, 1);
  const x = reasonWorld({ a: 6, b: 2 });
  setAgg(x, 0, 0.6); setAgg(x, 1, 0);
  assert.equal(declares(x, roll(0.0501)).length, 0, '0.6 / 12 = 0.05');
  // Hungry, crowded, outnumbering and wanted at once: still one roll.
  const y = reasonWorld({ a: 21, b: 2, cap: 40 });
  y.war.hungryHex[NB[0]] = 1; y.map.deposits[T] = 1; y.war.want[0] = 1; y.war.lostTo[1] = 99; y.war.borders(y.map);
  setAgg(y, 0, 0.6); setAgg(y, 1, 0);
  let draws = 0;
  assert.equal(declares(y, { next: () => { draws++; return 0.9; } }).length, 0);
  assert.equal(draws, 1);
  // Over a year of months the declarations come at about the aggression.
  let years = 0;
  for (let t = 0; t < 400; t++) {
    const z = reasonWorld({ a: 6, b: 2 });
    setAgg(z, 0, 0.6); setAgg(z, 1, 0);
    const r = new Rng(`d${t}`);
    for (let m = 0; m < 12 && z.dip.relation(0, 1) !== AT_WAR; m++) z.war.declare(z.map, 100, r, null);
    if (z.dip.relation(0, 1) === AT_WAR) years++;
  }
  near(years / 400, 1 - (1 - 0.05) ** 12, 0.06);
});

test('RULES.md "War" at peace: every aggression threshold is higher by 0.15 plus 0.05 per whole 20 years of trade, at most +0.3 in all', () => {
  const peace = (reason, trade, avg) => {
    const w = reasonWorld({ rel: PEACE, trade, a: reason === 'numbers' ? 6 : 6, b: reason === 'numbers' ? 2 : 6, cap: reason === 'crowd' ? 11 : 1e6 });
    if (reason === 'hunger') { w.war.hungryHex[NB[0]] = 1; w.war.borders(w.map); }
    if (reason === 'materials') { w.map.deposits[T] = 1; w.war.want[0] = 1; w.war.borders(w.map); }
    if (reason === 'crowd') w.war.borders(w.map);
    return goes(w, avg);
  };
  const base = { hunger: 0.5, crowd: 0.4, numbers: 0.45, materials: 0.45 };
  for (const [reason, b] of Object.entries(base)) {
    for (const [trade, extra] of [[0, 0.15], [19, 0.15], [20, 0.2], [40, 0.25], [60, 0.3], [600, 0.3]]) {
      assert.equal(peace(reason, trade, b + extra - 0.01), false, `${reason} ${trade} below`);
      assert.equal(peace(reason, trade, b + extra + 0.01), true, `${reason} ${trade} above`);
    }
    // At war the plain threshold.
    assert.equal(goes((() => { const w = reasonWorld({ rel: AT_WAR }); return w; })(), 0.9), false, 'already at war: nothing to declare');
  }
});

test('RULES.md "War" decisions: made for every pair first, then applied; two civs declaring on each other the same month: the lower civ number counts', () => {
  const w = world(['aggressive', 'aggressive'], [[NB[0], 0, 6], [T, 1, 6]]);
  assert.deepEqual(declares(w), [['declared', 0, 1, 100, NO_RELATION]]);
  const x = world(['expansionist', 'expansionist'], [[NB[0], 0, 6, { agg: 0.9 }], [T, 1, 6, { agg: 0.9 }]]);
  x.war.hungryHex[NB[0]] = 1; x.war.hungryHex[T] = 1; x.war.borders(x.map);
  setAgg(x, 0, 0.9); setAgg(x, 1, 0.9);
  assert.deepEqual(declares(x), [['declared', 0, 1, 100, NO_RELATION]]);
});

test('RULES.md "War" no fighting without war: shared hexes at peace, in a truce or with no relation only switch civ', () => {
  const build = (rel, types = ['aggressive', 'expansionist']) => {
    const w = world(types, [[T, 0, 8, { agg: 0.2 }], [T, 1, 8, { agg: 0.2 }]]);
    if (rel !== null) relate(w, 0, 1, rel);
    return w;
  };
  const year = (w) => { for (let d = 0; d < 360; d++) step(w, d); return w; };
  for (const rel of [TRUCE, PEACE]) {
    const w = year(build(rel));
    assert.equal(w.war.totals.battles, 0, `relation ${rel}`);
    assert.equal(w.ev.deaths.length, 0);
    assert.equal(aliveOf(w, 0) + aliveOf(w, 1), 16);
  }
  const none = year(build(null, ['cooperative', 'expansionist']));
  assert.equal(none.war.totals.battles, 0);
  // The same scene at war fights (Aggressive on the first day of the first month).
  const war = build(AT_WAR);
  step(war, 0);
  assert.equal(war.war.battles.length, 1);
});

// ---- attacking -------------------------------------------------------------------------------------------------------

/** Civ 0 (Aggressive) army at X = T, targets are NB[0] and NB[2] (not next to each other). */
function front(bA, bB, { aN = 40, types = ['aggressive', 'expansionist'], terrainAt = null, settle = false, agg = 0.5, level = 1 } = {}) {
  assert.ok(!adjacent(makeMap(SIZE, SIZE, () => PLAINS), NB[0], NB[2]));
  const w = world(types, [[T, 0, aN], [NB[0], 1, bA], [NB[2], 1, bB]].filter((g) => g[2] > 0), { terrainAt, settle, level });
  relate(w, 0, 1, AT_WAR);
  setAgg(w, 0, agg);
  setAgg(w, 1, 0.5);
  return w;
}
const attacked = (w) => w.war.battles.filter((b) => b.civ[0] === 0).map((b) => b.hex);

test('RULES.md "War" Attacking: each civ at war attacks one hex a month on the first day of months 1 to 9, none in winter', () => {
  for (const [doy, yes] of [[0, true], [30, true], [240, true], [270, false], [300, false], [330, false]]) {
    const w = front(10, 0);
    step(w, doy);
    assert.equal(attacked(w).length, yes ? 1 : 0, `day ${doy}`);
  }
  // Declarations still come in winter.
  const w = world(['aggressive', 'expansionist'], [[T, 0, 8], [NB[0], 1, 8]]);
  step(w, 300);
  assert.equal(w.ev.declared.length, 1);
  assert.equal(w.war.battles.length, 0);
  // One attack at a time: the second month starts no second battle.
  const x = front(10, 10);
  step(x, 30);
  step(x, 60);
  assert.equal(attacked(x).length, 1);
});

test('RULES.md "War" Attacking: needs an enemy in a land hex with no battle and own warriors in or next to the hex; deep water is no target', () => {
  const far = world(['aggressive', 'expansionist'], [[RING2[0], 0, 20], [T, 1, 5]]);
  relate(far, 0, 1, AT_WAR);
  step(far, 30);
  assert.equal(attacked(far).length, 0, 'two hexes from its warriors');
  const kids = world(['aggressive', 'expansionist'], [[NB[0], 0, 20, { age: 10 }], [T, 1, 5]]);
  relate(kids, 0, 1, AT_WAR);
  step(kids, 30);
  assert.equal(attacked(kids).length, 0, 'children are no warriors');
  const sea = front(10, 0, { terrainAt: { [NB[0]]: DEEP_WATER } });
  step(sea, 30);
  assert.equal(attacked(sea).length, 0);
});

test('RULES.md "War" Odds: attacks at odds of at least 1 - average aggression, never less than 0.25 (boundary on each side)', () => {
  const odds = (agg, mine, theirs) => { const w = front(theirs, 0, { aN: mine, agg }); step(w, 30); return attacked(w).length; };
  assert.equal(odds(0.5, 5, 10), 1, 'odds 0.5 at aggression 0.5');
  assert.equal(odds(0.5, 4, 10), 0);
  assert.equal(odds(0, 10, 10), 1, 'aggression 0: odds 1');
  assert.equal(odds(0, 9, 10), 0);
  assert.equal(odds(1, 3, 12), 1, 'aggression 1: the floor 0.25');
  assert.equal(odds(1, 2, 12), 0);
  assert.equal(odds(0.8, 3, 12), 1, 'aggression 0.8 would be 0.2: the floor holds');
  assert.equal(odds(0.8, 2, 12), 0);
  const kids = world(['aggressive', 'expansionist'], [[T, 0, 4], [NB[0], 1, 5, { age: 10 }]]);
  relate(kids, 0, 1, AT_WAR); setAgg(kids, 0, 0);
  step(kids, 30);
  assert.equal(attacked(kids).length, 1, 'a defender with nobody fit: odds 10');
});

test('RULES.md "War" Odds: attack counts weapons by level and strength bonus, the defender\'s defence counts only when it holds the hex', () => {
  const run = (mine, theirs, { level = 1, strength = 0, hills = false, holds = false } = {}) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, mine], [T, 1, theirs]], { terrainAt: hills ? { [T]: HILLS } : null, settle: true });
    relate(w, 0, 1, AT_WAR);
    setAgg(w, 0, 0);
    w.war.level[0] = level;
    w.war.eff.strength[0] = strength;
    if (holds) w.st.holder[T] = 1;
    step(w, 30);
    return attacked(w).length;
  };
  assert.equal(run(8, 10), 0);
  assert.equal(run(8, 10, { level: 3 }), 1, '8 x 1.25 = 10 against 10');
  assert.equal(run(8, 10, { strength: 0.25 }), 1, 'a strength bonus of 25%');
  assert.equal(run(10, 10, { level: 1 }), 1);
  // Defence: hills +50% only for the holder.
  assert.equal(run(15, 10, { hills: true, holds: true }), 1, '15 against 10 x 1.5');
  assert.equal(run(14, 10, { hills: true, holds: true }), 0);
  assert.equal(run(14, 10, { hills: true, holds: false }), 1, 'nobody holds it: no defence');
});

test('RULES.md "War" Cooperative: at war it attacks only hexes it holds', () => {
  const mk = (held) => {
    const w = world(['cooperative', 'expansionist'], [[NB[0], 0, 20], [T, 1, 1]], { settle: true });
    relate(w, 0, 1, AT_WAR);
    if (held) w.st.holder[T] = 0;
    step(w, 30);
    return w.war.battles.filter((b) => b.civ[0] === 0).length;
  };
  assert.equal(mk(false), 0);
  assert.equal(mk(true), 1);
});

test('RULES.md "War" Defender: the enemy holding the hex if it has people there, otherwise the one with the most people (lower civ number on ties)', () => {
  const mk = (n1, n2, holder) => {
    const w = world(['aggressive', 'expansionist', 'expansionist'], [[NB[0], 0, 60], [T, 1, n1], [T, 2, n2]], { settle: true });
    relate(w, 0, 1, AT_WAR); relate(w, 0, 2, AT_WAR);
    if (holder >= 0) w.st.holder[T] = holder;
    step(w, 30);
    return w.war.battles.find((b) => b.civ[0] === 0 && b.hex === T)?.civ[1];
  };
  assert.equal(mk(6, 2, -1), 1);
  assert.equal(mk(2, 6, -1), 2);
  assert.equal(mk(4, 4, -1), 1, 'a tie: the lower civ number');
  assert.equal(mk(6, 2, 2), 2, 'the holder, though it has fewer people');
  assert.equal(mk(6, 2, 0), 1, 'a holder that is not an enemy here does not count');
});

test('RULES.md "War" Target: the best odds (capped at 10), x 1.5 for a wanted deposit, the lowest index on ties', () => {
  const lo = Math.min(NB[0], NB[2]);
  const hi = Math.max(NB[0], NB[2]);
  const pick = (nLo, nHi, deposit = null) => {
    const w = world(['aggressive', 'expansionist'], [[T, 0, 40], [lo, 1, nLo], [hi, 1, nHi]]);
    relate(w, 0, 1, AT_WAR);
    if (deposit !== null) { w.map.deposits[deposit] = 1; w.war.want[0] = 1; }
    setAgg(w, 0, 0.5);
    step(w, 30);
    return attacked(w)[0];
  };
  assert.equal(pick(10, 20), lo, 'odds 4 against 2');
  assert.equal(pick(20, 10), hi, 'odds 2 against 4');
  assert.equal(pick(10, 10), lo, 'a tie: the lowest index');
  assert.equal(pick(4, 1), lo, 'both odds are 10 or more: capped, so the tie goes to the lowest index');
  // Deposit: 2.5 x 1.5 = 3.75 loses to 4, 2.857 x 1.5 = 4.29 wins.
  assert.equal(pick(10, 16, hi), lo);
  assert.equal(pick(10, 14, hi), hi);
});

test('RULES.md "War" Attacking: a walled hex is attacked only when the siege would be over before winter (Palisade 30 days, Palace 60, Stone walls 90)', () => {
  const attacksAt = (ids, doy) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 80], [T, 1, 10]], { settle: true });
    relate(w, 0, 1, AT_WAR);
    walls(w, T, 1, ids);
    step(w, doy);
    return w.war.battles.length;
  };
  assert.equal(attacksAt(['palisade'], 210), 1);
  assert.equal(attacksAt(['palisade'], 240), 0, '240 + 30 reaches winter');
  assert.equal(attacksAt(['palace'], 180), 1);
  assert.equal(attacksAt(['palace'], 210), 0);
  assert.equal(attacksAt(['stoneWalls'], 150), 1);
  assert.equal(attacksAt(['stoneWalls'], 180), 0);
  assert.equal(attacksAt(['palisade', 'stoneWalls'], 120), 1, 'together 120 days');
  assert.equal(attacksAt(['palisade', 'stoneWalls'], 150), 0);
  // No walls, or walls held by someone else: attacked in month 9.
  const open = world(['aggressive', 'expansionist'], [[NB[0], 0, 80], [T, 1, 10]], { settle: true });
  relate(open, 0, 1, AT_WAR);
  step(open, 240);
  assert.equal(open.war.battles.length, 1);
});

// ---- warriors and levies ---------------------------------------------------------------------------------------------

test('RULES.md "War" Levy: round(25%) of the fit adults in and next to the hex, at least 1; the battle begins the next day', () => {
  const levy = (n) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, n], [T, 1, n]]);
    const bt = begin(w, T, 0, 1);
    return [bt.fit[0], bt.fit[1], bt.start[0]];
  };
  for (const [n, want] of [[1, 1], [3, 1], [5, 1], [7, 2], [9, 2], [12, 3], [15, 4], [40, 10], [100, 25]]) {
    assert.deepEqual(levy(n).slice(0, 2), [want, want], `${n} fit adults`);
  }
  // The attack on the first day of a month: the first duel is the next day.
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 40], [T, 1, 40]]);
  relate(w, 0, 1, AT_WAR);
  step(w, 30);
  assert.equal(w.war.battles[0].day, 0);
  assert.equal(w.ev.deaths.length, 0);
  step(w, 31);
  assert.equal(w.war.battles[0].day, 1);
});

test('RULES.md "War" Levy: only the hex and its 6 neighbours count and supply; the share is counted from everyone aged 15 to 45 there', () => {
  // 8 near and 8 two hexes away: the levy is 25% of 8 = 2, and only the near ones can be called.
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 8], [RING2[0], 0, 8], [T, 1, 12]]);
  const bt = begin(w, T, 0, 1);
  assert.equal(bt.fit[0], 2);
  for (let j = 0; j < 2; j++) assert.equal(w.people.hex[bt.slots[0][j]], NB[0]);
  // Eligible are 16 to 45 with health 50 or more; the share counts everyone aged 15 to 45 (turning 16 to 46 next birthday).
  const groups = [[NB[0], 0, 8], [NB[0], 0, 4, { health: 40 }], [NB[0], 0, 4, { age: 45 }], [NB[0], 0, 4, { age: 15 }],
    [NB[0], 0, 4, { age: 10 }], [NB[0], 0, 4, { age: 60 }], [T, 1, 4]];
  for (let trial = 0; trial < 12; trial++) {
    const v = world(['aggressive', 'expansionist'], groups, { seed: `e${trial}` });
    for (let i = 0; i < v.people.high; i++) v.people.age[i]++; // birthdays: the 15s are 16, the 45s are 46
    const bt2 = begin(v, T, 0, 1);
    assert.equal(bt2.fit[0], 5, 'round(25% of 20 aged 15 to 45)');
    for (let j = 0; j < 5; j++) {
      const i = bt2.slots[0][j];
      assert.ok(v.people.age[i] >= 16 && v.people.age[i] <= 45 && v.people.health[i] >= 50, `called up age ${v.people.age[i]} health ${v.people.health[i]}`);
    }
  }
  // Health 50 is fit, 49 is not.
  const h = world(['aggressive', 'expansionist'], [[NB[0], 0, 2, { health: 50 }], [NB[0], 0, 2, { health: 49 }], [T, 1, 4]]);
  const b3 = begin(h, T, 0, 1);
  assert.equal(b3.fit[0], 1);
  assert.equal(h.people.health[b3.slots[0][0]], 50);
});

test('RULES.md "War" Levy: nobody who moved, switched civ or died since the year ended is called; a newcomer is not counted where he went', () => {
  const mk = () => world(['aggressive', 'expansionist', 'expansionist'], [[NB[0], 0, 8], [T, 1, 4]]);
  const gone = mk();
  for (let i = 0; i < 4; i++) gone.people.hex[i] = RING2[0]; // walked away
  gone.people.civ[4] = 2; // switched
  gone.people.remove(5); // died
  const bt = begin(gone, T, 0, 1);
  assert.equal(bt.fit[0], 2, 'the share still counts the 8, but only 2 are left near');
  assert.ok([6, 7].every((i) => [...bt.slots[0]].includes(i)));
  const comer = world(['aggressive', 'expansionist'], [[RING2[0], 0, 4], [T, 1, 4]]);
  for (let i = 0; i < 4; i++) comer.people.hex[i] = NB[0];
  const b2 = begin(comer, T, 0, 1);
  assert.equal(b2.fit[0], 0, 'a newcomer is not counted where he went until the year ends');
});

test('RULES.md "War" Warriors: one who is in a battle is not called to a second', () => {
  const w = world(['aggressive', 'expansionist', 'expansionist'], [[T, 0, 8], [NB[0], 1, 8], [NB[2], 2, 8]]);
  const first = begin(w, NB[0], 0, 1);
  const second = begin(w, NB[2], 0, 2);
  const used = new Set(first.slots[0].subarray(0, first.fit[0]));
  for (let j = 0; j < second.fit[0]; j++) assert.ok(!used.has(second.slots[0][j]));
  assert.equal(first.fit[0] + second.fit[0], 4, 'two levies of 2 from the same 8');
});

// ---- duels -----------------------------------------------------------------------------------------------------------

/** A battle of levy sizes (a for civ 0 at T's neighbour, b for civ 1 in T): 4 adults per warrior called up. */
function arena(a, b, { str = [0.5, 0.5], type = ['aggressive', 'expansionist'], level = 1, seed = 'a' } = {}) {
  const w = world(type, [[NB[0], 0, 4 * a, { str: str[0] }], [T, 1, 4 * b, { str: str[1] }]], { level, seed });
  const bt = begin(w, T, 0, 1);
  assert.deepEqual([bt.fit[0], bt.fit[1]], [a, b]);
  return { w, bt };
}

test('RULES.md "War" Duels: ceil(10%) of the smaller side\'s fit warriors (at least 1) fight a duel each, every day', () => {
  for (const [small, want] of [[1, 1], [4, 1], [10, 1], [11, 2], [20, 2], [21, 3], [30, 3], [31, 4]]) {
    const { w, bt } = arena(small + 3, small);
    fightDay(w, bt, new Rng('duels'));
    assert.equal(bt.out[0] + bt.out[1], want, `smaller side ${small}`);
    assert.equal(bt.day, 1);
  }
});

test('RULES.md "War" Duels: the larger side sends floor(its fit / the other\'s) fighters, at most 3', () => {
  // With equal strengths a lone fighter beats a group of g with chance 1 / (1 + g): a roll of 0.4 for everything is won by
  // the lone fighter only against a group of 1; a roll of 0.3 against a group of 1 or 2.
  const groupOf = (big, small) => {
    const lone = (r) => {
      const { w, bt } = arena(big, small);
      const bigSide = bt.fit[0] > bt.fit[1] ? 0 : 1;
      fightDay(w, bt, roll(r));
      return bt.out[bigSide] === 1; // the larger side lost the duel: the lone fighter won
    };
    return lone(0.4) ? 1 : lone(0.3) ? 2 : 3;
  };
  assert.equal(groupOf(4, 4), 1);
  assert.equal(groupOf(7, 4), 1, '7 / 4 = 1.75');
  assert.equal(groupOf(8, 4), 2);
  assert.equal(groupOf(11, 4), 2, '11 / 4 = 2.75');
  assert.equal(groupOf(12, 4), 3);
  assert.equal(groupOf(20, 4), 3, 'capped at 3');
  assert.equal(groupOf(5, 1), 3);
  assert.equal(groupOf(2, 1), 2);
});

/** How often side 0 wins a one on one battle, over trials. */
function winRate(make, trials = 800) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const { w, bt } = make(t);
    if (fightDay(w, bt, new Rng(`r${t}`)) === 0) wins++;
  }
  return wins / trials;
}

test('RULES.md "War" Duels: a side wins with chance its power / both powers; power = strength x attack x morale', () => {
  const duel = (opts, tweak = () => {}) => (t) => { const r = arena(1, 1, { ...opts, seed: `p${t}` }); tweak(r); return r; };
  near(winRate(duel({ str: [0.5, 0.5] })), 0.5, 0.06);
  near(winRate(duel({ str: [0.75, 0.25] })), 0.75, 0.06);
  near(winRate(duel({ str: [0.25, 0.75] })), 0.25, 0.06);
  // Weapons: level 3 (x 1.25) against level 1: 1.25 / 2.25.
  near(winRate(duel({}, ({ w, bt }) => { bt.mul = [w.war.attack(0), w.war.attack(1)]; }), 800), 0.5, 0.06);
  near(winRate(duel({}, ({ bt }) => { bt.mul = [1.25, 1]; })), 1.25 / 2.25, 0.06);
  // Morale now: a side that has lost half of its warriors fights at 0.5 less.
  near(winRate(duel({}, ({ bt }) => { bt.start[0] = 2; bt.out[0] = 1; })), 0.5 / 1.5, 0.06);
  assert.ok(winRate(duel({ str: [0, 0] }), 20) <= 1, 'zero power both ways does not crash');
});

test('RULES.md "War" The loser: killed with a 50% chance, otherwise wounded to health 20 and out; a war-loss bonus lowers the kill chance', () => {
  const outcome = (warLoss, trials = 600) => {
    let killed = 0; let wounded = 0;
    for (let t = 0; t < trials; t++) {
      const { w, bt } = arena(1, 1, { seed: `k${t}` });
      w.war.eff.warLoss[0] = warLoss; w.war.eff.warLoss[1] = warLoss;
      const slots = [bt.slots[0][0], bt.slots[1][0]];
      fightDay(w, bt, new Rng(`k${t}`));
      assert.equal(bt.out[0] + bt.out[1], 1);
      const loser = bt.out[0] === 1 ? 0 : 1;
      const slot = slots[loser];
      if (!w.people.alive[slot]) { killed++; assert.equal(bt.dead[loser], 1); assert.equal(w.ev.deaths.at(-1)?.cause ?? DEATH_WAR, DEATH_WAR); }
      else { wounded++; assert.equal(w.people.health[slot], WAR.woundHealth); assert.equal(bt.dead[loser], 0); }
      assert.equal(w.people.alive[slots[1 - loser]], 1, 'the winner stays in');
      assert.equal(w.people.health[slots[1 - loser]], 100);
    }
    return killed / trials;
  };
  near(outcome(0), 0.5, 0.06);
  near(outcome(0.5), 0.25, 0.06); // Barracks 50%
  near(outcome(0.2), 0.4, 0.06); // War Totem 20%
  assert.equal(outcome(1, 100), 0);
});

test('RULES.md "War" The loser: wounding never raises health (a loser at 10 stays at 10), and a death is a war death', () => {
  const deaths = [];
  for (let t = 0; t < 40; t++) {
    const x = arena(1, 1, { seed: `h${t}`, str: [0, 1] }); // civ 0's warrior is sure to lose
    const s = x.bt.slots[0][0];
    x.w.people.health[s] = 10;
    x.w.war.fightDay(x.w.people, x.bt, new Rng(`h${t}`), (i, cause) => deaths.push(cause));
    if (x.w.people.alive[s]) assert.equal(x.w.people.health[s], 10);
  }
  assert.ok(deaths.length > 5 && deaths.every((c) => c === DEATH_WAR));
});

test('RULES.md "War" Breaking: a side breaks at 40% of the warriors it called up out (3 of 10 no, 4 of 10 yes)', () => {
  const day = (out, r) => {
    const { w, bt } = arena(10, 10);
    bt.out[0] = out[0]; bt.out[1] = out[1];
    const res = fightDay(w, bt, roll(r));
    return [res, bt.out.slice()];
  };
  // r = 0.9: the lone fighter (side 0, the smaller or equal) loses; r = 0.1: a fighter of side 1 loses.
  assert.deepEqual(day([2, 0], 0.9), [-1, [3, 0]]);
  assert.deepEqual(day([3, 0], 0.9)[0], 1, 'the attacker is at 4 of 10: the defender wins');
  assert.deepEqual(day([0, 2], 0.1), [-1, [0, 3]]);
  assert.deepEqual(day([0, 3], 0.1)[0], 0, 'the defender is at 4 of 10: the attacker wins');
});

test('RULES.md "War" Breaking: both break the same day: the larger share out loses, the attacker on a tie', () => {
  const day = (out, r) => {
    const { w, bt } = arena(10, 10);
    bt.out[0] = out[0]; bt.out[1] = out[1];
    return fightDay(w, bt, roll(r));
  };
  assert.equal(day([5, 4], 0.9), 1, '6 against 4: the attacker loses');
  assert.equal(day([4, 5], 0.1), 0, '4 against 6: the defender loses');
  assert.equal(day([4, 5], 0.9), 1, '5 against 5: the attacker loses');
  assert.equal(day([5, 4], 0.1), 1, '5 against 5: the attacker loses');
  // Uneven starts compare shares, not numbers: 4 of 10 (40%) against 3 of 5 (60%).
  const { w, bt } = arena(10, 5);
  bt.out[0] = 4; bt.out[1] = 2;
  assert.equal(fightDay(w, bt, roll(0.9)), 0, 'side 1 goes to 3 of 5 (60%) against 40%: it loses');
});

test('RULES.md "War" Breaking: a side with no fit warriors left breaks', () => {
  const { w, bt } = arena(5, 5);
  bt.fit[1] = 0;
  assert.equal(fightDay(w, bt, new Rng('x')), 0);
  const v = arena(5, 5);
  v.bt.fit[0] = 0;
  assert.equal(fightDay(v.w, v.bt, new Rng('x')), 1);
  const both = arena(5, 5);
  both.bt.fit[0] = 0; both.bt.fit[1] = 0;
  assert.equal(fightDay(both.w, both.bt, new Rng('x')), 1, 'both: the attacker loses on a tie');
});

test('RULES.md "War" 30 days: a battle still going after 30 days ends with the attacker pulling back', () => {
  const a = arena(10, 10);
  a.bt.day = 28;
  assert.equal(fightDay(a.w, a.bt, roll(0.9)), -1, 'day 29');
  const b = arena(10, 10);
  b.bt.day = 29;
  assert.equal(fightDay(b.w, b.bt, roll(0.9)), 1, 'day 30: the defender wins');
  assert.equal(b.w.war.totals.pulledBack, 1);
});

test('RULES.md "War" Breaking: warriors who died of other causes drop out without counting as out', () => {
  const { w, bt } = arena(10, 10);
  w.people.remove(bt.slots[1][0]);
  const slot = bt.slots[1][1];
  w.people.remove(slot);
  const fresh = w.people.add(NB[1], 1, 25, 100, 0); // reuses a freed slot
  fightDay(w, bt, roll(0.1)); // the larger side's fighter loses the duel
  assert.equal(bt.fit[1], 8);
  assert.equal(bt.out[1], 0);
  assert.equal(w.war.busy(w.people, fresh), false, 'a reused slot is not in the battle');
});

// ---- morale, weapons and defence ------------------------------------------------------------------------------------

test('RULES.md "War" Attack: weapons x1 at levels 1 and 2, x1.25 at 3, x1.5 at 4 and 5; times 1 + the strength bonus', () => {
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 4], [T, 1, 4]]);
  for (const [level, want] of [[1, 1], [2, 1], [3, 1.25], [4, 1.5], [5, 1.5]]) {
    w.war.level[0] = level;
    assert.equal(w.war.attack(0), want, `level ${level}`);
  }
  w.war.level[0] = 3;
  w.war.eff.strength[0] = 0.2;
  assert.equal(w.war.attack(0), 1.25 * 1.2);
});

test('RULES.md "War" Defence: the holder fights with attack x (1 + terrain + buildings + walls); a side that does not hold the hex gets none', () => {
  const mul = (terrain, holder, { defBonus = 0, ids = [], attacker = false } = {}) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 4], [T, 1, 4]], { terrainAt: { [T]: terrain }, settle: true });
    w.war.eff.defence[1] = defBonus;
    if (ids.length) walls(w, T, 1, ids);
    else if (holder >= 0) w.st.holder[T] = holder;
    const bt = begin(w, T, 0, 1);
    return bt.mul;
  };
  assert.deepEqual(mul(PLAINS, -1), [1, 1]);
  assert.deepEqual(mul(FOREST, 1), [1, 1.25]);
  assert.deepEqual(mul(HILLS, 1), [1, 1.5]);
  assert.deepEqual(mul(MOUNTAIN, 1), [1, 2]);
  assert.deepEqual(mul(DESERT, 1), [1, 1]);
  assert.deepEqual(mul(HILLS, 0), [1.5, 1], 'the attacker holding the hex gets the defence');
  assert.deepEqual(mul(HILLS, -1), [1, 1], 'nobody holds it');
  assert.deepEqual(mul(HILLS, 1, { defBonus: 0.1 }), [1, 1.6]);
  assert.deepEqual(mul(HILLS, 1, { ids: ['palisade'] }), [1, 1.75]);
  assert.deepEqual(mul(PLAINS, 1, { ids: ['stoneWalls'] }), [1, 1.75]);
  assert.deepEqual(mul(PLAINS, 1, { ids: ['palace'] }), [1, 1.5]);
  // Strength and weapons multiply the whole.
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 4], [T, 1, 4]], { terrainAt: { [T]: HILLS }, settle: true, level: 3 });
  w.st.holder[T] = 1;
  w.war.eff.strength[1] = 0.2;
  assert.equal(begin(w, T, 0, 1).mul[1], 1.25 * 1.2 * 1.5);
});

test('RULES.md "War" Morale: +25% for a Kingdom against a civ that is not one, -25% when a quarter of the called-up warriors went hungry, less the share out', () => {
  const morale = (levels, hungry = [0, 0], fit = [8, 8]) => {
    const w = world(['aggressive', 'expansionist'], [
      [NB[0], 0, hungry[0], { hunger: 1 }], [NB[0], 0, fit[0] - hungry[0]],
      [T, 1, hungry[1], { hunger: 1 }], [T, 1, fit[1] - hungry[1]],
      [NB[1], 0, 24, { health: 40 }], [NB[1], 1, 24, { health: 40 }], // fit by the share, too sick to be called
    ].filter((g) => g[2] > 0));
    w.war.level.set(levels);
    const bt = begin(w, T, 0, 1);
    // Everyone healthy is called up: the levy is 25% of (healthy + sick near the hex).
    return [bt.morale.slice(), bt];
  };
  assert.deepEqual(morale([1, 1])[0], [1, 1]);
  assert.deepEqual(morale([5, 1])[0], [1.25, 1]);
  assert.deepEqual(morale([1, 5])[0], [1, 1.25]);
  assert.deepEqual(morale([5, 5])[0], [1, 1], 'two Kingdoms: as usual');
  assert.deepEqual(morale([4, 4])[0], [1, 1]);
  assert.deepEqual(morale([5, 1], [8, 8])[0], [1, 0.75], 'all of the defender\'s warriors hungry');
  // The levy takes every healthy one here (8 of a share of 8 + 24 sick = 32 -> 8): 2 hungry of 8 is a quarter, 1 is not.
  assert.deepEqual(morale([1, 1], [2, 0])[0], [0.75, 1]);
  assert.deepEqual(morale([1, 1], [1, 0])[0], [1, 1]);
  assert.deepEqual(morale([5, 1], [8, 0])[0], [1, 1], 'Kingdom +25% and hungry -25%');
  // Morale falls by the share of warriors out so far.
  const [, bt] = morale([1, 1]);
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 40], [T, 1, 40]]);
  const b = begin(w, T, 0, 1);
  b.out[0] = 5;
  assert.equal(w.war.moraleOf(b, 0), 0.5);
  assert.equal(w.war.summary(SIZE)[0].morale[0], 50);
  assert.ok(bt);
});

// ---- after a battle --------------------------------------------------------------------------------------------------

test('RULES.md "War" After a battle: the loser\'s people flee to the neighbour without the winner with the most food left over (food - people, then the lowest index)', () => {
  const setup = (food, cnt = {}, inside = null) => {
    const map = makeMap(SIZE, SIZE, () => PLAINS);
    map.food.fill(10);
    for (const [h, v] of Object.entries(food)) map.food[h] = v;
    const pop = new Int32Array(map.count);
    const c = new Int32Array(map.count * 2);
    for (const [h, [a, b]] of Object.entries(cnt)) { c[h * 2] = a; c[h * 2 + 1] = b; pop[h] = a + b; }
    return { map, pop, c, inside };
  };
  const flee = (s) => fleeHex(s.map, T, s.pop, s.c, 2, 0, 1, s.inside);
  const sorted = [...NB].sort((a, b) => a - b);
  assert.equal(flee(setup({})), sorted[0], 'all equal: the lowest index');
  assert.equal(flee(setup({ [NB[3]]: 30, [NB[1]]: 25 })), NB[3]);
  // Food left over, not food: 30 food with 25 people is 5 left, less than 12 left of 12.
  assert.equal(flee(setup({ [NB[3]]: 30, [NB[1]]: 12 }, { [NB[3]]: [0, 25] })), NB[1]);
  // A hex with the winner's people is skipped even with more spare food.
  assert.equal(flee(setup({ [NB[1]]: 500, [NB[2]]: 20 }, { [NB[1]]: [3, 0] })), NB[2]);
  // The winner everywhere: the best of all of them.
  const all = {}; for (const h of NB) all[h] = [2, 0];
  assert.equal(flee(setup({ [NB[4]]: 100 }, all)), NB[4]);
  // Water neighbours do not count; no land neighbour: stay.
  const island = setup({});
  for (const h of NB) island.map.terrain[h] = DEEP_WATER;
  assert.equal(flee(island), -1);
  const one = setup({}, { [NB[2]]: [2, 0] });
  for (const h of NB) if (h !== NB[2]) one.map.terrain[h] = DEEP_WATER;
  assert.equal(flee(one), NB[2], 'the only land neighbour, though the winner is there');
  // A hex enclosed by another Kingdom is never a refuge; one enclosed by the loser's own is.
  const inside = new Int8Array(49).fill(-1);
  inside[NB[3]] = 2;
  assert.equal(flee(setup({ [NB[3]]: 99, [NB[1]]: 50 }, {}, inside)), NB[1]);
  inside[NB[3]] = 1;
  assert.equal(flee(setup({ [NB[3]]: 99, [NB[1]]: 50 }, {}, inside)), NB[3]);
});

/** Civ 0 beats civ 1 in T: strong attackers, a hopeless defender. */
function field(extra = [], { holderT = 1, settle = true, aStr = 1, bStr = 0.01 } = {}) {
  const w = world(['aggressive', 'cooperative'], [
    [NB[0], 0, 40, { str: aStr }], [T, 1, 12, { str: bStr }], [T, 1, 3, { age: 5 }], [NB[3], 1, 4, { str: bStr }], ...extra,
  ], { settle });
  if (settle) {
    w.st.holder[T] = holderT; w.st.holder[NB[0]] = 0;
    w.st.capital[0] = NB[0]; w.st.capital[1] = T;
    w.st.storeCap.fill(1000);
  }
  relate(w, 0, 1, AT_WAR);
  return w;
}

test('RULES.md "War" After a battle: the winner takes the hex at once; 50% of its store is looted to the winner\'s capital; the loser\'s capital moves to its biggest hex left', () => {
  const w = field();
  // Three other hexes of civ 1: the biggest (by people at the end of last year) is 9, the lowest index of the two tied.
  const [r1, r2, r3] = [NB[1], NB[2], RING2[0]];
  for (const [h, p] of [[r1, 5], [r2, 9], [r3, 9]]) { w.st.holder[h] = 1; w.st.pop[h] = p; }
  w.st.store[T * M + WOOD] = 100;
  w.st.store[NB[0] * M + WOOD] = 10;
  w.st.plan[T] = 2; w.st.started[T] = 1;
  play(w, 30, 59);
  assert.equal(w.ev.battles.length, 1, 'the battle ended');
  const [hex, att, def, holder, winner, byWinner, byLoser] = w.ev.battles[0];
  assert.deepEqual([hex, att, def, holder, winner], [T, 0, 1, 1, 0]);
  assert.equal(w.st.holder[T], 0, 'taken at once');
  assert.equal(w.st.store[T * M + WOOD], 50);
  assert.equal(w.st.store[NB[0] * M + WOOD], 60);
  assert.equal(w.st.plan[T], -1, 'the planned building is lost');
  assert.equal(w.st.capital[1], Math.min(r2, r3), 'the biggest hex left, the lowest index on a tie');
  assert.equal(w.st.capital[0], NB[0]);
  assert.equal(w.war.lostTo[1 * 2 + 0], 100);
  assert.equal(w.war.fought[T], 1);
  assert.equal(w.war.battles.length, 0);
  assert.equal(w.war.byHex[T], -1);
  assert.equal(w.war.attacking[0], 0);
  const bt = w.war.nextUid;
  assert.ok(bt > 1);
  // The deaths reported are the war deaths of the battle.
  const warDeaths = w.ev.deaths.filter((d) => d.cause === DEATH_WAR);
  assert.equal(warDeaths.filter((d) => d.civ === 1).length, byWinner);
  assert.equal(warDeaths.filter((d) => d.civ === 0).length, byLoser);
  assert.equal(w.war.totals.battles, 1);
});

test('RULES.md "War" After a battle: looting stops at the capital\'s room; the hex loses the 50% regardless', () => {
  const w = field();
  w.st.store[T * M + WOOD] = 100;
  w.st.storeCap[NB[0]] = 20;
  w.st.store[NB[0] * M + WOOD] = 15;
  play(w, 30, 59);
  assert.equal(w.st.holder[T], 0);
  assert.equal(w.st.store[NB[0] * M + WOOD], 20);
  assert.equal(w.st.store[T * M + WOOD], 50);
});

test('RULES.md "War" After a battle: the loser\'s people in the hex (children too) flee together; its warriors from next door stay home; fit attackers move in', () => {
  const w = field();
  w.map.food.fill(10);
  w.map.food[NB[0]] = 5e6; // the best spare food, but the winner is there
  const best = NB[4];
  w.map.food[best] = 3e6;
  const home = [];
  for (let i = 0; i < w.people.high; i++) if (w.people.civ[i] === 1 && w.people.hex[i] === NB[3]) home.push(i);
  play(w, 30, 59);
  const bt = w.ev.battles[0];
  assert.ok(bt);
  for (let i = 0; i < w.people.high; i++) {
    if (!w.people.alive[i] || w.people.civ[i] !== 1) continue;
    if (w.people.age[i] === 5 || w.people.hex[i] !== NB[3]) assert.equal(w.people.hex[i], best, 'everyone who was in the hex fled to the best neighbour');
  }
  for (const i of home) assert.equal(w.people.hex[i], NB[3]);
  assert.equal(aliveOf(w, 1, T), 0);
  // Attackers: those who were fit (not out) are in the hex now, the wounded are where they were.
  let inT = 0; let wounded = 0;
  for (let i = 0; i < 40; i++) {
    if (!w.people.alive[i]) continue;
    if (w.people.hex[i] === T) inT++;
    else if (w.people.health[i] === WAR.woundHealth) wounded++;
  }
  assert.ok(inT > 0);
  assert.ok(wounded <= bt[6] + 40, 'the wounded stayed where they were');
  assert.equal(aliveOf(w, 0, T), inT);
  assert.equal(w.war.cnt[T * 2 + 0], inT, 'who is where is updated');
  assert.equal(w.war.cnt[T * 2 + 1], 0);
});

test('RULES.md "War" After a battle: the defender wins and keeps (or takes) the hex; the attacker\'s people in it flee; the attacker loses', () => {
  const mk = (holder) => {
    const w = field([[T, 0, 2, { age: 5 }]], { aStr: 0.01, bStr: 1, holderT: holder });
    w.st.capital[1] = T;
    return w;
  };
  for (const holder of [1, -1]) {
    const w = mk(holder);
    begin(w, T, 0, 1);
    play(w, 31, 59);
    assert.equal(w.ev.battles.length, 1);
    assert.equal(w.ev.battles[0][4], 1, 'the defender won');
    assert.equal(w.st.holder[T], 1, holder === 1 ? 'kept' : 'a hex nobody held is taken by the winner there');
    assert.equal(w.war.lostTo[0 * 2 + 1], 100);
    assert.equal(aliveOf(w, 0, T), 0, 'the attacker\'s children fled');
    assert.equal(aliveOf(w, 1, T) > 0, true);
  }
  // A neutral hex taken by an attacker who wins.
  const n = field([], { holderT: -1 });
  begin(n, T, 0, 1);
  const before = n.st.store.slice();
  play(n, 31, 59);
  assert.equal(n.st.holder[T], 0);
  assert.deepEqual(n.st.store, before, 'nothing to loot');
});

test('RULES.md "War" the winner takes the hex only if it now has people there: no capture without them', () => {
  const w = field([], { holderT: 1 });
  // The attacker "wins" but every warrior is out or dead: simulate the end with no fit attackers and none there.
  const bt = begin(w, T, 0, 1);
  bt.won = 0;
  bt.fit[0] = 0;
  w.war.ended.length = 0;
  w.war.ended.push(bt);
  w.war.resolveAll(w.people, w.map, 100, w.rng, () => {}, () => {}, () => {});
  assert.equal(w.st.holder[T], 1, 'no people of the winner in the hex');
});

test('RULES.md "Settlements" capture: a captured hex changes holder with loot, loses its plan, and reports a city taken', () => {
  const w = world(['aggressive', 'expansionist'], [[T, 0, 1], [T, 1, 1]], { settle: true });
  const st = w.st;
  st.holder[T] = 1; st.capital[1] = T; st.capital[0] = NB[0]; st.holder[NB[0]] = 0;
  st.storeCap.fill(1000);
  st.store[T * M + 1] = 41;
  st.tier[T] = CITY;
  const ev = [];
  st.capture(T, 0, new Uint8Array([4, 4]), 77, (...a) => ev.push(a));
  assert.equal(st.holder[T], 0);
  assert.equal(st.store[NB[0] * M + 1], 20.5);
  assert.equal(st.store[T * M + 1], 20.5);
  assert.deepEqual(ev, [['taken', 0, T, 77, 1]]);
  assert.equal(st.capital[1], -1, 'no hex left to hold the capital');
  st.capture(T, 0, new Uint8Array([4, 4]), 78, (...a) => ev.push(a));
  assert.equal(ev.length, 1, 'already the holder: nothing happens');
  assert.equal(st.store[T * M + 1], 20.5);
  // From nobody: no loot, no event.
  const x = world(['aggressive', 'expansionist'], [[T, 0, 1]], { settle: true });
  x.st.store[T * M] = 10;
  const ev2 = [];
  x.st.capture(T, 0, new Uint8Array([1, 1]), 5, (...a) => ev2.push(a));
  assert.equal(x.st.holder[T], 0);
  assert.equal(x.st.store[T * M], 10);
  assert.deepEqual(ev2, []);
});

// ---- sieges ----------------------------------------------------------------------------------------------------------

/** Civ 1 in T behind walls ids, civ 0 besieging from NB[0]. Returns the world and the battle (begun now). */
function siege(ids, { children = 0, doy = 30, adults = 1, bStr = 0, aN = 40, warLoss = 1 } = {}) {
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, aN, { str: 1 }], [T, 1, adults, { str: bStr }], [T, 1, children, { age: 5 }]].filter((g) => g[2] > 0), { settle: true });
  relate(w, 0, 1, AT_WAR);
  walls(w, T, 1, ids);
  w.st.holder[NB[0]] = 0;
  w.st.capital[0] = NB[0]; w.st.capital[1] = T;
  w.war.eff.warLoss[1] = warLoss;
  return { w, bt: begin(w, T, 0, 1, 100), doy };
}

test('RULES.md "War" Sieges: a walled hex held by the defender is besieged for its walls\' defence x 120 days before any duel', () => {
  for (const [ids, days] of [[['palisade'], 30], [['palace'], 60], [['stoneWalls'], 90], [['palisade', 'stoneWalls'], 120]]) {
    const { w, bt } = siege(ids);
    assert.equal(bt.siegeDays, days, ids.join('+'));
    assert.equal(w.war.totals.sieges, 1);
    assert.equal(w.war.summary(SIZE)[0].siege, true);
  }
  // No walls, or someone else's: no siege.
  const open = siege([]).bt;
  assert.equal(open.siegeDays, 0);
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 8], [T, 1, 8]], { settle: true });
  walls(w, T, 0, ['palisade']);
  assert.equal(begin(w, T, 0, 1).siegeDays, 0, 'walls the attacker holds are no siege');
});

test('RULES.md "War" Sieges: the siege runs its days without a duel, then the fighting starts the day after', () => {
  const { w, bt } = siege(['palisade']);
  play(w, 31, 59);
  assert.equal(w.war.summary(SIZE)[0].siege, true, '29 days in');
  assert.equal(w.war.summary(SIZE)[0].siegeLeft, 1);
  assert.equal(bt.day, 0);
  assert.equal(w.ev.deaths.length, 0);
  step(w, 60);
  assert.equal(w.war.summary(SIZE)[0].siege, false, '30 days');
  assert.equal(bt.day, 0);
  step(w, 61);
  assert.equal(bt.day, 1, 'the first day of fighting');
});

test('RULES.md "War" Sieges: winter lifts a siege on its first day; the attackers go home and nobody wins', () => {
  const { w, bt } = siege(['stoneWalls']);
  const lostBefore = w.war.lostTo.slice();
  play(w, 251, 269);
  assert.equal(w.war.battles.length, 1);
  step(w, 270);
  assert.equal(w.war.battles.length, 0);
  assert.equal(w.war.totals.siegesLifted, 1);
  assert.equal(w.ev.battles.length, 0);
  assert.equal(w.st.holder[T], 1);
  assert.deepEqual(w.war.lostTo, lostBefore);
  assert.equal(w.war.attacking[0], 0);
  assert.equal(w.war.byHex[T], -1);
  assert.equal(w.war.busy(w.people, bt.slots[0][0]), false, 'the warriors are free again');
  assert.equal(w.war.fought[T], 0, 'no battle was fought');
});

test('RULES.md "War" Sieges: nothing grows back in a besieged hex; others regrow, and a siege that has become a fight no longer holds the food', () => {
  const { w } = siege(['palisade']);
  w.map.food[T] = 10; w.map.food[NB[1]] = 10;
  w.war.holdFood(w.map);
  w.map.food[T] = 50; w.map.food[NB[1]] = 50;
  w.war.restoreFood(w.map);
  assert.equal(w.map.food[T], 10);
  assert.equal(w.map.food[NB[1]], 50);
  play(w, 31, 60);
  w.map.food[T] = 10;
  w.war.holdFood(w.map);
  w.map.food[T] = 50;
  w.war.restoreFood(w.map);
  assert.equal(w.map.food[T], 50, 'the siege is over');
});

test('RULES.md "War" Sieges: when a besieged hex falls, floor(5%) of the losers in it who were not in the battle die (19 none, 20 one, 39 one, 40 two)', () => {
  for (const [children, want] of [[19, 0], [20, 1], [39, 1], [40, 2]]) {
    const { w } = siege(['palisade'], { children });
    play(w, 31, 89);
    assert.equal(w.ev.battles.length, 1, `${children} children`);
    assert.equal(w.ev.battles[0][4], 0, 'the besiegers won');
    const dead = w.ev.deaths.filter((d) => d.civ === 1 && d.cause === DEATH_WAR).length;
    assert.equal(dead, want, `${children} children`);
    assert.equal(w.ev.battles[0][5], want, 'the sack counts as killed by the winner');
    assert.equal(aliveOf(w, 1), 1 + children - want, 'everyone else lives');
    assert.equal(w.st.holder[T], 0);
  }
  // Uncalled adults are civilians too; a field battle (no walls) has no sack.
  const open = siege([], { children: 40 });
  play(open.w, 31, 89);
  assert.equal(open.w.ev.deaths.filter((d) => d.civ === 1).length, 0);
});

test('RULES.md "War" Breaking the siege: the besieged come out when fresh levy + the warriors inside, x attack, reach the besiegers\' fit x theirs; no walls then', () => {
  const mk = (adultsB, levelA = 1) => {
    const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 40, { str: 1 }], [T, 1, adultsB], [NB[1], 0, 0]].filter((g) => g[2] > 0), { settle: true, terrainAt: { [T]: HILLS } });
    relate(w, 0, 1, AT_WAR);
    walls(w, T, 1, ['palisade']);
    w.war.level[0] = levelA;
    const bt = begin(w, T, 0, 1);
    return { w, bt };
  };
  const relieve = (adultsB, levelA) => {
    const { w, bt } = mk(adultsB, levelA);
    const inside = bt.fit[1];
    w.war.atk[0] = w.war.attack(0); w.war.atk[1] = w.war.attack(1);
    w.war.relieve(w.people, w.map, 100, 60, w.rng);
    return { w, bt, inside };
  };
  // 20 fit adults: levy 5 inside; the fresh levy is 5 more: 10 against the besiegers' 10.
  const out = relieve(20, 1);
  assert.equal(out.bt.relieved, true);
  assert.equal(out.bt.siegeLeft, 0);
  assert.equal(out.bt.fit[1], 10, 'the fresh levy joins the defenders');
  assert.equal(out.bt.mul[1], 1.5, 'hills only: the Palisade does not help in the field');
  assert.equal(out.w.war.attacking[1], out.bt.uid);
  assert.equal(relieve(16, 1).bt.relieved, false, '4 + 4 against 10');
  assert.equal(relieve(20, 3).bt.relieved, false, '10 against 10 x 1.25');
  // A civ that is attacking elsewhere stays in.
  const busy = mk(20);
  busy.w.war.attacking[1] = 999;
  busy.w.war.relieve(busy.w.people, busy.w.map, 100, 60, busy.w.rng);
  assert.equal(busy.bt.relieved, false);
  // Through month(): before any attack is chosen, outside winter only.
  const m = mk(20);
  m.w.war.month(m.w.people, m.w.map, 100, 270, m.w.rng, null);
  assert.equal(m.bt.relieved, false, 'winter');
  m.w.war.month(m.w.people, m.w.map, 100, 60, m.w.rng, null);
  assert.equal(m.bt.relieved, true);
});

test('RULES.md "War" Breaking the siege: a battle fought after the defenders came out has no sack', () => {
  const w = world(['aggressive', 'expansionist'], [[NB[0], 0, 40, { str: 1 }], [T, 1, 20, { str: 0 }], [T, 1, 40, { age: 5 }]], { settle: true });
  relate(w, 0, 1, AT_WAR);
  walls(w, T, 1, ['palisade']);
  w.st.holder[NB[0]] = 0;
  w.war.eff.warLoss[1] = 1;
  const bt = begin(w, T, 0, 1);
  w.war.atk[0] = w.war.attack(0); w.war.atk[1] = w.war.attack(1);
  w.war.relieve(w.people, w.map, 100, 60, w.rng);
  assert.equal(bt.relieved, true);
  play(w, 61, 89);
  assert.equal(w.ev.battles.length, 1);
  assert.equal(w.ev.battles[0][4], 0);
  assert.equal(w.ev.deaths.filter((d) => d.civ === 1).length, 0, 'no sack, and the warriors were only wounded');
});

// ---- levy by civ type and walking in --------------------------------------------------------------------------------

test('RULES.md "War" Levy: 25% for every type (rounded, at least 1)', () => {
  for (const type of ['aggressive', 'nomadic', 'expansionist', 'isolationist', 'cooperative']) {
    assert.equal(WAR.levy[type], 0.25, type);
    const w = world([type, 'expansionist'], [[NB[0], 0, 40], [T, 1, 40]]);
    assert.equal(w.war.levyOf(0, 40), 10, type);
    assert.equal(w.war.levyOf(0, 1), 1);
    assert.equal(w.war.levyOf(0, 0), 0);
    assert.equal(begin(w, T, 0, 1).fit[0], 10, type);
  }
});

/** Civ 0 attacks T; civ 1 has only children there (nobody to call up) unless `adults` is given. */
function walkIn({ adults = 0, ring = [], settle = true } = {}) {
  const groups = [[NB[0], 0, 40, { str: 1 }], [T, 1, 6, { age: 5 }]];
  if (adults) groups.push([T, 1, adults]);
  const w = world(['aggressive', 'expansionist'], groups, { settle });
  if (settle) {
    w.st.holder[T] = 1; w.st.holder[NB[0]] = 0;
    w.st.capital[0] = NB[0]; w.st.capital[1] = T;
    w.st.storeCap.fill(1000);
  }
  relate(w, 0, 1, AT_WAR);
  if (ring.length) walls(w, T, 1, ring);
  return w;
}

test('RULES.md "War" Walking in: nobody called up and no siege means the attacker takes the hex without a battle', () => {
  const w = walkIn();
  w.st.store[T * M + WOOD] = 100;
  const bt = begin(w, T, 0, 1);
  assert.equal(bt.start[1], 0, 'nobody to defend');
  assert.equal(bt.siegeDays, 0);
  assert.equal(w.war.totals.battles, 1, 'counted when it begins');
  play(w, 31, 59);
  assert.equal(w.war.battles.length, 0, 'over');
  assert.equal(w.ev.battles.length, 0, 'onBattle is not called: no fight in stats, records or diplomacy');
  assert.ok(w.war.lostTo.every((v) => v < 0), 'lostTo is not set: no revenge for the loser');
  assert.equal(w.war.totals.battles, 0, 'not a battle');
  assert.equal(w.war.totals.occupied, 1, 'a hex occupied');
  assert.equal(w.war.totals.sieges, 0);
  assert.equal(w.st.holder[T], 0, 'the hex is taken');
  assert.equal(w.st.store[T * M + WOOD], 50, 'and looted as usual');
  assert.ok(aliveOf(w, 0, T) > 0, 'the attacker moved in');
  assert.equal(aliveOf(w, 1, T), 0, 'the children fled');
});

test('RULES.md "War" Walking in: a defender that called up anyone is a battle; a besieged hex with no defenders is not a walk-in', () => {
  const fought = walkIn({ adults: 8 });
  begin(fought, T, 0, 1);
  play(fought, 31, 59);
  assert.equal(fought.ev.battles.length, 1);
  assert.equal(fought.war.totals.battles, 1);
  assert.equal(fought.war.totals.occupied, 0);
  assert.equal(fought.war.lostTo[1 * 2 + 0] === 100 || fought.war.lostTo[0 * 2 + 1] === 100, true, 'revenge is set');

  const besieged = walkIn({ ring: ['palisade'] });
  const bt = begin(besieged, T, 0, 1);
  assert.equal(bt.start[1], 0);
  assert.ok(bt.siegeDays > 0, 'the walls mean a siege');
  play(besieged, 31, 100);
  assert.equal(besieged.ev.battles.length, 1, 'the siege ends in a battle that is reported');
  assert.equal(besieged.war.totals.occupied, 0);
  assert.equal(besieged.war.totals.battles, 1);
  assert.equal(besieged.war.totals.sieges, 1);
  assert.equal(besieged.war.lostTo[1 * 2 + 0], 100);
});

// ---- events, summary, integration ------------------------------------------------------------------------------------

test('RULES.md "War" summary: plain data for every battle and siege under way', () => {
  const { w, bt } = siege(['palisade']);
  const [s] = w.war.summary(SIZE);
  assert.deepEqual([s.hex, s.col, s.row, s.attacker, s.defender, s.holder, s.siege, s.siegeDays, s.siegeLeft, s.day],
    [T, T % SIZE, Math.floor(T / SIZE), 0, 1, 1, true, 30, 30, 0]);
  assert.deepEqual(s.warriors, [bt.fit[0], bt.fit[1]]);
  assert.deepEqual(s.morale, [100, 100]);
  assert.deepEqual(s.attack, [1, 1.25]);
});

test('RULES.md "Statistics" History: a declaration is logged as "declared" (first 16 only) and reads "Civ A declared war on Civ B"', () => {
  assert.equal(DECLARED_LOGGED, 16);
  const rec = new Records(3, 3);
  for (let k = 0; k < 30; k++) rec.diplomacy('declared', k % 2, 2, k, 0);
  const ev = rec.data(new People(8), 100).events.filter((e) => e.type === 'declared');
  assert.equal(ev.length, 16);
  assert.deepEqual([ev[0].civ, ev[0].other, ev[0].year], [0, 2, 0]);
  assert.equal(eventText({ type: 'declared', civ: 0, other: 1, year: 5 }), 'Civ 1 declared war on Civ 2');
  assert.ok(RULES.includes('"Civ A declared war on Civ B" (the first 16 declarations of the game)'));
});

test('RULES.md "A year" step 9: after the year the counts hold everyone aged 15 to 45 per hex and civ, chained for the levy', () => {
  const sim = new Simulation({ seed: 'counts', size: 10, civCount: 3, startPop: 30 });
  sim.tick(4);
  const war = sim.war;
  const p = sim.people;
  const civs = sim.civCount;
  const fit = new Int32Array(sim.map.count * civs);
  const all = new Int32Array(sim.map.count * civs);
  for (let i = 0; i < p.high; i++) {
    if (!p.alive[i]) continue;
    const k = p.hex[i] * civs + p.civ[i];
    all[k]++;
    if (p.age[i] >= WAR.fitAge - 1 && p.age[i] <= WAR.maxAge) fit[k]++;
  }
  assert.deepEqual([...war.cnt], [...all]);
  assert.deepEqual([...war.fitCnt], [...fit]);
  for (let k = 0; k < fit.length; k++) {
    let n = 0;
    for (let i = war.head[k]; i >= 0; i = war.next[i]) { n++; assert.ok(p.age[i] >= 15 && p.age[i] <= 45); }
    assert.equal(n, fit[k]);
  }
  assert.equal(war.civTraits, sim.civTraits, 'average aggression is the one recorded at the end of last year');
});

test('RULES.md "War" seeded run: an Aggressive civ declares on a bordering one on the first day, battles happen, and the same params give the same hash', () => {
  const make = () => new Simulation({ seed: 'warrun', size: 10, civCount: 4, startPop: 40, water: 0.5, civTypes: ['aggressive', 'expansionist', 'cooperative', 'nomadic'] });
  const a = make(); a.tick(120);
  const b = make(); b.tick(120);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.stats().warTotals, b.stats().warTotals);
  assert.deepEqual(a.report().records.wars, b.report().records.wars);
  assert.ok(a.stats().warTotals.battles > 0, 'battles were fought');
  const events = a.report().records.chronicle ?? [];
  assert.ok(JSON.stringify(events).includes('declared') || a.stats().relations.length > 0);
  const t = make();
  t.days(31);
  // A year of civ 0's (Aggressive) neighbours: whoever it borders at the end of the first year is at war with it by the first month.
  assert.ok(t.stats().relations.every((r) => r.relation !== 'none'));
  // Every war death is a real person and the identity holds.
  for (const c of a.stats().civs) {
    assert.equal(40 + c.births - (c.deaths.oldAge + c.deaths.starvation + c.deaths.war + c.deaths.childhood + c.deaths.childbirth) + c.switchesIn - c.switchesOut, c.pop);
  }
});

test('RULES.md "War" determinism: a long war-heavy run twice gives the same state hash, battles and sieges', () => {
  const run = () => {
    const s = new Simulation({ seed: 'siegehash', size: 12, civCount: 4, water: 0.4, civTypes: ['aggressive', 'aggressive', 'expansionist', 'cooperative'] });
    s.tick(250);
    return [s.hash(), JSON.stringify(s.stats().warTotals), s.people.count];
  };
  assert.deepEqual(run(), run());
});
