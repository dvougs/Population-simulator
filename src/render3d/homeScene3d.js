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

import { loadThree, probeGl, addLights, aimSun } from './threeLoad.js';
import { DioramaWorld } from './dioramaWorld.js';
import { RISE_MS, FOV_DEG, riseAt, tiltAt, cameraPose } from './diorama.js';

const MAX_DPR = 2;
const LITE_MS = 1000; // software renderer: at most one still a second
const IDLE_FPS = 30; // once risen, the world drifts slowly; half the frames is plenty

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
        this.sun = addLights(T, this.scene, !this.lite);
        this.diorama = new DioramaWorld(T, { shadows: !this.lite });
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

  /** The world to show (once per map; a restart of the same map keeps it). */
  setWorld(map, colours) {
    if (this.world && this.world.map.hash === map.hash) { this.world.map = map; return; }
    this.world = { map, colours };
    if (this.live) this.buildWorld();
  }

  buildWorld() {
    const { map, colours } = this.world;
    this.scene.add(this.diorama.build(map, colours));
    aimSun(this.sun, this.diorama.board);
    if (this.year) this.diorama.setYear(this.year, this.t);
    this.kick();
  }

  /** A new year of the living world: { pop, settlements, buildings } (SimHost data). */
  setYear(year) {
    this.year = year;
    if (!this.live || !this.diorama?.tiles) return;
    this.diorama.setYear(year, this.t);
    this.kick();
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
    const d = this.diorama;
    if (!d?.tiles || this.blend === 0) return;
    const { u } = this;
    const still = this.still;
    const tilt = tiltAt(u);
    const yaw = still ? 0 : 0.16 * Math.sin(this.t * 0.11) * tilt;
    const pose = cameraPose(d.board, this.camera.aspect, tilt, yaw);
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.lookAt(pose.tx, pose.ty, pose.tz);
    const { dist } = d.tiles;
    d.place((i) => riseAt(u, dist[i]), this.t, still);
    this.renderer.render(this.scene, this.camera);
  }
}
