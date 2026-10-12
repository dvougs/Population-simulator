// Inside a hex (src/render3d/hexWorld.js, dayNight.js), against RULES.md "Feature flags".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutHex, inHex, HEX_R, HOMES_BY_TIER, TOWERS_BY_TIER, MAX_WALKERS, PLAZA_LEVEL, LAMP_LEVEL, LAMPS, MODEL_SCALE, MAX_TENTS, PEOPLE_PER_TENT, NATURE,
} from '../../src/render3d/hexWorld.js';
import { daylight, partOfDay, DAY_S, NIGHT_S, TWILIGHT_S } from '../../src/render3d/dayNight.js';

const hexOf = (over = {}) => ({
  index: 37, terrain: 'plains', water: false, river: false, people: 0, peopleByCiv: [0, 0, 0, 0], settlement: null, buildings: [], ...over,
});
const town = (tier, people = 40, holder = 1) => hexOf({
  people, peopleByCiv: [0, people, 0, 0], settlement: { tier, holder, name: 'X', buildings: [] },
});

test('the same hex in the same state looks the same every visit', () => {
  assert.deepEqual(layoutHex(town(2)), layoutHex(town(2)));
  assert.notDeepEqual(layoutHex(town(2)).homes, layoutHex({ ...town(2), index: 38 }).homes);
});

test('homes and towers follow the settlement tier', () => {
  for (let tier = 0; tier < HOMES_BY_TIER.length; tier++) {
    const L = layoutHex(town(tier));
    assert.equal(L.homes.length, HOMES_BY_TIER[tier], `tier ${tier} homes`);
    assert.equal(L.towers.length, TOWERS_BY_TIER[tier], `tier ${tier} towers`);
    assert.equal(L.wall, 0, 'no wall without palisade or stone walls');
    assert.ok(L.homes.every((h) => h.civ === 1 && !h.tent));
  }
});

test('people with no settlement camp in tents, one per 5 up to 6', () => {
  for (const people of [1, 5, 6, 12, 200]) {
    const L = layoutHex(hexOf({ people, peopleByCiv: [people, 0, 0, 0] }));
    assert.equal(L.homes.length, Math.min(MAX_TENTS, Math.ceil(people / PEOPLE_PER_TENT)));
    assert.ok(L.homes.every((h) => h.tent));
  }
});

test('an empty hex is only nature, unlit, and water shows nothing standing', () => {
  const L = layoutHex(hexOf({ terrain: 'forest' }));
  assert.equal(L.homes.length, 0);
  assert.equal(L.walkers.length, 0);
  assert.equal(L.lit, false);
  assert.equal(L.nature.length, NATURE.forest.count);
  const sea = layoutHex(hexOf({ terrain: 'deepWater', water: true }));
  assert.equal(sea.nature.length + sea.homes.length + sea.walkers.length, 0);
});

test('everything stands inside the hex without overlapping', () => {
  const L = layoutHex(town(5, 500));
  const things = [...L.homes, ...L.towers, ...L.nature, ...L.fields];
  for (const t of things) assert.ok(inHex(t.x, t.z, HEX_R), `${t.x}, ${t.z}`);
  for (let a = 0; a < L.homes.length; a++) {
    for (let b = a + 1; b < L.homes.length; b++) {
      assert.ok(Math.hypot(L.homes[a].x - L.homes[b].x, L.homes[a].z - L.homes[b].z) > 0.5);
    }
  }
});

test('people walk about by civ, up to 48; two civs here means war, each side on its half', () => {
  assert.equal(layoutHex(town(1, 500)).walkers.length, MAX_WALKERS);
  const war = layoutHex(hexOf({ people: 20, peopleByCiv: [12, 8, 0, 0] }));
  assert.equal(war.war, true);
  assert.equal(war.walkers.length, 20);
  const a = war.walkers.filter((w) => w.civ === 0); const b = war.walkers.filter((w) => w.civ === 1);
  assert.equal(a.length, 12);
  assert.ok(a.reduce((s, w) => s + w.x, 0) / a.length < b.reduce((s, w) => s + w.x, 0) / b.length);
  assert.equal(layoutHex(town(1)).war, false);
});

test('children under 15 are drawn small', () => {
  const L = layoutHex(town(0, 3), [{ age: 4 }, { age: 30 }, { age: 14 }]);
  assert.deepEqual(L.walkers.map((w) => w.child), [true, false, true]);
});

test('windows light up at night only where people live', () => {
  assert.equal(layoutHex(town(2, 10)).lit, true);
  assert.equal(layoutHex({ ...town(2, 0), peopleByCiv: [0, 0, 0, 0] }).lit, false);
});

