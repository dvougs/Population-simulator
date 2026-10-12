// The home page's living world in 3D (RULES.md "Feature flags"): the same
// small world as the 2D board, built as a diorama with three.js. Hex tiles
// stand by terrain and elevation, forests grow trees, mountains peaks, settled
// hexes homes in their civ's colours (a tower in towns), buildings and wonders
// stand as monuments, and a few people walk about each settled hex.
//
// Turning the 3D flag on plays the change: the canvas appears over the flat
// 2D board looking straight down, so the two match, then the tiles rise from
// the middle outwards while the camera tilts down to its 3D view; turning it
// off plays it backwards and hands back to the 2D board. Three.js is loaded
// only when the flag is first turned on, so the 2D page downloads nothing new.
//
// Everything moves on render time, never the sim's. With reduced motion, or on
// a software WebGL renderer (no GPU, as in headless browsers), the change is
// instant and the scene is drawn as stills, at most one a second on software.

import { isSoftwareGl } from '../render/gpu.js';
import { hexCentre, riverSegments, HEX_SIZE } from '../render/layout.js';
import { rgbToHex, RIVER_RGB } from '../render/palette.js';
import { civStyle } from '../render/civStyle.js';
import { hexTotal, largestCiv } from '../render/peopleMaths.js';
import { DEEP_WATER, FOREST, MOUNTAIN } from '../sim/terrain.js';
import {
  tileHeight, homesFor, HOME_SLOTS, MONUMENT_SLOT, MAX_HOMES, TILE_BASE, boardBounds,
  RISE_MS, FOV_DEG, riseAt, tiltAt, cameraPose,
} from './diorama.js';

const MAX_DPR = 2;
const LITE_MS = 1000; // software renderer: at most one still a second
const IDLE_FPS = 30; // once risen, the world drifts slowly; half the frames is plenty
const GROW_MS = 380; // a new home growing out of the ground
const TREE_SLOTS = [[-0.35, -0.2], [0.3, -0.3], [0.05, 0.35], [-0.4, 0.3], [0.42, 0.18]];
const PAWNS_PER_HEX = 4;
const STONE = 0xe9dfcb;
const TRUNK_GREEN = 0x2f6b3a;
const PEAK = 0x8d8a86;
const SNOW = 0xf4f7fb;
const GOLD = 0xf2c14e;
const BASE = 0x0a1422;

let threeLoad = null;
/** The vendored three.js module, fetched on first use. */
const loadThree = () => (threeLoad ??= import('../../vendor/three.mjs'));

/** Whether this browser draws WebGL in software (true), on a GPU (false), or not at all (null). */
function probeGl() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const soft = isSoftwareGl(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return soft;
  } catch {
    return null;
  }
}

