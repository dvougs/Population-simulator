// RULES.md "Civilisations and people", "A year" (Births), "Statistics" and the end screen's data: men and women.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, PYRAMID_BAND, PYRAMID_TOP, PYRAMID_BANDS } from '../../src/sim/simulation.js';
import { DEATH_CAUSES } from '../../src/sim/life.js';

const params = { seed: 'sexes', size: 12, civCount: 3, startPop: 21 };

test('RULES.md "Civilisations and people": a new game has half women per civ (the extra one a woman), aged 14 to 31', () => {
  const sim = new Simulation(params);
  const p = sim.people;
  const women = [0, 0, 0];
  for (let i = 0; i < p.high; i++) {
    women[p.civ[i]] += p.female[i];
    assert.ok(p.age[i] >= 14 && p.age[i] <= 31);
    assert.equal(p.parent[i] + p.father[i] + p.kids[i] + p.rest[i], 0);
  }
  assert.deepEqual(women, [11, 11, 11], '21 founders: 11 women and 10 men');
  const s = sim.stats().civs;
  assert.deepEqual(s.map((c) => [c.women, c.men]), [[11, 10], [11, 10], [11, 10]]);
  assert.equal(new Simulation({ ...params, startPop: 4 }).stats().civs[0].women, 2, 'the least a civ starts with is 4: 2 and 2');
  assert.equal(new Simulation({ ...params, startPop: 1 }).people.count, 12, 'a start population under 4 is raised to 4');
});

test('RULES.md "Statistics": men and women per civ add up to its people, in a seeded run', () => {
  const sim = new Simulation(params);
  sim.tick(60);
  let total = 0;
  for (const c of sim.stats().civs) {
    assert.equal(c.men + c.women, c.pop);
    total += c.women;
  }
  let w = 0;
  const p = sim.people;
  for (let i = 0; i < p.high; i++) if (p.alive[i]) w += p.female[i];
  assert.equal(total, w);
  assert.ok(total > 10 && total < sim.people.count);
});

test('RULES.md "Statistics": deaths by the five causes and the totals identity, with childhood and childbirth deaths seen in a run', () => {
  const sim = new Simulation({ seed: 'causes', size: 12, civCount: 3, startPop: 30 });
  sim.tick(150);
  assert.equal(DEATH_CAUSES, 5);
  let child = 0; let cbirth = 0;
  for (const c of sim.stats().civs) {
    const d = c.deaths;
    assert.deepEqual(Object.keys(d), ['oldAge', 'starvation', 'war', 'childhood', 'childbirth']);
    assert.equal(30 + c.births - (d.oldAge + d.starvation + d.war + d.childhood + d.childbirth) + c.switchesIn - c.switchesOut, c.pop);
    child += d.childhood; cbirth += d.childbirth;
  }
  assert.ok(child > 20, `childhood deaths ${child}`);
  assert.ok(cbirth > 0, `childbirth deaths ${cbirth}`);
  const r = sim.report();
  assert.deepEqual(Object.keys(r.deaths), ['oldAge', 'starvation', 'war', 'childhood', 'childbirth']);
  assert.equal(r.deaths.childhood, r.civs.reduce((a, c) => a + c.deaths.childhood, 0));
  assert.equal(r.deaths.childbirth, r.civs.reduce((a, c) => a + c.deaths.childbirth, 0));
  for (const c of r.civs) {
    if (c.avgLifespan !== null && c.grownLifespan !== null) assert.ok(c.grownLifespan > c.avgLifespan, 'those who grew up live longer on average');
  }
});

test('RULES.md "Statistics": children per woman is about 3 to 8 once women have died at 45 or older (long seeded run)', () => {
  const sim = new Simulation({ seed: 'cpw', size: 14, civCount: 3, startPop: 40 });
  sim.tick(150);
  const got = sim.report().civs.map((c) => c.childrenPerWoman).filter((v) => v !== null);
  assert.ok(got.length > 0, 'some civ has women who died at 45 or more');
  for (const v of got) assert.ok(v > 1 && v < 10, `${v}`);
});

test('RULES.md end screen: the population pyramid has 5-year bands to 80 and over, men and women, and adds up to the living', () => {
  assert.deepEqual([PYRAMID_BAND, PYRAMID_TOP, PYRAMID_BANDS], [5, 80, 17]);
  const sim = new Simulation(params);
  sim.tick(90);
  const P = sim.report().pyramid;
  assert.deepEqual([P.band, P.top, P.bands], [5, 80, 17]);
  assert.equal(P.counts.length, 3 * 2 * 17);
  // Rebuild it from the people at the end of the last year.
  const want = new Int32Array(P.counts.length);
  const p = sim.people;
  for (let i = 0; i < p.high; i++) {
    if (!p.alive[i]) continue;
    const band = p.age[i] >= 80 ? 16 : Math.floor(p.age[i] / 5);
    want[(p.civ[i] * 2 + p.female[i]) * 17 + band]++;
  }
  assert.deepEqual([...P.counts], [...want]);
  assert.equal(P.counts.reduce((a, b) => a + b, 0), sim.people.count);
});

