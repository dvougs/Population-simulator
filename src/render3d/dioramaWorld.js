// The 3D world as three.js meshes (RULES.md "Feature flags"), shared by the
// home page's world (homeScene3d.js) and the game's 3D map (renderer3d.js):
// hex tiles standing by terrain and elevation on a dark base, trees, peaks,
// rivers, settled land tinted in its civ's colour, homes and towers by
// settlement tier, buildings and wonders as monuments, and a few people per
// settled hex. The seasons tint the land (seasons.js), and at night windows,
// tents and towers glow where people live. A civ still at level 1 (Foragers)
// lives in round thatched huts, lit at night by a bonfire, not windows. Each kind of thing is one instanced mesh, so the whole world is
// about a dozen draw calls whatever the map size.
//
// The world knows nothing of cameras or lights: its owner places it (place(),
// with how far each tile has risen) and draws it.

import { hexCentre, riverSegments, HEX_SIZE } from '../render/layout.js';
import { rgbToHex, RIVER_RGB } from '../render/palette.js';
import { civStyle } from '../render/civStyle.js';
import { hexTotal, largestCiv } from '../render/peopleMaths.js';
import { DEEP_WATER, FOREST, MOUNTAIN } from '../sim/terrain.js';
import { seasonRgb, SNOW_RGB } from './seasons.js';
import { tileHeight, homesFor, HOME_SLOTS, MONUMENT_SLOT, MAX_HOMES, TILE_BASE, boardBounds } from './diorama.js';

const GROW_MS = 380; // a new home growing out of the ground
const TREE_SLOTS = [[-0.35, -0.2], [0.3, -0.3], [0.05, 0.35], [-0.4, 0.3], [0.42, 0.18]];
export const PAWNS_PER_HEX = 4;
const STONE = 0xe9dfcb;
const TRUNK_GREEN = 0x2f6b3a;
const PEAK = 0x8d8a86;
const SNOW = 0xf4f7fb;
const GOLD = 0xf2c14e;
const BASE = 0x0a1422;
const FLAT = 0.002; // a flat tile's top, just above the base
const WINDOW = 0xffc46b;
const HALO = 0xff9d42;
const TREE_SNOW = 0.4; // how white the pines turn at full snow
const THATCH = 0xb08a4e;
const MUD = 0xa58660;
const FIRE = 0xff8a2a;

