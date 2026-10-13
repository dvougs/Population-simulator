// RULES.md "Peoples" and the per-civ game settings (people, traits, own mutation and starting people, colour).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PEOPLES, PEOPLE_IDS, DEFAULT_PEOPLES, CUSTOM, TRAIT_COSTS, BUDGET_SLACK, traitBudget, peopleTraits, civNames, people,
} from '../../src/sim/peoples.js';
import { TRAITS } from '../../src/sim/traits.js';
import { CIV_TYPES, CIV_TYPE_NAMES } from '../../src/sim/civTypes.js';
import { normalizeParams, COLOUR_COUNT, civStartPop, civMutation } from '../../src/sim/params.js';
import { Simulation } from '../../src/sim/simulation.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
const section = RULES.slice(RULES.indexOf('## Peoples'), RULES.indexOf('## A year'));

test('RULES.md "Peoples": the table lists every people with its type, traits and budget', () => {
  const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| People')).map((l) => l.slice(2, -2).split(' | '));
  assert.equal(rows.length, 17);
  assert.equal(PEOPLES.length, 17);
  rows.forEach(([name, type, ...rest], k) => {
    const p = PEOPLES[k];
    assert.equal(name, p.name);
    assert.equal(type, CIV_TYPE_NAMES[p.type]);
    assert.deepEqual(rest.slice(0, 8).map(Number), TRAITS.map((t) => p.traits[t]), name);
    assert.equal(Number(rest[8]), traitBudget(p.traits), name);
  });
});

test('RULES.md "Peoples": costs, slack and history lines', () => {
  const words = { fertility: 'fertility', lifeExpectancy: 'life expectancy', strength: 'strength', aggression: 'aggression',
    cooperation: 'cooperation', metabolism: 'metabolism', heatTolerance: 'heat tolerance', coldTolerance: 'cold tolerance' };
  assert.ok(section.includes(TRAITS.map((t) => `${words[t]} ${TRAIT_COSTS[t]}`).join(', ')));
  assert.equal(BUDGET_SLACK, 5);
  assert.ok(section.includes('spends at most 5 points'));
  for (const p of PEOPLES) assert.ok(section.includes(`${p.name} "${p.about}"`), p.name);
});

test('every people: a known type, traits 0 to 1 in steps of 0.05, a budget within 0 to the slack', () => {
  assert.equal(new Set(PEOPLE_IDS).size, PEOPLES.length);
  assert.ok(!PEOPLE_IDS.includes(CUSTOM));
  for (const type of CIV_TYPES) assert.ok(PEOPLES.filter((p) => p.type === type).length >= 2, `${type} has at least two peoples`);
  for (const p of PEOPLES) {
    assert.ok(CIV_TYPES.includes(p.type), p.id);
    assert.deepEqual(Object.keys(p.traits), TRAITS, p.id);
    for (const v of Object.values(p.traits)) {
      assert.ok(v >= 0 && v <= 1, p.id);
      assert.ok(Math.abs(v * 20 - Math.round(v * 20)) < 1e-9, `${p.id} ${v} is a step of 0.05`);
    }
    const b = traitBudget(p.traits);
    // Nomadic peoples are under 0: their type is worth more on its own.
    assert.ok(b <= BUDGET_SLACK && (b >= 0 || p.type === 'nomadic'), `${p.id} budget ${b}`);
  }
});

test('trait budget: cost × (value − 0.5) × 10 summed, one decimal', () => {
  assert.equal(traitBudget({}), 0);
  assert.equal(traitBudget(peopleTraits(CUSTOM)), 0);
  for (const t of TRAITS) {
    assert.equal(traitBudget({ [t]: 0.6 }), TRAIT_COSTS[t], t);
    assert.equal(traitBudget({ [t]: 0.4 }), -TRAIT_COSTS[t], t);
  }
});

test('RULES.md "Peoples": default peoples by civ number follow the default type order', () => {
  assert.deepEqual(DEFAULT_PEOPLES, ['romans', 'assyrians', 'babylonians', 'egyptians', 'mongols', 'persians', 'vikings', 'greeks']);
  const p = normalizeParams({ civCount: 8 });
  assert.deepEqual(p.civs.map((c) => c.people), DEFAULT_PEOPLES);
  assert.deepEqual(p.civTypes, DEFAULT_PEOPLES.map((id) => people(id).type));
});

