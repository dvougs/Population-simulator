// Inside a hex (RULES.md "Feature flags", Inside a hex): one hex of the
// running game as a small living world, drawn with three.js over the map while
// the game waits, paused. What stands there comes from hexWorld.js (homes by
// settlement size, towers, a wall, fields, monuments, trees and rocks by
// terrain, people by civ); this module draws it and keeps it alive on render
// time only: people walk, trees sway, the camera drifts round, and day turns
// to night and back on the dayNight.js clock, with lit windows at night where
// people live. At war (people of two civs here) each side keeps to its half,
// sparks fly where they meet and smoke rises.
//
// Drag turns the view, pinch or scroll zooms. With reduced motion nothing
// walks, sways or drifts and the entrance is instant; on a software renderer
// it draws at most a few frames a second.

import { loadThree, probeGl } from './threeLoad.js';
import { layoutHex, HEX_R } from './hexWorld.js';
import { daylight, arcAt, partOfDay } from './dayNight.js';
import { TERRAIN_RGB, RIVER_RGB, LAKE_RGB, rgbToHex } from '../render/palette.js';
import { civStyle } from '../render/civStyle.js';
import { TERRAIN_IDS } from '../sim/terrain.js';
import { seasonRgb, SNOW_RGB, AUTUMN_RGB, SPRING_RGB } from './seasons.js';
import { modelOf, SETTLEMENT_MODELS } from './buildingModels.js';
import { shapeGeometries, buildModel } from './modelMeshes.js';

const ENTER_MS = 1600;
const SOFT_FRAME_MS = 250;
const DIST = 24; const MIN_DIST = 9; const MAX_DIST = 42;
const PITCH = 0.72; // radians above the ground, once in
const SKY_DAY = 0x9fcfff; const SKY_NIGHT = 0x0a1328;
const STONE = 0xe9dfcb; const WOOD = 0x7a5232; const GOLD = 0xf2c14e;
const WINDOW = 0xffc46b;
const MUD = 0xa58660; const THATCH = 0xb08a4e; const FLAME = 0xff8a2a; const PAVING = 0xb9b2a4;
/** How homes look by civ level (level 1 has huts). */
const HOME_STYLES = {
  2: { wall: 0xb08a63, roof: THATCH, storeys: 1, ridge: false },
  3: { wall: STONE, roof: 'civ', storeys: 1, ridge: false },
  4: { wall: STONE, roof: 'civ', storeys: 2, ridge: false },
  5: { wall: 0xf6efe0, roof: 'civ', storeys: 2, ridge: true },
};
const SMOKE = 14; const SPARKS = 18;

