// Pure UI helpers (no DOM): How to play text, the demo world, SimHost.reach and the shared people maths (T-028 helpers, T-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { howText, levelFacts, typeFacts, traitFacts, terrainFacts, materialFacts, pct, andList } from '../../src/ui/howText.js';
import { DemoWorld, DEMO, DEMO_PARAMS } from '../../src/ui/demoWorld.js';
import { LocalSimHost } from '../../src/host/simHost.js';
import { buildReach } from '../../src/sim/migration.js';
import { civTypeText, CIV_TYPES, CIV_TYPE_NAMES } from '../../src/sim/civTypes.js';
import { TRAITS, TRAIT_NAMES } from '../../src/sim/traits.js';
import { MATERIAL_NAMES, MATERIAL_TIER, DEPOSIT_CHANCE, RIVER_DEPOSIT_CHANCE } from '../../src/sim/materials.js';
import { DEEP_WATER } from '../../src/sim/terrain.js';
import * as maths from '../../src/render/peopleMaths.js';
import * as layer from '../../src/render/peopleLayer.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
function table(heading) {
  const start = RULES.indexOf(heading);
  assert.ok(start >= 0, heading);
  const lines = RULES.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let k = first + 2; k < lines.length && lines[k].startsWith('|'); k++) rows.push(lines[k].split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}
const all = () => {
  const t = howText();
  const parts = [t.intro];
  for (const s of t.sections) {
    parts.push(s.kicker, s.title, ...(s.paras ?? []), ...(s.points ?? []), ...[].concat(s.after ?? []));
    for (const [a, b] of s.steps ?? []) parts.push(a, b);
  }
  return parts.join('\n');
};

test('How to play text: formatting helpers', () => {
  assert.equal(pct(0.25), '25%');
  assert.equal(pct(0.075), '7.5%');
  assert.equal(pct(1), '100%');
  assert.equal(andList(['a']), 'a');
  assert.equal(andList(['a', 'b']), 'a and b');
  assert.equal(andList(['a', 'b', 'c']), 'a, b and c');
  assert.equal(andList(['a', 'b', 'c'], 'or'), 'a, b or c');
});

test('How to play text: has the sections in the RULES.md order and every number is the one in RULES.md', () => {
  const t = howText();
  assert.deepEqual(t.sections.map((s) => s.id), ['map', 'people', 'year', 'migration', 'civs', 'traits', 'peoples', 'types', 'contact', 'peace', 'levels', 'end', 'controls']);
  const text = all();
  for (const must of [
    'from 10 × 10 up to 50 × 50', 'regrows 50%', '+30 food',
    'costs 1 movement point', 'desert or tundra 1.5', 'forest or hills 2', 'mountain 3', '+25% in forest, +50% in hills and +100% in mountain',
    'health from 0 to 100', 'they gain 25 health', 'they lose about 35', 'Between 16 and 40', 'about a 5% chance', 'From about 45', 'past about 85',
    '2 days every second', 'a season in 45 seconds and a year in 3 minutes', '5×, 20×, 100× or Max', 'step a month (30 days)', 'years of 360 days',
    'hungry sets out with a 50% chance', 'more people than 50% of its food', 'sets out with a 20% chance',
    'People move one hex a year', 'with 5 movement points a year', 'needs counts × 3', 'cannot beat, × 0.25', 'can beat, × 2', '+20% for each neighbouring hex', 'counted twice',
    '1 to 8 civilisations', '2 to 200 people (20 by default)', 'at least 3 steps',
    'up to ±3%', '0% to 10%',
    'above 0.5', 'above 0.4', '3 to 1', 'above 0.45', 'last 20 years', 'loses 20% of its people', 'the winner loses 5%, rounded down', 'about 1% a year',
    'There are 9 materials', 'at most 20% of the people there went hungry last year', "20% of a hex's adults gather its deposits",
    'only 0.5 a year (0.0625 of an exotic)', 'at most 10 a deposit a year (1.25 for exotics)',
    'camp from 1, village from 12, town from 30, city from 60, metropolis from 100 and megapolis from 160 people', 'a town needs level 2, a megapolis level 5', 'shrinks after 20 years',
    '100 years in a row falls back',
    'at least 60% of the land for 300 years', '1000, 2500, 5000 or 10000 years',
  ]) assert.ok(text.includes(must), `missing "${must}"`);
});

test('How to play text: the year steps are the ten steps of "A year", in order', () => {
  const steps = howText().sections.find((s) => s.id === 'year').steps.map(([name]) => name);
  assert.equal(steps.length, 10);
  assert.deepEqual(steps.slice(0, 3), ['First day: gather and level up', 'First day: birthdays', 'First day: eat']);
  assert.equal(steps[5], 'Every month: migrate');
  assert.equal(steps[9], 'Last day: the end?');
});