test('RULES.md "Peoples": a type without a people picks a free people of that type', () => {
  const p = normalizeParams({ civCount: 4, civTypes: ['nomadic', 'nomadic', 'aggressive', 'nomadic'] });
  // Mongols, then Scythians (the default Assyrians are not Nomadic), Assyrians, and no Nomadic people left: the first free one.
  assert.deepEqual(p.civs.map((c) => c.people), ['mongols', 'scythians', 'assyrians', 'romans']);
  assert.deepEqual(p.civTypes, ['nomadic', 'nomadic', 'aggressive', 'nomadic'], 'a given type stays');
  const q = normalizeParams({ civCount: 2, civs: [{ people: 'nope' }, { people: 'incas' }] });
  assert.deepEqual(q.civs.map((c) => c.people), ['romans', 'incas']);
  assert.deepEqual(q.civTypes, ['expansionist', 'isolationist'], 'no type given: the people\'s');
});

test('RULES.md "Game settings": a civ\'s traits, own mutation and starting people are clamped; missing means its people\'s or the game\'s', () => {
  const p = normalizeParams({ civCount: 2, mutation: 0.05, startPop: 30, civs: [
    { people: 'greeks', traits: { fertility: 1.4, strength: -1, aggression: 0.333, cooperation: 'x' }, mutation: 0.5, startPop: 1 },
    { people: 'romans', mutation: null, startPop: '' },
  ] });
  const g = p.civs[0].traits;
  assert.deepEqual([g.fertility, g.strength, g.aggression, g.cooperation], [1, 0, 0.33, peopleTraits('greeks').cooperation]);
  assert.equal(g.lifeExpectancy, peopleTraits('greeks').lifeExpectancy);
  assert.deepEqual([p.civs[0].mutation, p.civs[0].startPop], [0.1, 4]);
  assert.deepEqual([p.civs[1].mutation, p.civs[1].startPop], [null, null]);
  assert.deepEqual([civMutation(p, 0), civStartPop(p, 0), civMutation(p, 1), civStartPop(p, 1)], [0.1, 4, 0.05, 30]);
});

test('RULES.md "Game settings": colours are distinct; a missing or taken one is the first free colour from the civ\'s number', () => {
  const c = (civs, n = civs.length) => normalizeParams({ civCount: n, civs }).civs.map((x) => x.colour);
  assert.deepEqual(c([], 3), [0, 1, 2]);
  assert.deepEqual(c([{ colour: 9 }, { colour: 9 }, {}]), [9, 1, 2]);
  assert.deepEqual(c([{ colour: 1 }, {}, { colour: 12 }]), [1, 2, 3]);
  assert.deepEqual(c([{ colour: 11 }, { colour: -1 }]), [11, 1]);
  assert.equal(COLOUR_COUNT, 12);
});

test('RULES.md "Peoples": a Custom civ has a typed name (24 characters at most), traits 0.5 and the default type', () => {
  const p = normalizeParams({ civCount: 2, civs: [{ people: CUSTOM, name: '  Atlanteans of the deep blue sea  ' }, { people: CUSTOM }] });
  assert.equal(p.civs[0].name, 'Atlanteans of the deep b');
  assert.ok(Object.values(p.civs[0].traits).every((v) => v === 0.5));
  assert.deepEqual(p.civTypes, ['expansionist', 'aggressive']);
  assert.deepEqual(civNames(p.civs), ['Atlanteans of the deep b', 'Custom civ']);
  assert.equal(normalizeParams({ civs: [{ people: 'romans', name: 'Ignored' }] }).civs[0].name, '');
});

test('RULES.md "Peoples": names repeat with " 2", " 3"', () => {
  const p = normalizeParams({ civCount: 4, civs: [{ people: 'romans' }, { people: 'romans' }, { people: CUSTOM, name: 'Romans' }, { people: 'incas' }] });
  assert.deepEqual(civNames(p.civs), ['Romans', 'Romans 2', 'Romans 3', 'Incas']);
});

test('a Simulation founds each civ with its own number and traits, and names civs by their peoples', () => {
  const sim = new Simulation({ seed: 'peoples', civCount: 3, startPop: 20, civs: [
    { people: 'romans', startPop: 5 }, { people: CUSTOM, name: 'Atlantis', traits: { fertility: 0.9 } }, { people: 'mongols' },
  ] });
  const s = sim.stats();
  assert.deepEqual(s.civs.map((c) => c.pop), [5, 20, 20]);
  assert.deepEqual(s.civs.map((c) => c.name), ['Romans', 'Atlantis', 'Mongols']);
  assert.deepEqual(s.civs.map((c) => c.people), ['romans', CUSTOM, 'mongols']);
  assert.ok(Math.abs(s.civs[1].startTraits.fertility - 0.9) < 0.03);
  const run = () => { const x = new Simulation({ seed: 'peoples', civCount: 2, civs: [{ people: 'han', mutation: 0.1 }, { people: 'maya' }] }); x.tick(80); return x.hash(); };
  assert.equal(run(), run());
});