const easeOut = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - (1 - t) * (1 - t) * (1 - t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function buildGeometries(T) {
  const up = (g, y) => { g.translate(0, y, 0); return g; };
  // Tiles are unit-tall prisms standing on y = 0, scaled to height per tile; pointy ends north and south as on the 2D map.
  const tile = up(new T.CylinderGeometry(0.965, 0.965, 1, 6), 0.5);
  const base = up(new T.CylinderGeometry(1, 1, 1, 6), 0.5);
  const tree = up(new T.ConeGeometry(0.15, 0.42, 5), 0.21);
  const peak = up(new T.ConeGeometry(0.56, 0.62, 5), 0.31);
  const snow = up(new T.ConeGeometry(0.2, 0.22, 5), 0.11);
  const wall = up(new T.BoxGeometry(0.3, 0.26, 0.28), 0.13);
  const roof = up(new T.ConeGeometry(0.27, 0.22, 4), 0.11);
  roof.rotateY(Math.PI / 4);
  const tent = up(new T.ConeGeometry(0.22, 0.32, 6), 0.16);
  const tower = up(new T.CylinderGeometry(0.1, 0.12, 0.52, 6), 0.26);
  const spire = up(new T.ConeGeometry(0.14, 0.22, 6), 0.11);
  const step = up(new T.BoxGeometry(1, 1, 1), 0.5);
  const river = new T.BoxGeometry(1, 1, 1);
  const pawn = up(new T.CylinderGeometry(0.045, 0.065, 0.16, 6), 0.08);
  // A lit window on a home's front, and the warm pool of light round a lived-in hex at night.
  const pane = up(new T.BoxGeometry(0.15, 0.11, 0.02), 0.055);
  const halo = new T.CircleGeometry(0.9, 6, Math.PI / 6);
  halo.rotateX(-Math.PI / 2);
  // A forager's hut: a low round mud wall under a steep thatch cone; and the bonfire between the huts.
  const hut = up(new T.CylinderGeometry(0.13, 0.14, 0.12, 7), 0.06);
  const thatch = up(new T.ConeGeometry(0.19, 0.22, 7), 0.11);
  const fire = up(new T.OctahedronGeometry(0.06, 0), 0.06);
  return { tile, base, tree, peak, snow, wall, roof, tent, tower, spire, step, river, pawn, pane, halo, hut, thatch, fire };
}

export class DioramaWorld {
  /** T: the three.js module; shadows: whether meshes cast and take shadows. */
  constructor(T, { shadows = true } = {}) {
    this.T = T;
    this.shadows = shadows;
    this.geo = buildGeometries(T);
    this.root = null;
    this.meshes = [];
    this.map = null;
    this.tiles = null;
    this.show = null;
    this.tmp = { o: new T.Object3D(), c: new T.Color(), civ: new T.Color(), rgb: [0, 0, 0] };
    /** The seasons' look (seasons.seasonLook), or null for plain terrain colours. */
    this.look = null;
  }

  /** Build the meshes for a map (colours: palette.hexColours(map)); returns the Group to add to a scene. */
  build(map, colours) {
    const { T } = this;
    this.dispose();
    this.map = map;
    const n = map.cols * map.rows;
    const b = boardBounds(map.cols, map.rows);
    this.board = b;
    const root = new T.Group();
    this.root = root;
    const mat = (opts = {}) => new T.MeshLambertMaterial({ flatShading: true, ...opts });
    const mesh = (geo, count, material, cast = true) => {
      const m = new T.InstancedMesh(geo, material, Math.max(1, count));
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.castShadow = cast && this.shadows;
      m.receiveShadow = this.shadows;
      m.count = 0;
      m.frustumCulled = false;
      root.add(m);
      this.meshes.push(m);
      return m;
    };
    const white = mat();
    const g = this.geo;
    let forests = 0; let peaks = 0;
    for (let i = 0; i < n; i++) { if (map.terrain[i] === FOREST) forests++; if (map.terrain[i] === MOUNTAIN) peaks++; }
    const rivers = riverSegments(map);
    this.m = {
      base: mesh(g.base, n, mat({ color: BASE }), false),
      tile: mesh(g.tile, n, white),
      tree: mesh(g.tree, forests * TREE_SLOTS.length, mat({ color: TRUNK_GREEN })),
      peak: mesh(g.peak, peaks, mat({ color: PEAK })),
      snow: mesh(g.snow, peaks, mat({ color: SNOW }), false),
      river: mesh(g.river, rivers.length, mat({ color: rgbToHex(RIVER_RGB) }), false),
      wall: mesh(g.wall, n * MAX_HOMES, white),
      roof: mesh(g.roof, n * MAX_HOMES, white),
      tent: mesh(g.tent, n, white),
      tower: mesh(g.tower, n, mat({ color: STONE })),
      spire: mesh(g.spire, n, white),
      step: mesh(g.step, n * 3, white),
      pawn: mesh(g.pawn, n * PAWNS_PER_HEX, white, false),
      pane: mesh(g.pane, n * (MAX_HOMES + 2), new T.MeshBasicMaterial({ color: WINDOW, transparent: true, opacity: 0, depthWrite: false }), false),
      hut: mesh(g.hut, n * MAX_HOMES, mat({ color: MUD })),
      thatch: mesh(g.thatch, n * MAX_HOMES, white),
      fire: mesh(g.fire, n, new T.MeshBasicMaterial({ color: FIRE, transparent: true, opacity: 0, depthWrite: false }), false),
      halo: mesh(g.halo, n, new T.MeshBasicMaterial({ color: HALO, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }), false),
    };
    this.m.pane.receiveShadow = false; this.m.halo.receiveShadow = false;
    this.m.pane.visible = false; this.m.halo.visible = false; this.m.fire.visible = false;
    this.treeRgb = new T.Color(TRUNK_GREEN);

    // Per-tile facts that never change for this map.
    const cx = new Float32Array(n); const cz = new Float32Array(n);
    const top = new Float32Array(n); const dist = new Float32Array(n);
    let far = 0;
    for (let i = 0; i < n; i++) {
      const c = hexCentre(map.cols, i);
      cx[i] = c.x / HEX_SIZE; cz[i] = c.y / HEX_SIZE;
      top[i] = tileHeight(map.terrain[i], map.elevation?.[i]);
      const dx = cx[i] - b.cx; const dz = cz[i] - b.cz;
      dist[i] = Math.sqrt(dx * dx + dz * dz);
      if (dist[i] > far) far = dist[i];
    }
    for (let i = 0; i < n; i++) dist[i] = far > 0 ? dist[i] / far : 0;
    this.tiles = { n, cx, cz, top, dist, rise: new Float32Array(n).fill(-1), colours };
    this.rivers = rivers.map(([x0, y0, x1, y1]) => {
      const a = { x: x0 / HEX_SIZE, z: y0 / HEX_SIZE }; const e = { x: x1 / HEX_SIZE, z: y1 / HEX_SIZE };
      return { a, e, len: Math.hypot(e.x - a.x, e.z - a.z), yaw: Math.atan2(e.z - a.z, e.x - a.x), hex: this.nearestHex(a.x, a.z) };
    });
    this.homes = { shown: new Int8Array(n), grownAt: new Float32Array(n).fill(-1e9) };
    this.show = null;
    this.paintTiles(null);
    return root;
  }

  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); m.dispose(); }
    this.meshes = [];
    this.root?.removeFromParent();
    this.root = null;
  }

  /** Index of the hex whose centre is nearest board point (x, z). */
  nearestHex(x, z) {
    const { cx, cz, n } = this.tiles;
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = cx[i] - x; const dz = cz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Top of tile i at full rise (hex radii). */
  topOf(i) { return this.tiles.top[i]; }

  /** Tile colours: terrain colour in this season, with a little of the civ's colour where a civ lives (civ per hex, or null). */
  paintTiles(civOf) {
    const { c, rgb } = this.tmp;
    const { n, colours } = this.tiles;
    const { terrain } = this.map;
    for (let i = 0; i < n; i++) {
      const [r, g, bl] = this.look ? seasonRgb(terrain[i], colours[i], this.look, rgb) : colours[i];
      let rr = r; let gg = g; let bb = bl;
      const civ = civOf ? civOf[i] : -1;
      if (civ >= 0) {
        const [sr, sg, sb] = civStyle(civ).rgb;
        rr = r * 0.74 + sr * 0.26; gg = g * 0.74 + sg * 0.26; bb = bl * 0.74 + sb * 0.26;
      }
      this.m.tile.setColorAt(i, c.setRGB(rr / 255, gg / 255, bb / 255, this.T.SRGBColorSpace));
    }
    this.m.tile.instanceColor.needsUpdate = true;
  }

  /** Show the seasons' look (seasons.seasonLook): repaints the land and the trees. */
  setLook(look) {
    if (!this.tiles) return;
    this.look = look;
    this.paintTiles(this.show ? this.show.civ : null);
    const w = (look?.snow ?? 0) * TREE_SNOW;
    this.m.tree.material.color.setHex(TRUNK_GREEN).lerp(this.tmp.c.setRGB(SNOW_RGB[0] / 255, SNOW_RGB[1] / 255, SNOW_RGB[2] / 255, this.T.SRGBColorSpace), w);
  }

  /** How strongly the lights where people live glow (0 by day to 1 at night). */
  setGlow(glow) {
    if (!this.m) return;
    const on = glow > 0.01;
    this.m.pane.visible = on; this.m.halo.visible = on; this.m.fire.visible = on;
    this.m.pane.material.opacity = glow;
    this.m.fire.material.opacity = glow;
    this.m.halo.material.opacity = 0.5 * glow;
  }

  /** A new year: { pop, settlements, buildings, levels } (levels: each civ's level, 1 to 5) (SimHost data); `t` is the scene clock (seconds), for homes growing in. */
  setYear({ pop, settlements, buildings, levels }, t = 0) {
    if (!this.tiles || !pop) return;
    const { map } = this;
    const { n } = this.tiles;
    const civs = pop.civs; const counts = pop.hexCivPop;
    const show = this.show ??= {
      civ: new Int8Array(n), people: new Int32Array(n), homes: new Int8Array(n),
      tents: new Uint8Array(n), tower: new Uint8Array(n), monument: new Int8Array(n), huts: new Uint8Array(n),
    };
    show.monument.fill(-1);
    for (const bd of buildings ?? []) {
      if (bd.hex < 0 || bd.hex >= n) continue;
      if (bd.status === 'standing') show.monument[bd.hex] = bd.kind === 'wonder' ? 1 : 0;
      else if (bd.kind === 'wonder' && bd.status === 'abandoned') show.monument[bd.hex] = 2;
    }
    for (let i = 0; i < n; i++) {
      const water = map.terrain[i] === DEEP_WATER;
      const people = water ? 0 : hexTotal(counts, civs, i);
      const holder = settlements?.holder?.[i] ?? -1;
      const civ = holder >= 0 ? holder : people > 0 ? largestCiv(counts, civs, i) : -1;
      const tier = water ? -1 : settlements?.tier?.[i] ?? -1;
      const h = water || civ < 0 ? { homes: 0, tents: false, tower: false } : homesFor(tier, people);
      if (h.homes > this.homes.shown[i]) this.homes.grownAt[i] = t;
      this.homes.shown[i] = h.homes;
      show.civ[i] = civ; show.people[i] = people; show.homes[i] = h.homes;
      show.tents[i] = h.tents ? 1 : 0; show.tower[i] = h.tower ? 1 : 0;
      show.huts[i] = civ >= 0 && (levels?.[civ] ?? 2) <= 1 ? 1 : 0;
    }
    this.paintTiles(show.civ);
  }

  /**
   * Put every instance where it stands. riseOf(i) says how far tile i has risen
   * (0 flat to 1 full height); t is the scene clock in seconds; still stops the
   * walkers and the homes growing in.
   */
  place(riseOf, t = 0, still = true) {
    if (!this.tiles) return;
    const { o } = this.tmp;
    const { n, cx, cz, top, rise } = this.tiles;
    const { map } = this;
    const m = this.m;
    const put = (mesh, k, x, y, z, sx, sy, sz, ry = 0) => {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
    };
    let trees = 0; let peaks = 0;
    for (let i = 0; i < n; i++) {
      const r = riseOf(i);
      rise[i] = r;
      const h = FLAT + (top[i] - FLAT) * r;
      put(m.base, i, cx[i], -TILE_BASE - 0.06, cz[i], 1, TILE_BASE + 0.03, 1);
      put(m.tile, i, cx[i], -TILE_BASE, cz[i], 1, TILE_BASE + h, 1);
      const terrain = map.terrain[i];
      if (terrain === FOREST) {
        for (let k = 0; k < TREE_SLOTS.length; k++) {
          const [ox, oz] = TREE_SLOTS[k];
          const s = r * (0.85 + 0.3 * (((i * 7 + k * 3) % 5) / 4));
          put(m.tree, trees++, cx[i] + ox, h, cz[i] + oz, s, s, s);
        }
      } else if (terrain === MOUNTAIN) {
        put(m.peak, peaks, cx[i], h - 0.02, cz[i], 1, r, 1, i * 0.7);
        put(m.snow, peaks++, cx[i], h + 0.62 * r - 0.21 * r, cz[i], r, r, r, i * 0.7);
      }
    }
    m.base.count = n; m.tile.count = n;
    m.tree.count = trees; m.peak.count = peaks; m.snow.count = peaks;
    let k = 0;
    for (const rv of this.rivers) {
      const i = rv.hex;
      const y = (i >= 0 ? FLAT + (top[i] - FLAT) * rise[i] : FLAT) + 0.004;
      put(m.river, k++, (rv.a.x + rv.e.x) / 2, y, (rv.a.z + rv.e.z) / 2, rv.len, 0.02, 0.2, -rv.yaw);
    }
    m.river.count = k;
    this.placeSettled(put, t, still);
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  placeSettled(put, t, still) {
    const { show, m } = this;
    if (!show) { for (const key of ['wall', 'roof', 'tent', 'tower', 'spire', 'step', 'pawn', 'pane', 'halo', 'hut', 'thatch', 'fire']) m[key].count = 0; return; }
    const { c } = this.tmp;
    const { n, cx, cz, top, rise } = this.tiles;
    const T = this.T;
    let walls = 0; let tents = 0; let towers = 0; let steps = 0; let pawns = 0; let panes = 0; let halos = 0; let huts = 0; let fires = 0;
    // A pane on the front of a thing at (x, z) turned ry, `d` out from its middle and `y` up.
    const pane = (x, y, z, d, ry, sc) => put(m.pane, panes++, x + Math.sin(ry) * d * sc, y, z + Math.cos(ry) * d * sc, sc, sc, sc, ry);
    const tint = (mesh, idx, civ, dim = 1) => {
      const [r, g, b] = civStyle(civ).rgb;
      mesh.setColorAt(idx, c.setRGB((r * dim) / 255, (g * dim) / 255, (b * dim) / 255, T.SRGBColorSpace));
    };
    for (let i = 0; i < n; i++) {
      const civ = show.civ[i];
      const r = rise[i];
      // Homes and people come up after their tile: they grow over the last part of its rise.
      const g = clamp01((r - 0.55) / 0.45);
      if (g <= 0) continue;
      const h = FLAT + (top[i] - FLAT) * r;
      const x = cx[i]; const z = cz[i];
      if (show.monument[i] >= 0) {
        const wonder = show.monument[i] >= 1;
        const sizes = wonder ? [0.5, 0.36, 0.22] : [0.3, 0.2];
        const hs = wonder ? 0.11 : 0.12;
        let y = h;
        for (let s = 0; s < sizes.length; s++) {
          put(m.step, steps, x + MONUMENT_SLOT[0], y, z + MONUMENT_SLOT[1], sizes[s], hs * g, sizes[s]);
          m.step.setColorAt(steps++, c.setHex(show.monument[i] === 2 ? 0x9a948a : s === sizes.length - 1 ? GOLD : STONE));
          y += hs * g;
        }
      }
      if (civ < 0) continue;
      // Lights only where people live.
      const lit = show.people[i] > 0;
      if (lit) {
        const sz = 0.55 + 0.1 * Math.min(4, show.homes[i] / 4);
        put(m.halo, halos++, x, h + 0.01, z, sz * g, 1, sz * g);
      }
      // Foragers light a bonfire among their huts or tents, not windows.
      const fireLit = lit && show.huts[i];
      if (fireLit) put(m.fire, fires++, x, h, z + 0.12, g, g, g);
      if (show.tents[i]) {
        put(m.tent, tents, x + HOME_SLOTS[0][0], h, z + HOME_SLOTS[0][1], g, g, g);
        if (lit && !fireLit) pane(x + HOME_SLOTS[0][0], h + 0.02 * g, z + HOME_SLOTS[0][1], 0.15, 0, g);
      } else if (show.huts[i]) {
        const homes = show.homes[i];
        for (let s = 0; s < homes; s++) {
          const newest = s === homes - 1;
          const grow = newest && !still ? easeOut((t - this.homes.grownAt[i]) / (GROW_MS / 1000)) : 1;
          const sc = g * grow * (0.9 + 0.12 * (((i + s * 5) % 4) / 3));
          const [ox, oz] = HOME_SLOTS[s];
          put(m.hut, huts, x + ox, h, z + oz, sc, sc, sc);
          put(m.thatch, huts, x + ox, h + 0.1 * sc, z + oz, sc, sc, sc);
          m.thatch.setColorAt(huts++, c.setHex(THATCH).lerp(this.tmp.civ.setRGB(...civStyle(civ).rgb.map((v) => v / 255), T.SRGBColorSpace), 0.3));
        }
        tint(m.tent, tents++, civ);
      } else {
        const homes = show.homes[i];
        for (let s = 0; s < homes; s++) {
          // The newest home grows out of the ground.
          const newest = s === homes - 1;
          const grow = newest && !still ? easeOut((t - this.homes.grownAt[i]) / (GROW_MS / 1000)) : 1;
          const sc = g * grow * (0.9 + 0.12 * (((i + s * 5) % 4) / 3));
          const [ox, oz] = HOME_SLOTS[s];
          const ry = ((i * 3 + s) % 4) * 0.35;
          put(m.wall, walls, x + ox, h, z + oz, sc, sc, sc, ry);
          m.wall.setColorAt(walls, c.setHex(STONE));
          put(m.roof, walls, x + ox, h + 0.26 * sc, z + oz, sc, sc, sc, ry);
          tint(m.roof, walls++, civ);
          if (lit) pane(x + ox, h + 0.07 * sc, z + oz, 0.145, ry, sc);
        }
        if (show.tower[i]) {
          const tx = show.monument[i] >= 0 ? x + 0.1 : x;
          const tz = show.monument[i] >= 0 ? z - 0.52 : z;
          put(m.tower, towers, tx, h, tz, g, g, g);
          put(m.spire, towers, tx, h + 0.52 * g, tz, g, g, g);
          tint(m.spire, towers++, civ);
          if (lit) pane(tx, h + 0.32 * g, tz, 0.115, 0, g);
        }
      }
      // A few people walk round the hex (one per 8, up to 4), on render time only.
      const walkers = Math.min(PAWNS_PER_HEX, Math.ceil(show.people[i] / 8));
      for (let p = 0; p < walkers; p++) {
        const a = (i * 2.399 + p * 1.571) + (still ? 0 : t * (0.25 + 0.06 * p) * (p % 2 ? -1 : 1));
        const rad = 0.5 + 0.08 * p;
        put(m.pawn, pawns, x + rad * Math.cos(a), h, z + rad * Math.sin(a), g, g, g);
        tint(m.pawn, pawns++, civ, 0.85);
      }
    }
    m.wall.count = walls; m.roof.count = walls; m.tent.count = tents;
    m.tower.count = towers; m.spire.count = towers; m.step.count = steps; m.pawn.count = pawns;
    m.pane.count = panes; m.halo.count = halos; m.hut.count = huts; m.thatch.count = huts; m.fire.count = fires;
    for (const mesh of [m.wall, m.roof, m.tent, m.spire, m.step, m.pawn, m.thatch]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Whether homes are still growing in at scene time t (so the owner keeps drawing). */
  growing(t) {
    if (!this.homes) return false;
    const g = this.homes.grownAt;
    for (let i = 0; i < g.length; i++) if (t - g[i] < GROW_MS / 1000) return true;
    return false;
  }
}