test('every building and wonder here stands as its own model, none overlapping, sites by their progress', () => {
  const L = layoutHex(hexOf({
    people: 5, peopleByCiv: [5, 0, 0, 0],
    buildings: [{ kind: 'wonder', id: 'sunCircle', status: 'standing', civ: 0 }, { kind: 'building', id: 'forge', status: 'building', work: 20, years: 80, civ: 0 },
      { kind: 'wonder', id: 'greatWall', status: 'abandoned', civ: -1 }],
  }));
  assert.deepEqual(L.structures.map((m) => m.id).sort(), ['forge', 'greatWall', 'sunCircle']);
  assert.equal(L.structures.find((m) => m.id === 'forge').progress, 0.25);
  assert.equal(L.structures.find((m) => m.id === 'greatWall').civ, -1);
  assert.equal(L.structures[0].s, MODEL_SCALE);
});

test('a big city with every kind of building still stands every one of them, shrinking them if it must', () => {
  const ids = ['granary', 'woodcutter', 'quarry', 'clayPit', 'mine', 'deepMine', 'warehouse', 'market', 'shrine', 'school', 'library', 'palace', 'irrigation'];
  const hex = hexOf({
    terrain: 'coast', people: 200, peopleByCiv: [0, 200, 0, 0], level: 5,
    settlement: { tier: 5, holder: 1, name: 'X', buildings: [...ids, 'stoneWalls', 'houses', 'fishingDock'].map((id) => ({ id, status: 'standing' })) },
    buildings: [{ kind: 'wonder', id: 'grandLibrary', status: 'standing', civ: 1 }, { kind: 'wonder', id: 'hangingGardens', status: 'standing', civ: 1 },
      { kind: 'building', id: 'citadel', status: 'standing', civ: 1 }, { kind: 'building', id: 'senate', status: 'building', work: 5, years: 120, civ: 1 }],
  });
  const L = layoutHex(hex);
  assert.deepEqual(L.structures.map((m) => m.id).sort(), [...ids, 'citadel', 'grandLibrary', 'hangingGardens', 'senate'].sort());
  assert.ok(L.dock);
  assert.equal(L.wallKind, 'stone');
  assert.ok(L.wall > 0);
  const all = L.structures;
  for (let a = 0; a < all.length; a++) {
    assert.ok(inHex(all[a].x, all[a].z, HEX_R - all[a].r), `${all[a].id} inside`);
    for (let b = a + 1; b < all.length; b++) assert.ok(Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z) >= all[a].r + all[b].r - 1e-9, `${all[a].id} / ${all[b].id}`);
  }
});

test('the look follows the civ level: a square from level 3, lamps from level 4; palisade or stone walls ring it', () => {
  const at = (level, walls) => layoutHex({ ...town(2), level, settlement: { tier: 2, holder: 1, name: 'X', buildings: walls ? [{ id: walls, status: 'standing' }] : [] } });
  assert.equal(at(2).plaza, 0);
  assert.ok(at(PLAZA_LEVEL).plaza > 0);
  assert.equal(at(PLAZA_LEVEL).lamps.length, 0);
  assert.equal(at(LAMP_LEVEL).lamps.length, LAMPS);
  assert.equal(at(2, 'palisade').wallKind, 'wood');
  assert.equal(at(2, 'stoneWalls').wallKind, 'stone');
  assert.equal(at(2).wallKind, null);
});

test('a day and a night last 30 seconds each, with smooth dusk and dawn', () => {
  assert.equal(DAY_S, 30); assert.equal(NIGHT_S, 30);
  assert.equal(daylight(10), 1);
  assert.equal(daylight(45), 0);
  assert.equal(daylight(DAY_S), 0.5);
  assert.equal(daylight(DAY_S + NIGHT_S), 0.5);
  assert.equal(daylight(130), daylight(10)); // the clock repeats every minute
  // No jumps: the light changes by little from one frame to the next.
  for (let t = 0; t < 60; t += 1 / 60) assert.ok(Math.abs(daylight(t + 1 / 60) - daylight(t)) < 0.01, `t ${t}`);
  // Twilight takes its full length.
  assert.ok(daylight(DAY_S - TWILIGHT_S / 2 + 0.5) < 1 && daylight(DAY_S + TWILIGHT_S / 2 - 0.5) > 0);
  assert.deepEqual([2, 10, 30, 45, 59].map(partOfDay), ['dawn', 'day', 'dusk', 'night', 'dawn']);
});

test('at level 1 (Foragers) homes are huts round a bonfire, from level 2 houses with windows', () => {
  const foragers = layoutHex({ ...town(1, 20), level: 1 });
  assert.equal(foragers.huts, true);
  assert.ok(foragers.fire);
  assert.ok(inHex(foragers.fire.x, foragers.fire.z));
  for (const h of foragers.homes) assert.ok(Math.hypot(h.x - foragers.fire.x, h.z - foragers.fire.z) >= 0.9 + 0.75 - 1e-9);
  const farmers = layoutHex({ ...town(1, 20), level: 2 });
  assert.equal(farmers.huts, false);
  assert.equal(farmers.fire, null);
  // Nobody home, no fire.
  assert.equal(layoutHex({ ...town(1, 0), peopleByCiv: [0, 0, 0, 0], level: 1 }).fire, null);
});