test('levelFacts: five levels with the RULES.md names, effects and requirement rows', () => {
  const f = levelFacts();
  assert.deepEqual(f.map((l) => l.name), ['Foragers', 'Farmers', 'Builders', 'Organised', 'Kingdom']);
  assert.equal(f[0].needs, null);
  const rows = table('| From → to |');
  rows.forEach(([, years, landPct, perHex, mats], k) => {
    const l = f[k + 1];
    assert.ok(l.needs.includes(`${years} years`), `level ${k + 2} years`);
    assert.ok(l.needs.includes(`${landPct} of its share of the land`), `"${landPct}" in "${l.needs}"`);
    assert.ok(l.needs.includes(`(${perHex} people per hex)`));
    for (const part of mats.split(',')) {
      const [n, name] = part.trim().split(' ');
      assert.ok(l.needs.includes(`${n} ${name}`), `${part} in "${l.needs}"`);
    }
  });
  assert.match(f[1].does, /25% more.*Rafts.*one sea or lake hex/);
  assert.match(f[2].does, /half as much in desert, tundra and mountain/);
  assert.match(f[3].does, /up to 3 sea or lake hexes in a row/);
  assert.match(f[4].does, /25% more.*5 years later.*× 3 strength.*no other civ can move in/);
  assert.deepEqual(f.map((l) => /Birth chance \+([\d.]+) percentage point/.exec(l.does)?.[1] ?? null), [null, '0.5', '1', '1.5', '2']);
});

test('typeFacts: the five civ types with the setup text and their level changes', () => {
  const f = typeFacts();
  assert.deepEqual(f.map((t) => t.type), CIV_TYPES);
  assert.deepEqual(f.map((t) => t.name), CIV_TYPES.map((t) => CIV_TYPE_NAMES[t]));
  for (const t of f) assert.equal(t.text, civTypeText(t.type));
  const by = Object.fromEntries(f.map((t) => [t.type, t]));
  assert.equal(by.expansionist.levels, null);
  assert.equal(by.aggressive.levels, null);
  assert.equal(by.cooperative.levels, 'Levels: gathers 25% more.');
  assert.equal(by.nomadic.levels, 'Levels: needs 10% more years at each level.');
  assert.equal(by.isolationist.levels, 'Levels: needs 20% fewer years at each level, but 25% more materials.');
});

test('traitFacts: eight traits in order with RULES.md numbers in the text', () => {
  const f = traitFacts();
  assert.deepEqual(f.map((t) => t.id), TRAITS);
  assert.deepEqual(f.map((t) => t.name), TRAIT_NAMES);
  assert.match(f[0].rule, /2\.5% to 7\.5%/);
  assert.match(f[1].rule, /35 to 55 years/);
  assert.match(f[5].rule, /0\.75 to 1\.25/);
  assert.match(f[4].rule, /0\.5 to 1\.5/);
  assert.ok(f.every((t) => t.text.length > 10 && t.rule.length > 40));
});

test('terrainFacts: land terrains with the RULES.md food, movement and defence, most food first', () => {
  const f = terrainFacts();
  assert.equal(f.length, 7);
  assert.deepEqual(f.map((t) => t.name), ['Plains', 'Coast', 'Forest', 'Hills', 'Tundra', 'Mountain', 'Desert']);
  const rows = Object.fromEntries(table('### Terrain\n').map(([name, food, move, def]) => [name, [Number(food), move, def]]));
  for (const t of f) {
    const [food, move, def] = rows[t.name];
    assert.equal(t.food, food, t.name);
    assert.equal(t.move, Number(move), t.name);
    assert.equal(t.defence, Number(def.replace(/[+%]/g, '')) / 100, t.name);
  }
});

test('materialFacts: nine materials with their tier and the best terrains from the RULES.md table', () => {
  const f = materialFacts();
  assert.deepEqual(f.map((m) => m.name), MATERIAL_NAMES);
  assert.deepEqual(f.map((m) => m.tier), MATERIAL_TIER);
  const rows = table('Chance a hex holds a deposit');
  const cols = ['coast', 'plains', 'forest', 'hills', 'mountain', 'desert', 'tundra'];
  rows.forEach(([, , ...cells], m) => {
    const chance = Object.fromEntries(cols.map((c, k) => [c, Number(cells[k]) / 100]));
    for (const w of f[m].where) {
      if (w.name === 'rivers') assert.equal(w.chance, Number(cells[7]) / 100);
      else assert.equal(w.chance, chance[w.name], `${MATERIAL_NAMES[m]} ${w.name}`);
    }
    const best = Math.max(...Object.values(chance));
    assert.equal(f[m].where[0].chance, best, `${MATERIAL_NAMES[m]}: best terrain first`);
    assert.equal(RIVER_DEPOSIT_CHANCE[m] * 100, Number(cells[7]));
    assert.ok(DEPOSIT_CHANCE[m].length === 8);
  });
});