const easeOut = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - (1 - t) * (1 - t) * (1 - t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export class HomeScene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = null;
    this.live = false;
    this.failed = false;
    this.lite = false;
    this.active = false; // the home page is on show
    this.target = 0; // 1 when the flag is on
    this.u = 0; // transition progress, 0 flat (2D) to 1 risen (3D)
    this.t = 0; // decoration clock, seconds
    this.raf = 0;
    this.last = 0;
    this.lastDraw = -Infinity;
    this.liteTimer = 0;
    this.world = null;
    this.year = null;
    /** Called with the 3D canvas's opacity (0 to 1) whenever it changes, so the 2D board can fade the other way. */
    this.onBlend = null;
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => { this.reduced = e.matches; this.kick(); });
    this.blend = 0;
  }

  /** Load three.js and make the renderer; resolves to true when the scene draws, false without WebGL. */
  init() {
    this.ready ??= (async () => {
      try {
        const soft = probeGl();
        if (soft === null) throw new Error('no WebGL');
        this.lite = soft;
        const T = await loadThree();
        this.T = T;
        const renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: !this.lite, alpha: true, powerPreference: 'low-power' });
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = !this.lite;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer = renderer;
        this.scene = new T.Scene();
        this.camera = new T.PerspectiveCamera(FOV_DEG, 1, 0.1, 400);
        this.camera.up.set(0, 0, -1); // north stays up the screen, as on the 2D board
        this.scene.add(new T.HemisphereLight(0xe4f0ff, 0x30384a, 1.9));
        const sun = new T.DirectionalLight(0xfff1d6, 2.6);
        sun.castShadow = !this.lite;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.02;
        this.sun = sun;
        this.scene.add(sun, sun.target);
        this.geo = this.buildGeometries(T);
        new ResizeObserver(() => this.resize()).observe(this.canvas);
        this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.live = false; });
        this.canvas.addEventListener('webglcontextrestored', () => { this.live = true; this.kick(); });
        this.live = true;
        if (this.world) this.buildWorld();
        this.resize();
        this.kick();
        return true;
      } catch (err) {
        console.warn('3D graphics unavailable; the home page keeps its 2D world.', err);
        this.failed = true;
        this.setBlend(0);
        return false;
      }
    })();
    return this.ready;
  }

  buildGeometries(T) {
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
    return { tile, base, tree, peak, snow, wall, roof, tent, tower, spire, step, river, pawn };
  }

  /** The world to show (once per map; a restart of the same map keeps it). */
  setWorld(map, colours) {
    if (this.world && this.world.map.hash === map.hash) { this.world.map = map; return; }
    this.world = { map, colours };
    if (this.live) this.buildWorld();
  }

  buildWorld() {
    const { T } = this;
    const { map, colours } = this.world;
    if (this.root) {
      this.scene.remove(this.root);
      for (const m of this.meshes) m.dispose();
    }
    const n = map.cols * map.rows;
    const b = boardBounds(map.cols, map.rows);
    this.board = b;
    const root = new T.Group();
    this.root = root;
    this.meshes = [];
    const mat = (opts = {}) => new T.MeshLambertMaterial({ flatShading: true, ...opts });
    const mesh = (geo, count, material, cast = true) => {
      const m = new T.InstancedMesh(geo, material, Math.max(1, count));
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.castShadow = cast && !this.lite;
      m.receiveShadow = !this.lite;
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
    };
    this.scene.add(root);

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
    this.tiles = { n, cx, cz, top, dist, rise: new Float32Array(n), colours };
    this.rivers = rivers.map(([x0, y0, x1, y1]) => {
      const a = { x: x0 / HEX_SIZE, z: y0 / HEX_SIZE }; const e = { x: x1 / HEX_SIZE, z: y1 / HEX_SIZE };
      return { a, e, len: Math.hypot(e.x - a.x, e.z - a.z), yaw: Math.atan2(e.z - a.z, e.x - a.x), hex: this.hexAt(a.x, a.z, map) };
    });
    // Homes on show per hex, and when the newest one started growing.
    this.homes = { shown: new Int8Array(n), grownAt: new Float32Array(n).fill(-1e9) };

    // Light and shadow sized to the board.
    const span = Math.max(b.w, b.d);
    this.sun.position.set(b.cx - span * 0.55, span * 1.1, b.cz - span * 0.7);
    this.sun.target.position.set(b.cx, 0, b.cz);
    const sc = this.sun.shadow.camera;
    sc.left = -span * 0.75; sc.right = span * 0.75; sc.top = span * 0.75; sc.bottom = -span * 0.75;
    sc.near = 0.5; sc.far = span * 3;
    sc.updateProjectionMatrix();

    this.tmp = { o: new T.Object3D(), c: new T.Color() };
    this.paintStatic();
    if (this.year) this.paintYear();
    this.kick();
  }

  /** Index of the hex under board point (x, z), by nearest centre. */
  hexAt(x, z, map) {
    const { cx, cz, n } = this.tiles ?? {};
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < (n ?? map.cols * map.rows); i++) {
      const dx = cx[i] - x; const dz = cz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Colours that never change (the board's base, rivers and terrain decoration take their material colour). */
  paintStatic() {
    const { c } = this.tmp;
    const { n, colours } = this.tiles;
    for (let i = 0; i < n; i++) {
      const [r, g, bl] = colours[i];
      this.m.tile.setColorAt(i, c.setRGB(r / 255, g / 255, bl / 255, this.T.SRGBColorSpace));
    }
    this.m.tile.instanceColor.needsUpdate = true;
  }

  /** A new year of the living world: { pop, settlements, buildings } (SimHost data). */
  setYear(year) {
    this.year = year;
    if (!this.live || !this.tiles) return;
    this.paintYear();
    this.kick();
  }

  paintYear() {
    const { pop, settlements, buildings } = this.year;
    const { map } = this.world;
    const { n, colours } = this.tiles;
    const { c } = this.tmp;
    const civs = pop.civs; const counts = pop.hexCivPop;
    const now = this.t;
    const show = this.yearShow ??= { civ: new Int8Array(n), people: new Int32Array(n), homes: new Int8Array(n), tents: new Uint8Array(n), tower: new Uint8Array(n), monument: new Int8Array(n) };
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
      if (h.homes > this.homes.shown[i]) this.homes.grownAt[i] = now;
      this.homes.shown[i] = h.homes;
      show.civ[i] = civ; show.people[i] = people; show.homes[i] = h.homes;
      show.tents[i] = h.tents ? 1 : 0; show.tower[i] = h.tower ? 1 : 0;
      // Settled land takes a little of its civ's colour, as the 2D map's tint does.
      const [r, g, bl] = colours[i];
      let rr = r; let gg = g; let bb = bl;
      if (civ >= 0) {
        const [sr, sg, sb] = civStyle(civ).rgb;
        rr = r * 0.74 + sr * 0.26; gg = g * 0.74 + sg * 0.26; bb = bl * 0.74 + sb * 0.26;
      }
      this.m.tile.setColorAt(i, c.setRGB(rr / 255, gg / 255, bb / 255, this.T.SRGBColorSpace));
    }
    this.m.tile.instanceColor.needsUpdate = true;
  }

  /** Turn the 3D world on (true) or off (false); `instant` skips the transition. */
  setOn(on, instant = false) {
    this.target = on ? 1 : 0;
    if (instant || this.still) this.u = this.target;
    this.kick();
  }

  /** Start (true) or stop (false) drawing; called when the home page is shown or hidden. */
  setActive(on) {
    this.active = on;
    if (!on) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      clearTimeout(this.liteTimer);
      this.liteTimer = 0;
      return;
    }
    this.kick();
  }

  /** No running animation: reduced motion, or a software renderer. */
  get still() { return this.reduced || this.lite; }

  /** Wanted on screen at all (risen, rising, or sinking back). */
  get shown() { return this.live && (this.u > 0 || this.target > 0); }

  /** Make sure a frame comes: the animation loop, or a still. */
  kick() {
    if (!this.live || !this.active) { this.setBlend(this.live ? this.blendFor(this.u) : 0); return; }
    if (this.still) {
      this.u = this.target;
      this.drawStill();
      return;
    }
    if (!this.raf && this.shown) { this.last = 0; this.raf = requestAnimationFrame((t) => this.frame(t)); }
    if (!this.shown) this.setBlend(0);
  }

  drawStill() {
    const wait = this.lite ? LITE_MS - (performance.now() - this.lastDraw) : 0;
    if (wait > 0) {
      this.liteTimer ||= setTimeout(() => { this.liteTimer = 0; this.drawStill(); }, wait);
      return;
    }
    this.lastDraw = performance.now();
    this.draw();
  }

  frame(now) {
    this.raf = 0;
    if (!this.active || !this.live || this.still) return;
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    const moving = this.u !== this.target;
    // Once risen, the drifting world needs only half the frames.
    if (!moving && this.last && now - this.last < 1000 / IDLE_FPS - 2) { this.raf = requestAnimationFrame((t) => this.frame(t)); return; }
    this.last = now;
    this.t += dt / 1000;
    const step = dt / RISE_MS;
    this.u = this.target > this.u ? Math.min(this.target, this.u + step) : Math.max(this.target, this.u - step);
    this.draw();
    if (this.shown) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** The 3D canvas's opacity at progress u: it covers the 2D board in the first moments of the rise. */
  blendFor(u) { return clamp01(u / 0.08); }

  setBlend(a) {
    if (a === this.blend) return;
    this.blend = a;
    this.canvas.style.opacity = String(a);
    this.canvas.style.visibility = a > 0 ? 'visible' : 'hidden';
    this.onBlend?.(a);
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.active) this.kick();
  }

  draw() {
    this.setBlend(this.blendFor(this.u));
    if (!this.tiles || this.blend === 0) return;
    const { u } = this;
    const still = this.still;
    const tilt = tiltAt(u);
    const yaw = still ? 0 : 0.16 * Math.sin(this.t * 0.11) * tilt;
    const pose = cameraPose(this.board, this.camera.aspect, tilt, yaw);
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.lookAt(pose.tx, pose.ty, pose.tz);
    this.placeAll(u);
    this.renderer.render(this.scene, this.camera);
  }

  /** Put every instance where it stands at transition progress u. */
  placeAll(u) {
    const { o, c } = this.tmp;
    const { n, cx, cz, top, dist, rise } = this.tiles;
    const { map } = this.world;
    const m = this.m;
    const put = (mesh, k, x, y, z, sx, sy, sz, ry = 0) => {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
    };
    const flat = 0.002;
    let trees = 0; let peaks = 0;
    for (let i = 0; i < n; i++) {
      const r = riseAt(u, dist[i]);
      rise[i] = r;
      const h = flat + (top[i] - flat) * r;
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
      const y = (i >= 0 ? flat + (top[i] - flat) * rise[i] : flat) + 0.004;
      put(m.river, k++, (rv.a.x + rv.e.x) / 2, y, (rv.a.z + rv.e.z) / 2, rv.len, 0.02, 0.2, -rv.yaw);
    }
    m.river.count = k;
    this.placeSettled(u, put, c);
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  placeSettled(u, put, c) {
    const show = this.yearShow;
    const m = this.m;
    if (!show) { for (const key of ['wall', 'roof', 'tent', 'tower', 'spire', 'step', 'pawn']) m[key].count = 0; return; }
    const { n, cx, cz, top, rise } = this.tiles;
    const T = this.T;
    const still = this.still;
    let walls = 0; let tents = 0; let towers = 0; let steps = 0; let pawns = 0;
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
      const h = 0.002 + (top[i] - 0.002) * r;
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
      if (show.tents[i]) {
        put(m.tent, tents, x + HOME_SLOTS[0][0], h, z + HOME_SLOTS[0][1], g, g, g);
        tint(m.tent, tents++, civ);
      } else {
        const homes = show.homes[i];
        for (let s = 0; s < homes; s++) {
          // The newest home grows out of the ground.
          const newest = s === homes - 1;
          const grow = newest && !still ? easeOut((this.t - this.homes.grownAt[i]) / (GROW_MS / 1000)) : 1;
          const sc = g * grow * (0.9 + 0.12 * (((i + s * 5) % 4) / 3));
          const [ox, oz] = HOME_SLOTS[s];
          const ry = ((i * 3 + s) % 4) * 0.35;
          put(m.wall, walls, x + ox, h, z + oz, sc, sc, sc, ry);
          m.wall.setColorAt(walls, c.setHex(STONE));
          put(m.roof, walls, x + ox, h + 0.26 * sc, z + oz, sc, sc, sc, ry);
          tint(m.roof, walls++, civ);
        }
        if (show.tower[i]) {
          const tx = show.monument[i] >= 0 ? x + 0.1 : x;
          const tz = show.monument[i] >= 0 ? z - 0.52 : z;
          put(m.tower, towers, tx, h, tz, g, g, g);
          put(m.spire, towers, tx, h + 0.52 * g, tz, g, g, g);
          tint(m.spire, towers++, civ);
        }
      }
      // A few people walk round the hex (one per 8, up to 4), on render time only.
      const walkers = Math.min(PAWNS_PER_HEX, Math.ceil(show.people[i] / 8));
      for (let p = 0; p < walkers; p++) {
        const a = (i * 2.399 + p * 1.571) + (still ? 0 : this.t * (0.25 + 0.06 * p) * (p % 2 ? -1 : 1));
        const rad = 0.5 + 0.08 * p;
        put(m.pawn, pawns, x + rad * Math.cos(a), h, z + rad * Math.sin(a), g, g, g);
        tint(m.pawn, pawns++, civ, 0.85);
      }
    }
    m.wall.count = walls; m.roof.count = walls; m.tent.count = tents;
    m.tower.count = towers; m.spire.count = towers; m.step.count = steps; m.pawn.count = pawns;
    for (const mesh of [m.wall, m.roof, m.tent, m.spire, m.step, m.pawn]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