test('RULES.md tap a person: person() has sex, mother, father, children and children borne', () => {
  const sim = new Simulation(params);
  sim.tick(40);
  const p = sim.people;
  let slot = -1;
  for (let i = 0; i < p.high; i++) if (p.alive[i] && p.female[i] && p.kids[i] > 0) { slot = i; break; }
  assert.ok(slot >= 0, 'a mother exists after 40 years');
  const w = sim.person(slot, p.id[slot]);
  assert.equal(w.female, true);
  assert.equal(w.born, p.kids[slot]);
  assert.ok(w.children <= w.born, 'living children never exceed the children borne');
  assert.ok(w.children > 0 || w.born > 0);
  // A child with living parents.
  let child = -1;
  for (let i = 0; i < p.high && child < 0; i++) {
    if (!p.alive[i] || p.gen[i] === 1) continue;
    const pr = sim.person(i, p.id[i]);
    if (pr.parentAlive && pr.fatherAlive) child = i;
  }
  assert.ok(child >= 0);
  const c = sim.person(child, p.id[child]);
  assert.equal(typeof c.father, 'number');
  assert.equal(typeof c.parent, 'number');
  assert.equal(c.female, p.female[child] === 1);
  // A founder has neither parent; a man has borne none.
  let f0 = -1;
  for (let i = 0; i < p.high && f0 < 0; i++) if (p.alive[i] && p.gen[i] === 1) f0 = i;
  assert.ok(f0 >= 0);
  const founder = sim.person(f0, p.id[f0]);
  assert.deepEqual([founder.parent, founder.father, founder.parentAlive, founder.fatherAlive], [null, null, null, null]);
  for (let i = 0; i < p.high; i++) if (p.alive[i] && !p.female[i]) { assert.equal(sim.person(i, p.id[i]).born, 0); break; }
});

test('RULES.md "Tap a person": population() carries each person\'s sex', () => {
  const sim = new Simulation(params);
  sim.tick(5);
  const pop = sim.population();
  assert.equal(pop.female.length, pop.alive.length);
  for (let i = 0; i < pop.alive.length; i++) if (pop.alive[i]) assert.ok(pop.female[i] === 0 || pop.female[i] === 1);
  assert.equal(pop.female.reduce((a, b, i) => a + (pop.alive[i] ? b : 0), 0), sim.stats().civs.reduce((a, c) => a + c.women, 0));
});

test('in a seeded run every child has a mother and a father of her civ and generations follow the higher parent', () => {
  const sim = new Simulation({ seed: 'family', size: 12, civCount: 2, startPop: 24, civTypes: ['isolationist', 'isolationist'] });
  sim.tick(50);
  const p = sim.people;
  const byId = new Map();
  for (let i = 0; i < p.high; i++) if (p.alive[i]) byId.set(p.id[i], i);
  let both = 0; let sexRatioGirls = 0; let kids = 0;
  for (let i = 0; i < p.high; i++) {
    if (!p.alive[i] || p.gen[i] === 1) continue;
    kids++;
    sexRatioGirls += p.female[i];
    assert.ok(p.parent[i] !== 0 || p.father[i] !== 0, 'a child has parents recorded');
    const m = byId.get(p.parent[i]);
    const f = byId.get(p.father[i]);
    if (m !== undefined) assert.equal(p.female[m], 1, 'the mother is a woman');
    if (f !== undefined) assert.equal(p.female[f], 0, 'the father is a man');
    if (m !== undefined && f !== undefined) {
      both++;
      assert.equal(p.gen[i], Math.max(p.gen[m], p.gen[f]) + 1);
      assert.ok(p.age[m] >= p.age[i] + 15 && p.age[m] <= p.age[i] + 49, 'mother was 15 to 49 at the birth');
    }
  }
  assert.ok(both > 20 && kids > 40, `${both} of ${kids}`);
  assert.ok(sexRatioGirls > 0 && sexRatioGirls < kids);
});

test('determinism: the same params and seed give the same state hash with men and women; another seed does not', () => {
  const run = (seed) => { const s = new Simulation({ ...params, seed }); s.tick(80); return s.hash(); };
  assert.equal(run('d1'), run('d1'));
  assert.notEqual(run('d1'), run('d2'));
  const a = new Simulation(params); const b = new Simulation(params);
  assert.equal(a.hash(), b.hash());
  a.tick(30); b.tick(30);
  assert.equal(a.hash(), b.hash());
  assert.equal(JSON.stringify(a.report().pyramid.counts), JSON.stringify(b.report().pyramid.counts));
});