test('RULES.md "Home page": the living world and the pictured world', () => {
  assert.deepEqual({ ...DEMO_PARAMS, civTypes: [...DEMO_PARAMS.civTypes], endConditions: [...DEMO_PARAMS.endConditions] }, {
    seed: 'genesis', size: 12, rivers: 3, civCount: 4, civTypes: ['expansionist', 'aggressive', 'cooperative', 'nomadic'], startPop: 20, endConditions: [],
  });
  assert.deepEqual({ ...DEMO }, { howYear: 300, homeStartYear: 60, homeYearsPerSecond: 6, homeRestartYear: 1500, homeStillYear: 300 });
});

test('DemoWorld runs the real game: 4 civs of 20 on a 12 x 12 map, deterministic, and runTo does not go back', () => {
  const a = new DemoWorld();
  assert.equal(a.year, 0);
  assert.equal(a.map.cols, 12);
  assert.equal(a.host.stats().totalPop, 80);
  a.runTo(60);
  assert.equal(a.year, 60);
  a.runTo(30);
  assert.equal(a.year, 60, 'no-op when already past');
  const b = new DemoWorld();
  b.runTo(60);
  assert.equal(a.host.hash(), b.host.hash());
  const w = a.world();
  assert.equal(w.pop.tick, 60);
  assert.equal(w.pop.civs, 4);
  assert.ok(w.colours);
});

test('SimHost.reach(index, movePoints): land only, ascending, equal to buildReach; null without a game or off the map', () => {
  const host = new LocalSimHost();
  assert.equal(host.reach(5, 3), null, 'no game');
  host.start({ seed: 'genesis', size: 12, rivers: 3 });
  const map = host.sim.map;
  assert.equal(host.reach(-1, 3), null);
  assert.equal(host.reach(map.count, 3), null);
  assert.equal(host.reach(1.5, 3), null);
  assert.equal(host.reach('5', 3), null);
  assert.equal(host.reach(NaN, 3), null);
  let checked = 0;
  for (let h = 0; h < map.count; h++) {
    for (const mp of [3, 5]) {
      const r = host.reach(h, mp);
      const expected = buildReach(map, mp);
      assert.deepEqual([...r], [...expected.targets.slice(expected.offsets[h], expected.offsets[h + 1])]);
      for (let k = 0; k < r.length; k++) {
        assert.notEqual(map.terrain[r[k]], DEEP_WATER, 'land only');
        if (k > 0) assert.ok(r[k] > r[k - 1], 'ascending');
        assert.notEqual(r[k], h);
      }
      checked++;
    }
  }
  assert.equal(checked, map.count * 2);
  const land = map.terrain.findIndex((t) => t !== DEEP_WATER);
  assert.ok(host.reach(land, 5).length >= host.reach(land, 3).length);
  assert.deepEqual([...host.reach(0, 3)], [], 'a deep water hex reaches nothing');
});

test('SimHost.reach does not change the game', () => {
  const host = new LocalSimHost();
  host.start({ seed: 'genesis', size: 12 });
  const before = host.hash();
  host.reach(40, 3);
  assert.equal(host.hash(), before);
});

test('peopleMaths is the shared module and peopleLayer re-exports the same functions', () => {
  assert.equal(layer.shortCount, maths.shortCount);
  assert.equal(layer.hexTotal, maths.hexTotal);
  assert.equal(layer.largestCiv, maths.largestCiv);
  assert.deepEqual([0, 999, 1000, 1234, 9999, 10000, 45999, 46000, 999999, 1000000, 2400000].map(maths.shortCount),
    ['0', '999', '1k', '1.2k', '9.9k', '10k', '46k', '46k', '999k', '1M', '2M']);
  const hex = Int32Array.of(0, 0, 3, 5, 2, 2);
  assert.equal(maths.hexTotal(hex, 2, 1), 8);
  assert.equal(maths.largestCiv(hex, 2, 1), 1);
  assert.equal(maths.largestCiv(hex, 2, 2), 0, 'tie: the lower civ number');
  assert.equal(maths.largestCiv(hex, 2, 0), -1);
  const spot = maths.personSpot(42, 10);
  assert.deepEqual(spot, maths.personSpot(42, 10), 'a person\'s spot depends only on their id');
  assert.ok(Math.hypot(spot.dx, spot.dy) <= 10);
});
