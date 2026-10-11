// Pure helpers of the renderer, checked against RULES.md "Terrain colours" and
// "How civs and people look". These modules load in Node (peopleLayer imports
// the vendored PixiJS, which only touches the DOM when a layer is built).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERRAIN_RGB, LAKE_RGB, RIVER_RGB, SHADE, hexColours, hexRgb } from '../../src/render/palette.js';
import { CIV_STYLES, EMBLEM_SHAPES, EMBLEM_ORDER, civStyle, emblemSvg } from '../../src/render/civStyle.js';
import { PEOPLE_ZOOM_PX, peopleShown, shortCount, hexTotal, largestCiv } from '../../src/render/peopleLayer.js';
import { Renderer } from '../../src/render/renderer.js';
import { Simulation } from '../../src/sim/simulation.js';
import { HEX_SIZE } from '../../src/render/layout.js';
import { createMap, generateMap } from '../../src/sim/mapgen.js';
import { DEEP_WATER, COAST, PLAINS, FOREST, HILLS, MOUNTAIN, DESERT, TUNDRA } from '../../src/sim/terrain.js';

const RULES = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');

/** Rows of the first markdown table after a heading. */
function table(heading) {
  const start = RULES.indexOf(heading);
  assert.ok(start >= 0, heading);
  const lines = RULES.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let k = first + 2; k < lines.length && lines[k].startsWith('|'); k++) {
    rows.push(lines[k].split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}
const rgbOf = (cell) => cell.match(/\d+/g).map(Number);

test('RULES.md "Terrain colours" table matches the palette', () => {
  const rows = Object.fromEntries(table('### Terrain colours').map(([name, rgb]) => [name, rgbOf(rgb)]));
  const byId = { Sea: DEEP_WATER, Coast: COAST, Plains: PLAINS, Forest: FOREST, Hills: HILLS, Mountain: MOUNTAIN, Desert: DESERT, Tundra: TUNDRA };
  for (const [name, id] of Object.entries(byId)) assert.deepEqual(TERRAIN_RGB[id], rows[name], name);
  assert.deepEqual(LAKE_RGB, rows.Lake);
  assert.deepEqual(RIVER_RGB, rows['River (line through the hex)']);
});

test('RULES.md "Terrain colours" shading numbers: land ±6%, water up to 25% darker', () => {
  assert.equal(SHADE.landShade, 0.06);
  assert.equal(SHADE.waterShade, 0.25);
});

const scaled = (rgb, f) => rgb.map((v) => Math.min(255, Math.round(v * f)));

test('shading: lowest land 6% darker, highest 6% lighter, the rest in proportion; water darker with depth', () => {
  // One row of hexes: sea at elevations -1, -0.5, 0; a lake at -0.2; land at 0.1 .. 0.9.
  const map = createMap(9, 1);
  const set = (i, t, e, lake = 0) => { map.terrain[i] = t; map.elevation[i] = e; map.lake[i] = lake; };
  set(0, DEEP_WATER, -1);
  set(1, DEEP_WATER, -0.5);
  set(2, DEEP_WATER, 0);
  set(3, DEEP_WATER, -0.25, 1);
  set(4, PLAINS, 0.1);
  set(5, PLAINS, 0.5);
  set(6, PLAINS, 0.9);
  set(7, FOREST, 0.3);
  set(8, COAST, 0.9);
  const c = hexColours(map);
  const sea = TERRAIN_RGB[DEEP_WATER];
  assert.deepEqual(c[0], scaled(sea, 0.75), 'lowest water: 25% darker');
  assert.deepEqual(c[1], scaled(sea, 0.875), 'half way: 12.5% darker');
  assert.deepEqual(c[2], sea, 'highest water keeps its colour');
  assert.deepEqual(c[3], scaled(LAKE_RGB, 1 - 0.25 * 0.25), 'lakes shade from the lake colour, ranked with all water');
  const plains = TERRAIN_RGB[PLAINS];
  assert.deepEqual(c[4], scaled(plains, 0.94), 'lowest land: 6% darker');
  assert.deepEqual(c[5], plains, 'middle land: unchanged');
  assert.deepEqual(c[6], scaled(plains, 1.06), 'highest land: 6% lighter');
  assert.deepEqual(c[7], scaled(TERRAIN_RGB[FOREST], 1 + 0.06 * (2 * 0.25 - 1)), 'a quarter of the way: 3% darker');
  assert.deepEqual(c[8], scaled(TERRAIN_RGB[COAST], 1.06));
  assert.deepEqual(hexRgb(map, 3), LAKE_RGB);
});

test('shading on generated maps: every channel stays within 0..255 and within the RULES.md bounds', () => {
  for (const seed of ['pangaea', 'islands', 'peaks']) {
    const map = generateMap({ seed, size: 24, water: 0.4 });
    const c = hexColours(map);
    let lightest = 0; let darkest = 2;
    for (let i = 0; i < map.count; i++) {
      const base = hexRgb(map, i);
      const water = map.terrain[i] === DEEP_WATER;
      for (let k = 0; k < 3; k++) {
        assert.ok(Number.isInteger(c[i][k]) && c[i][k] >= 0 && c[i][k] <= 255);
        const lo = Math.round(base[k] * (water ? 0.75 : 0.94));
        const hi = Math.min(255, Math.round(base[k] * (water ? 1 : 1.06)));
        assert.ok(c[i][k] >= lo && c[i][k] <= hi, `${seed} hex ${i} channel ${k}: ${c[i][k]} not in ${lo}..${hi}`);
      }
      if (!water) { const f = c[i][0] / base[0]; lightest = Math.max(lightest, f); darkest = Math.min(darkest, f); }
    }
    assert.ok(lightest > 1.04 && darkest < 0.96, `${seed}: land uses the full ±6% range (${darkest}..${lightest})`);
  }
});

test('RULES.md "How civs and people look": colours and emblems by civ number', () => {
  const rows = table('## How civs and people look');
  assert.equal(rows.length, 8);
  assert.equal(CIV_STYLES.length, 8);
  const emblemName = { 'upside-down triangle': 'down triangle' };
  rows.forEach(([civ, colour, emblem], k) => {
    assert.equal(civ, `Civ ${k + 1}`);
    const [name] = colour.split(' (');
    assert.equal(CIV_STYLES[k].colour, name, civ);
    assert.deepEqual(CIV_STYLES[k].rgb, rgbOf(colour), civ);
    assert.equal(CIV_STYLES[k].emblem, emblemName[emblem] ?? emblem, civ);
    assert.ok(EMBLEM_SHAPES[CIV_STYLES[k].emblem], `${civ} has a shape`);
    assert.equal(civStyle(k), CIV_STYLES[k]);
  });
  assert.equal(new Set(EMBLEM_ORDER).size, 8, 'every civ has its own emblem');
  assert.equal(new Set(CIV_STYLES.map((s) => s.rgb.join())).size, 8, 'and its own colour');
});

test('emblemSvg draws the civ colour with a dark outline', () => {
  for (let c = 0; c < 8; c++) {
    const svg = emblemSvg(c);
    const [r, g, b] = CIV_STYLES[c].rgb;
    assert.ok(svg.includes(`fill="rgb(${r} ${g} ${b})"`), svg);
    assert.match(svg, /stroke="#0b0e13"/);
    assert.match(svg, /aria-hidden="true"/);
  }
});

test('RULES.md: people are drawn once a hex is at least 200 px across (corner to corner)', () => {
  assert.equal(PEOPLE_ZOOM_PX, 200);
  assert.equal(HEX_SIZE, 32);
  // Corner to corner is 2 × HEX_SIZE = 64 world px.
  assert.equal(peopleShown(200 / 64), true, 'exactly 200 px');
  assert.equal(peopleShown(199.9 / 64), false, 'just under');
  assert.equal(peopleShown(4), true);
  assert.equal(peopleShown(165 / 64), false, 'the e2e zoom level stays zoomed out');
});

test('RULES.md: hex counts of 1000 or more are shortened (1.2k rounded down under 10000, then 46k, then 2M)', () => {
  assert.equal(shortCount(0), '0');
  assert.equal(shortCount(999), '999');
  assert.equal(shortCount(1000), '1k');
  assert.equal(shortCount(1234), '1.2k');
  assert.equal(shortCount(1299), '1.2k', 'rounded down');
  assert.equal(shortCount(9999), '9.9k', 'rounded down, never 10.0k');
  assert.equal(shortCount(10000), '10k');
  assert.equal(shortCount(45678), '46k');
  assert.equal(shortCount(45400), '45k');
  assert.equal(shortCount(1e6), '1M');
  assert.equal(shortCount(2e6), '2M');
  for (const n of [1, 999, 1000, 9999, 10000, 99999, 999499, 1e6, 5e8]) assert.ok(shortCount(n).length <= 4, `${n}: ${shortCount(n)}`);
});

test('RULES.md: a hex label counts the total people in the hex, all civs (hexCivPop[h × civs + c])', () => {
  // 3 hexes × 3 civs.
  const pop = Int32Array.from([
    0, 0, 0,
    5, 0, 7,
    1200, 300, 4,
  ]);
  assert.equal(hexTotal(pop, 3, 0), 0, 'empty hex');
  assert.equal(hexTotal(pop, 3, 1), 12);
  assert.equal(hexTotal(pop, 3, 2), 1504);
  assert.equal(shortCount(hexTotal(pop, 3, 2)), '1.5k');
  // The same numbers read with a different civ count land in different hexes: layout is hex-major.
  assert.equal(hexTotal(pop, 1, 4), 0);
  assert.equal(hexTotal(pop, 1, 5), 7);
  assert.equal(hexTotal(Int32Array.from([3]), 1, 0), 3, 'one civ');
});

test('RULES.md: a hex label shows its largest civ, the lower civ number on a tie, none (-1) for an empty hex', () => {
  const pop = Int32Array.from([
    0, 0, 0, 0, // empty
    0, 0, 9, 0, // single civ 2
    3, 8, 2, 8, // tie between 1 and 3 → 1
    6, 6, 6, 6, // all tie → 0
    0, 0, 1, 2, // largest is the last civ
    5, 0, 0, 4, // largest is civ 0
  ]);
  assert.equal(largestCiv(pop, 4, 0), -1);
  assert.equal(largestCiv(pop, 4, 1), 2);
  assert.equal(largestCiv(pop, 4, 2), 1);
  assert.equal(largestCiv(pop, 4, 3), 0);
  assert.equal(largestCiv(pop, 4, 4), 3);
  assert.equal(largestCiv(pop, 4, 5), 0);
  // Boundary: one more person breaks the tie towards the higher civ number.
  assert.equal(largestCiv(Int32Array.from([4, 5]), 2, 0), 1);
  assert.equal(largestCiv(Int32Array.from([5, 5]), 2, 0), 0);
  assert.equal(largestCiv(Int32Array.from([5, 4]), 2, 0), 0);
});

test('hex labels on a seeded run: totals add up to the population, largest civ holds the most people', () => {
  const sim = new Simulation({ seed: 'labels', size: 24 });
  for (let t = 0; t < 120; t++) sim.tick();
  const snap = sim.population();
  const { civs, hexCivPop } = snap;
  const hexes = hexCivPop.length / civs;
  assert.equal(hexes, 24 * 24);
  let alive = 0;
  for (let i = 0; i < snap.high; i++) alive += snap.alive[i] ? 1 : 0;
  let sum = 0;
  let labelled = 0;
  for (let h = 0; h < hexes; h++) {
    const total = hexTotal(hexCivPop, civs, h);
    sum += total;
    const best = largestCiv(hexCivPop, civs, h);
    if (total === 0) { assert.equal(best, -1, `hex ${h}`); continue; }
    labelled++;
    for (let c = 0; c < civs; c++) {
      const k = hexCivPop[h * civs + c];
      if (c < best) assert.ok(k < hexCivPop[h * civs + best], `hex ${h} civ ${c}`);
      else assert.ok(k <= hexCivPop[h * civs + best], `hex ${h} civ ${c}`);
    }
  }
  assert.ok(alive > 0 && labelled > 0, 'people alive after 120 years');
  assert.equal(sum, alive, 'hex totals add up to everyone alive');
});

test('RULES.md: while running, hex labels refresh at most every 0.4 seconds; a pan or tap redraw shows them at once', () => {
  // No canvas or window needed: needsFrame is pure timing logic.
  const r = new Renderer(null);
  r.map = {}; // a map is drawn; no shimmer, no people layer (zoomed-out labels only)
  assert.equal(r.needsFrame(1000), false, 'nothing changed');
  r.lastDraw = 1000;
  r.peopleDirty = true; // a new snapshot arrived just after a draw
  assert.equal(r.needsFrame(1000), false);
  assert.equal(r.needsFrame(1399), false, '0.399 s after the last draw: not yet');
  assert.equal(r.needsFrame(1400), true, 'exactly 0.4 s');
  assert.equal(r.needsFrame(1800), true);
  // A redraw for any other reason (pan, tap) resets the clock.
  r.lastDraw = 1500;
  assert.equal(r.needsFrame(1899), false);
  assert.equal(r.needsFrame(1900), true);
  // At most 2.5 label redraws a second however many snapshots arrive.
  let draws = 0;
  r.lastDraw = -Infinity;
  for (let now = 0; now < 10000; now += 16) {
    r.peopleDirty = true; // a snapshot every frame, as at 20x
    if (r.needsFrame(now)) { draws++; r.lastDraw = now; r.peopleDirty = false; }
  }
  assert.ok(draws <= 25, `${draws} redraws in 10 s`);
  assert.ok(draws >= 24, `${draws} redraws in 10 s: labels still refresh`);
});