const easeOut = (t) => (t >= 1 ? 1 : 1 - (1 - t) ** 3);
const mixHex = (a, b, t) => {
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [ar, ag, ab] = ch(a); const [br, bg, bb] = ch(b);
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

export class HexView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = null;
    this.raf = 0;
    this.open = false;
    this.lastFrame = -Infinity;
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => { this.reduced = e.matches; });
    this.yaw = 0.5; this.dist = DIST; this.dragging = null;
  }

  /** Load three.js and make the renderer; resolves to true when it can draw. */
  init() {
    this.ready ??= (async () => {
      const soft = probeGl();
      if (soft === null) return false;
      this.soft = soft;
      const T = await loadThree();
      this.T = T;
      const r = new T.WebGLRenderer({ canvas: this.canvas, antialias: !soft, powerPreference: 'high-performance' });
      r.shadowMap.enabled = !soft;
      r.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer = r;
      this.camera = new T.PerspectiveCamera(40, 1, 0.5, 300);
      this.attachInput();
      return true;
    })().catch((err) => { console.warn('The hex view cannot draw here.', err); return false; });
    return this.ready;
  }

  /**
   * Show hex `hex` (SimHost.inspect) with its people (SimHost.hexPeople list);
   * `clock` starts the day/night clock (seconds) and `look` is the season's
   * look on the map (seasons.seasonLook), or null for none.
   */
  async enter(hex, people = [], clock = 4, look = null) {
    if (!(await this.init())) return false;
    this.layout = layoutHex(hex, people);
    this.look = look ?? { snow: 0, autumn: 0, spring: 0 };
    this.build(hex);
    this.open = true;
    this.t0 = performance.now();
    this.clock0 = clock;
    this.yaw = 0.5; this.dist = DIST; this.zoomed = false;
    this.aim = { x: 0, z: 0 }; this.aimTo = { x: 0, z: 0 };
    this.resize();
    this.kick();
    return true;
  }

  leave() {
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scene?.traverse((o) => { o.geometry?.dispose(); });
    this.scene = null;
  }

  /** Seconds on the hex view's own clock (day and night run on it). */
  get clock() { return this.clock0 + (performance.now() - this.t0) / 1000; }

  build(hex) {
    const T = this.T;
    const L = this.layout;
    const scene = new T.Scene();
    this.scene = scene;
    const shadows = !this.soft;
    const mat = (color, opts = {}) => new T.MeshLambertMaterial({ color, flatShading: true, ...opts });
    const add = (m) => { m.castShadow = shadows; m.receiveShadow = shadows; scene.add(m); return m; };
    const inst = (geo, material, n, cast = true) => {
      const m = new T.InstancedMesh(geo, material, Math.max(1, n));
      m.count = n; m.castShadow = cast && shadows; m.receiveShadow = shadows; m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    const o = new T.Object3D();
    const put = (mesh, k, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => {
      o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix);
    };
    const c = new T.Color();
    const civHex = (civ, dim = 1) => {
      if (civ < 0) return 0x9a948a;
      const [r, g, b] = civStyle(civ).rgb;
      return (Math.round(r * dim) << 16) | (Math.round(g * dim) << 8) | Math.round(b * dim);
    };

    // Light: a sky that follows the sun, a sun that crosses the sky, and a cool moonlight at night.
    this.hemi = new T.HemisphereLight(0xe4f0ff, 0x3a3326, 1.6);
    this.sun = new T.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.moon = new T.DirectionalLight(0x9db8ff, 0.5);
    // Lamplight: a warm glow over the homes at night, only where people live.
    this.lamp = new T.PointLight(0xffb45c, 0, 18, 1.4);
    this.lamp.position.set(0, 3.5, 0);
    scene.add(this.hemi, this.sun, this.sun.target, this.moon, this.lamp);
    scene.fog = new T.Fog(SKY_DAY, 45, 120);

    // The plate: the hex's ground standing on a dark base, with water round it for coasts.
    const found = TERRAIN_IDS.indexOf(hex.terrain);
    const terrainId = found < 0 ? 2 : found;
    const look = this.look;
    const groundRgb = hex.water ? (hex.lake ? LAKE_RGB : TERRAIN_RGB[terrainId]) : seasonRgb(terrainId, TERRAIN_RGB[terrainId] ?? TERRAIN_RGB[2], look);
    // Plants and fields turn with the season too: leaves gold in autumn and bare in winter, snow on pines and fields.
    const turn = (col, toward, t) => mixHex(col, rgbToHex(toward), t);
    const BARE_RGB = [138, 122, 98];
    const leaves = (col) => turn(turn(turn(col, SPRING_RGB, look.spring * 0.3), AUTUMN_RGB, look.autumn * 0.6), BARE_RGB, look.snow * 0.6);
    const snowy = (col, t) => turn(col, SNOW_RGB, look.snow * t);
    const plate = add(new T.Mesh(new T.CylinderGeometry(HEX_R, HEX_R, 1.2, 6), mat(rgbToHex(groundRgb))));
    plate.position.y = -0.6;
    const base = new T.Mesh(new T.CylinderGeometry(HEX_R + 0.25, HEX_R + 0.6, 2.5, 6), mat(0x0a1422));
    base.position.y = -2.4;
    scene.add(base);
    this.water = null;
    if (hex.water || hex.terrain === 'coast') {
      const sea = new T.Mesh(new T.CylinderGeometry(hex.water ? HEX_R - 0.05 : 60, hex.water ? HEX_R - 0.05 : 60, 0.1, hex.water ? 6 : 48),
        new T.MeshLambertMaterial({ color: rgbToHex(hex.lake ? LAKE_RGB : TERRAIN_RGB[0]), transparent: true, opacity: 0.92 }));
      sea.position.y = hex.water ? 0.05 : -0.55;
      this.waterY = sea.position.y;
      sea.receiveShadow = shadows;
      scene.add(sea);
      this.water = sea;
    }
    if (L.river) {
      const river = add(new T.Mesh(new T.BoxGeometry(HEX_R * 1.7, 0.06, 1.1), mat(rgbToHex(RIVER_RGB))));
      river.position.set(0, 0.02, 2.2); river.rotation.y = 0.35;
    }

    // Fields: golden strips with darker furrows.
    const fields = inst(new T.BoxGeometry(1, 0.08, 1), mat(snowy(turn(0xd9b65a, SPRING_RGB, look.spring * 0.5), 0.7)), L.fields.length, false);
    L.fields.forEach((f, k) => put(fields, k, f.x, 0.04, f.z, f.w, 1, f.d, f.rot));

    // Homes: stone walls under roofs in the holder's colour; tents for people with no settlement.
    const homes = L.homes.filter((h) => !h.tent && !L.huts); const tents = L.homes.filter((h) => h.tent);
    // Foragers (civ level 1) live in round huts: a mud wall under a thatch cone, and no windows.
    const huts = L.huts ? L.homes.filter((h) => !h.tent) : [];
    const hutWalls = inst(new T.CylinderGeometry(0.55, 0.6, 0.5, 9).translate(0, 0.25, 0), mat(MUD), huts.length);
    const hutRoofs = inst(new T.ConeGeometry(0.78, 0.95, 9).translate(0, 0.475, 0), mat(0xffffff), huts.length);
    huts.forEach((h, k) => {
      put(hutWalls, k, h.x, 0, h.z, h.s, h.s, h.s, h.rot);
      put(hutRoofs, k, h.x, 0.42 * h.s, h.z, h.s, h.s, h.s, h.rot);
      hutRoofs.setColorAt(k, c.setHex(mixHex(THATCH, civHex(h.civ), 0.3)));
    });
    // Their bonfire: a ring of stones, crossed logs and a flame that burns brighter at night.
    this.fire = null;
    if (L.fire) {
      const g = new T.Group();
      g.position.set(L.fire.x, 0, L.fire.z);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const stone = new T.Mesh(new T.DodecahedronGeometry(0.13, 0), mat(0x7d776e));
        stone.position.set(0.42 * Math.cos(a), 0.06, 0.42 * Math.sin(a));
        g.add(stone);
      }
      for (const r of [0.4, 1.4, 2.4]) {
        const log = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.7, 5), mat(WOOD));
        log.rotation.set(Math.PI / 2 - 0.35, r, 0); log.position.y = 0.12;
        g.add(log);
      }
      const flame = new T.Mesh(new T.ConeGeometry(0.22, 0.6, 6).translate(0, 0.3, 0), new T.MeshBasicMaterial({ color: FLAME, transparent: true, opacity: 0.5 }));
      flame.position.y = 0.1;
      const core = new T.Mesh(new T.ConeGeometry(0.11, 0.35, 5).translate(0, 0.175, 0), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6 }));
      core.position.y = 0.1;
      const light = new T.PointLight(0xff8a3a, 0, 12, 1.6);
      light.position.y = 0.8;
      g.add(flame, core, light);
      scene.add(g);
      this.fire = { flame, core, light };
    }
    // Homes change with the civ's level: mud brick under thatch (Farmers), stone under tiles in the civ's colour (Builders),
    // two storeys (Organised), tall white townhouses with gold-ridged roofs (Kingdom).
    const style = HOME_STYLES[Math.max(2, Math.min(5, L.level))];
    const walls = inst(new T.BoxGeometry(0.9, 0.7, 0.8).translate(0, 0.35, 0), mat(style.wall), homes.length);
    const roofs = inst(new T.ConeGeometry(0.78, 0.6, 4).rotateY(Math.PI / 4).translate(0, 0.3, 0), mat(0xffffff), homes.length);
    const windows = inst(new T.BoxGeometry(0.22, 0.2, 0.04), new T.MeshBasicMaterial({ color: WINDOW, transparent: true, opacity: 0 }), homes.length * style.storeys, false);
    const ridges = style.ridge ? inst(new T.BoxGeometry(0.1, 0.1, 0.1), mat(GOLD), homes.length, false) : null;
    homes.forEach((h, k) => {
      const tall = style.storeys;
      put(walls, k, h.x, 0, h.z, h.s, h.s * tall, h.s, h.rot);
      put(roofs, k, h.x, 0.7 * h.s * tall, h.z, h.s, h.s, h.s, h.rot);
      roofs.setColorAt(k, c.setHex(style.roof === 'civ' ? civHex(h.civ) : mixHex(style.roof, civHex(h.civ), 0.25)));
      if (ridges) put(ridges, k, h.x, (0.7 * tall + 0.6) * h.s, h.z, h.s, h.s, h.s, h.rot);
      // A window on the front wall, one per storey.
      const fx = Math.sin(h.rot) * 0.41 * h.s; const fz = Math.cos(h.rot) * 0.41 * h.s;
      for (let f = 0; f < tall; f++) put(windows, k * tall + f, h.x + fx, (0.38 + 0.7 * f) * h.s, h.z + fz, h.s, h.s, h.s, h.rot);
    });
    const tentMesh = inst(new T.ConeGeometry(0.6, 0.9, 6).translate(0, 0.45, 0), mat(0xffffff), tents.length);
    tents.forEach((h, k) => { put(tentMesh, k, h.x, 0, h.z, h.s, h.s, h.s, h.rot); tentMesh.setColorAt(k, c.setHex(civHex(h.civ))); });
    this.windows = windows;

    // Towers with lit windows of their own, and a wall ringing a town or bigger.
    const towers = inst(new T.CylinderGeometry(0.42, 0.5, 1, 6).translate(0, 0.5, 0), mat(STONE), L.towers.length);
    const spires = inst(new T.ConeGeometry(0.55, 0.9, 6).translate(0, 0.45, 0), mat(0xffffff), L.towers.length);
    const towerLights = inst(new T.CylinderGeometry(0.43, 0.43, 0.12, 6), new T.MeshBasicMaterial({ color: WINDOW, transparent: true, opacity: 0 }), L.towers.length, false);
    L.towers.forEach((t, k) => {
      put(towers, k, t.x, 0, t.z, 1, t.h, 1);
      put(spires, k, t.x, t.h, t.z, 1, 1, 1);
      spires.setColorAt(k, c.setHex(civHex(t.civ)));
      put(towerLights, k, t.x, t.h * 0.7, t.z, 1, 1, 1);
    });
    this.towerLights = towerLights;
    if (L.wall > 0 && L.wallKind === 'wood') {
      // A palisade of sharpened stakes.
      const n = Math.round(L.wall * 9);
      const stakes = inst(new T.CylinderGeometry(0.11, 0.13, 1.1, 5).translate(0, 0.55, 0), mat(WOOD), n);
      const tips = inst(new T.ConeGeometry(0.12, 0.25, 5).translate(0, 0.125, 0), mat(WOOD), n);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        put(stakes, k, L.wall * Math.cos(a), 0, L.wall * Math.sin(a), 1, 0.85 + 0.3 * ((k * 7) % 5) / 4, 1);
        put(tips, k, L.wall * Math.cos(a), 1.1 * (0.85 + 0.3 * ((k * 7) % 5) / 4), L.wall * Math.sin(a), 1, 1, 1);
      }
    } else if (L.wall > 0) {
      const segs = 36;
      const wall = inst(new T.BoxGeometry(1, 0.9, 0.3).translate(0, 0.45, 0), mat(0xcfc3a8), segs);
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const len = (2 * Math.PI * L.wall) / segs + 0.05;
        put(wall, k, L.wall * Math.cos(a), 0, L.wall * Math.sin(a), len, 1, 1, -a + Math.PI / 2);
      }
    }

    // Every building and wonder here, each as its own model (buildingModels.js); a site rises with its work under scaffolding, a ruin stands grey.
    this.geo ??= shapeGeometries(T);
    for (const m of L.structures) {
      const g = buildModel(T, this.geo, modelOf(m), { civHex: civHex(m.civ), status: m.status, progress: m.progress, scale: m.s, shadows });
      g.position.set(m.x, 0, m.z); g.rotation.y = m.ry;
      scene.add(g);
    }
    if (L.dock) {
      const g = buildModel(T, this.geo, SETTLEMENT_MODELS.fishingDock, { civHex: civHex(L.homes[0]?.civ ?? -1), status: L.dock.status, scale: 1.2, shadows });
      g.position.set(L.dock.x, 0, L.dock.z);
      scene.add(g);
    }
    // From level 3 a paved square in the middle, a well at its heart; from level 4 lamps round it, and at level 5 banners and a gilded statue.
    if (L.plaza > 0) {
      const sq = add(new T.Mesh(new T.CylinderGeometry(L.plaza, L.plaza, 0.06, 8), mat(PAVING)));
      sq.position.y = 0.03;
      add(new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 0.45, 8).translate(0, 0.225, 0), mat(STONE)));
      if (L.level >= 5) {
        add(new T.Mesh(new T.BoxGeometry(0.5, 0.6, 0.5).translate(0, 0.75, 0), mat(STONE)));
        add(new T.Mesh(new T.CylinderGeometry(0.12, 0.18, 0.9, 6).translate(0, 1.5, 0), mat(GOLD)));
      } else {
        const water = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.02, 8), mat(0x3d7fbf));
        water.position.y = 0.46; scene.add(water);
      }
    }
    const lamps = inst(new T.CylinderGeometry(0.04, 0.05, 1.4, 5).translate(0, 0.7, 0), mat(0x3b3229), L.lamps.length);
    const lampHeads = inst(new T.OctahedronGeometry(0.14, 0), new T.MeshBasicMaterial({ color: WINDOW, transparent: true, opacity: 0 }), L.lamps.length, false);
    const flags = L.level >= 5 ? inst(new T.BoxGeometry(0.45, 0.3, 0.02), mat(0xffffff), L.lamps.length, false) : null;
    L.lamps.forEach((l, k) => {
      put(lamps, k, l.x, 0, l.z, 1, 1, 1);
      put(lampHeads, k, l.x, 1.45, l.z, 1, 1, 1);
      if (flags) { put(flags, k, l.x + 0.24, 1.1, l.z, 1, 1, 1, Math.atan2(l.x, l.z)); flags.setColorAt(k, c.setHex(civHex(L.homes[0]?.civ ?? -1))); }
    });
    this.lampHeads = lampHeads;

    // Nature: one instanced mesh per kind, swaying on its own.
    const kinds = {
      pine: [new T.ConeGeometry(0.45, 1.5, 6).translate(0, 1.05, 0), snowy(0x2f6b3a, 0.4)],
      snowpine: [new T.ConeGeometry(0.45, 1.4, 6).translate(0, 1.0, 0), snowy(0x9fb9b0, 0.5)],
      tree: [new T.IcosahedronGeometry(0.6, 0).translate(0, 1.1, 0), leaves(0x4f8f3e)],
      palm: [new T.ConeGeometry(0.75, 0.3, 7).translate(0, 1.5, 0), 0x3f8a4a],
      cactus: [new T.CylinderGeometry(0.15, 0.18, 1.0, 6).translate(0, 0.5, 0), 0x5c8a45],
      rock: [new T.DodecahedronGeometry(0.5, 0).translate(0, 0.25, 0), 0x8d8a86],
      peak: [new T.ConeGeometry(1.8, 3.2, 5).translate(0, 1.6, 0), 0x8d8a86],
    };
    const trunks = { pine: 0.4, snowpine: 0.4, tree: 0.7, palm: 1.4 };
    this.sway = [];
    const byKind = {};
    for (const n of L.nature) (byKind[n.kind] ??= []).push(n);
    for (const [kind, list] of Object.entries(byKind)) {
      const [geo, col] = kinds[kind];
      const crown = inst(geo, mat(col), list.length);
      const trunk = trunks[kind] ? inst(new T.CylinderGeometry(0.08, 0.11, trunks[kind], 5).translate(0, trunks[kind] / 2, 0), mat(WOOD), list.length) : null;
      const snow = kind === 'peak' ? inst(new T.ConeGeometry(0.62, 1.1, 5).translate(0, 0.55, 0), mat(0xf4f7fb), list.length, false) : null;
      list.forEach((n, k) => {
        put(crown, k, n.x, 0, n.z, n.s, n.s, n.s, n.rot);
        trunk && put(trunk, k, n.x, 0, n.z, n.s, n.s, n.s, n.rot);
        snow && put(snow, k, n.x, 2.1 * n.s, n.z, n.s, n.s, n.s, n.rot);
      });
      if (trunks[kind]) this.sway.push({ crown, trunk, list });
    }

    // People: a body and a head in their civ's colour, children smaller.
    const n = L.walkers.length;
    this.bodies = inst(new T.CylinderGeometry(0.12, 0.17, 0.5, 6).translate(0, 0.25, 0), mat(0xffffff), n);
    this.heads = inst(new T.SphereGeometry(0.12, 8, 6).translate(0, 0.62, 0), mat(0xf0d2b0), n);
    L.walkers.forEach((w, k) => this.bodies.setColorAt(k, c.setHex(civHex(w.civ, 0.9))));

    // War: sparks where the sides meet and smoke rising over the hex.
    this.sparks = this.smoke = null;
    if (L.war) {
      this.sparks = inst(new T.OctahedronGeometry(0.1, 0), new T.MeshBasicMaterial({ color: 0xffe08a }), SPARKS, false);
      this.smoke = inst(new T.IcosahedronGeometry(0.6, 0), new T.MeshLambertMaterial({ color: 0x57524d, transparent: true, opacity: 0.55 }), SMOKE, false);
    }
    this.put = put;
    this.place(0);
  }

  /** Move everything that lives, for render time `s` seconds since entering. */
  place(s) {
    const L = this.layout;
    const still = this.reduced;
    const put = this.put;
    if (this.bodies) {
      L.walkers.forEach((w, k) => {
        const a = w.phase + (still ? 0 : s * w.speed);
        let x = w.x + w.r * Math.cos(a); let z = w.z + w.r * Math.sin(a);
        // At war the sides press towards the middle line and fall back.
        if (L.war && !still) x += (w.x < 0 ? 1 : -1) * (0.8 + 0.8 * Math.sin(s * 1.7 + w.phase));
        const lim = HEX_R * 0.8;
        const d = Math.hypot(x, z);
        if (d > lim) { x *= lim / d; z *= lim / d; }
        const sc = w.child ? 0.7 : 1;
        const bob = still ? 0 : Math.abs(Math.sin(s * 6 + w.phase)) * 0.06;
        const face = a + (w.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        put(this.bodies, k, x, bob, z, sc, sc, sc, -face);
        put(this.heads, k, x, bob, z, sc, sc, sc, -face);
      });
      this.bodies.instanceMatrix.needsUpdate = true;
      this.heads.instanceMatrix.needsUpdate = true;
    }
    if (!still) {
      for (const { crown, trunk, list } of this.sway) {
        list.forEach((n, k) => {
          const tilt = 0.05 * Math.sin(s * 1.3 + n.x * 0.7 + n.z * 0.5);
          put(crown, k, n.x, 0, n.z, n.s, n.s, n.s, n.rot, tilt, tilt * 0.6);
          if (trunk) put(trunk, k, n.x, 0, n.z, n.s, n.s, n.s, n.rot, tilt * 0.5, tilt * 0.3);
        });
        crown.instanceMatrix.needsUpdate = true;
        if (trunk) trunk.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.sparks) {
      for (let k = 0; k < SPARKS; k++) {
        const life = (s * 1.8 + k * 0.37) % 1;
        const z = ((k * 7) % 11) - 5;
        put(this.sparks, k, Math.sin(k * 3.1 + s) * 0.6, 0.4 + life * 1.2, z * 0.8, 1 - life, 1 - life, 1 - life, s * 4 + k);
      }
      for (let k = 0; k < SMOKE; k++) {
        const life = (s * 0.12 + k / SMOKE) % 1;
        const x = Math.sin(k * 2.3) * 4; const z = Math.cos(k * 1.7) * 4;
        put(this.smoke, k, x + life * 1.5, 0.8 + life * 7, z, 0.6 + life * 2, 0.6 + life * 2, 0.6 + life * 2);
      }
      this.sparks.instanceMatrix.needsUpdate = true;
      this.smoke.instanceMatrix.needsUpdate = true;
    }
    if (this.water && !still) this.water.position.y = this.waterY + Math.sin(s * 0.9) * 0.03;
  }

  /** Day and night: sky, sun and moon, and windows lit where people live. */
  light(clock) {
    const day = daylight(clock);
    const arc = arcAt(clock);
    const up = Math.sin(arc * Math.PI);
    const across = Math.cos(arc * Math.PI);
    const sky = mixHex(SKY_NIGHT, SKY_DAY, day);
    (this.scene.background ??= new this.T.Color()).setHex(sky);
    this.scene.fog.color.setHex(sky);
    // Low sun at dawn and dusk turns warm.
    const warm = day > 0 && day < 1 ? 1 - Math.abs(day * 2 - 1) : 0;
    this.sun.color.setHex(mixHex(0xfff1d6, 0xff9a52, warm));
    this.sun.intensity = 2.4 * day;
    this.sun.position.set(across * 30, 6 + up * 30, -10);
    this.moon.intensity = 0.55 * (1 - day);
    this.moon.position.set(-across * 30, 6 + up * 25, 10);
    this.hemi.intensity = 0.35 + 1.25 * day;
    const glow = this.layout.lit ? 1 - day : 0;
    this.windows.material.opacity = glow;
    this.towerLights.material.opacity = glow;
    this.lampHeads.material.opacity = glow;
    // Foragers have no lamps in windows: their light is the bonfire, burning all day and brightest at night.
    this.lamp.intensity = this.fire ? 0 : 30 * glow * (this.layout.homes.length > 0 ? 1 : 0.3);
    if (this.fire) {
      const flicker = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(clock * 11) * Math.sin(clock * 7.3 + 1);
      this.fire.light.intensity = (4 + 26 * (1 - day)) * flicker;
      this.fire.flame.material.opacity = (0.55 + 0.4 * (1 - day)) * flicker;
      this.fire.flame.scale.set(1, flicker, 1);
      this.fire.core.material.opacity = 0.6 + 0.4 * (1 - day);
    }
    this.onPart?.(partOfDay(clock));
    return day;
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.canvas.clientWidth); const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(this.soft ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Narrow (portrait) views stand further back, so most of the hex fits across.
    if (!this.zoomed) {
      const across = Math.tan((20 * Math.PI) / 180) * this.camera.aspect;
      this.dist = Math.min(MAX_DIST, Math.max(DIST, (0.62 * HEX_R) / across));
    }
  }

  kick() {
    if (!this.raf && this.open) this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  frame(now) {
    this.raf = 0;
    if (!this.open || !this.scene) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (this.soft && now - this.lastFrame < SOFT_FRAME_MS) return;
    this.lastFrame = now;
    const s = (performance.now() - this.t0) / 1000;
    const u = this.reduced ? 1 : easeOut(Math.min(1, (s * 1000) / ENTER_MS));
    if (!this.reduced && !this.dragging) this.yaw += 0.0015;
    // The entrance: from high above, down and round to the view.
    const dist = this.dist + (1 - u) * 50;
    const pitch = PITCH + (1 - u) * 0.75;
    const cam = this.camera;
    // The view glides to whatever it is aimed at (a building picked from the list).
    const k = this.reduced ? 1 : 0.08;
    this.aim.x += (this.aimTo.x - this.aim.x) * k; this.aim.z += (this.aimTo.z - this.aim.z) * k;
    const { x: ax, z: az } = this.aim;
    cam.position.set(ax + Math.sin(this.yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, az + Math.cos(this.yaw) * Math.cos(pitch) * dist);
    cam.lookAt(ax, 0.6, az);
    this.place(s);
    this.daylight = this.light(this.clock);
    this.renderer.render(this.scene, cam);
  }

  attachInput() {
    const pts = new Map();
    let pinch = 0;
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); this.dragging = true; });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const [px] = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) this.yaw -= (e.clientX - px) * 0.008;
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoom(pinch / d);
        pinch = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; if (!pts.size) this.dragging = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  }

  /**
   * Aim the view at the building or wonder `id` of kind `kind` here (as SimHost.inspect lists it) and close in;
   * with no id, back to the whole hex. Returns whether it is drawn here.
   */
  focus(id = null, kind = null) {
    if (!this.layout) return false;
    if (!id) { this.aimTo = { x: 0, z: 0 }; this.zoomed = false; this.resize(); return true; }
    const L = this.layout;
    const m = id === 'fishingDock' ? L.dock : L.structures.find((st) => st.id === id && (!kind || st.kind === kind));
    if (!m) return false;
    this.aimTo = { x: m.x, z: m.z };
    this.zoomed = true;
    this.dist = Math.max(MIN_DIST, Math.min(DIST, 6 + (m.r ?? 1.5) * 3));
    return true;
  }

  zoom(f) { this.zoomed = true; this.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, this.dist * f)); }
}
