import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/sim/simulation.js';
import { WATER, MIN_CELL_POP } from '../../src/sim/constants.js';

function checkWorld(sim, label) {
  const w = sim.world;
  const pop = new Array(sim.civs.length).fill(0);
  const cells = new Array(sim.civs.length).fill(0);
  for (let i = 0; i < w.size; i++) {
    const p = w.young[i] + w.adult[i] + w.elder[i];
    for (const v of [w.young[i], w.adult[i], w.elder[i], w.food[i]]) {
      assert.ok(Number.isFinite(v) && v >= 0, `${label}: bad value ${v} at cell ${i}`);
    }
    assert.ok(w.food[i] <= w.foodCap[i] + 1e-3, `${label}: food over cap at ${i}`);
    const o = w.owner[i];
    if (o === 0) {
      assert.equal(p, 0, `${label}: unowned cell ${i} has people`);
    } else {
      assert.ok(p >= MIN_CELL_POP, `${label}: owned cell ${i} is empty`);
      assert.notEqual(w.terrain[i], WATER, `${label}: civ on water at ${i}`);
      assert.ok(o < sim.civs.length, `${label}: owner id ${o} out of range`);
      pop[o] += p;
      cells[o]++;
    }
  }
  for (let c = 1; c < sim.civs.length; c++) {
    assert.equal(sim.civs[c].territory, cells[c], `${label}: territory count for civ ${c}`);
    assert.ok(Math.abs(sim.civs[c].pop - pop[c]) <= 1e-6 * Math.max(1, pop[c]), `${label}: pop sum for civ ${c}`);
  }
}

test('state stays valid over a long run', () => {
  const sim = new Simulation({ seed: 'invariants', width: 70, height: 70 });
  checkWorld(sim, 'start');
  for (let k = 0; k < 10; k++) {
    sim.tick(100);
    checkWorld(sim, `year ${sim.tickCount}`);
  }
});

test('civs start with their population and grow from it', () => {
  const sim = new Simulation({ seed: 'growth', startPop: 300 });
  for (const c of sim.civs.slice(1)) assert.ok(Math.abs(c.pop - 300) < 1e-3);
  sim.tick(300);
  const grown = sim.civs.slice(1).filter((c) => c.pop > 600 && c.territory > 9).length;
  assert.ok(grown >= sim.civs.length - 2, 'most civs grow and expand on default settings');
});

test('a starving civ shrinks', () => {
  const sim = new Simulation({ seed: 'famine', abundance: 0.2, startPop: 5000, civs: ['isolationist'] });
  const start = sim.civs[1].pop;
  sim.tick(10);
  assert.ok(sim.civs[1].pop < start * 0.7, `pop ${sim.civs[1].pop} from ${start}`);
});

test('end conditions stop the sim', () => {
  const byTicks = new Simulation({ seed: 'end', endCondition: 'ticks', endTicks: 25, width: 40, height: 40 });
  assert.equal(byTicks.tick(100), 25);
  assert.ok(byTicks.finished);
  assert.match(byTicks.endReason, /25/);

  const dead = new Simulation({ seed: 'end', abundance: 0.2, startPop: 10, civs: ['aggressive'], terrainMix: { water: 0, desert: 0.9, plains: 0.1, fertile: 0, mountain: 0 } });
  dead.tick(2000);
  if (dead.finished) assert.match(dead.endReason, /died out/);
});

test('inspect reports a cell and rejects out-of-range coordinates', () => {
  const sim = new Simulation({ seed: 'inspect', width: 30, height: 20 });
  assert.equal(sim.inspect(-1, 0), null);
  assert.equal(sim.inspect(30, 0), null);
  const cell = sim.inspect(5, 5);
  assert.equal(cell.x, 5);
  assert.ok(['water', 'desert', 'plains', 'fertile', 'mountain'].includes(cell.terrain));
});
