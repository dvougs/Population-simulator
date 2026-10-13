// The game map in 3D (RULES.md "Feature flags"), used in place of the PixiJS
// renderer while the 3D graphics flag is on. It draws the same diorama as the
// home page's 3D world (dioramaWorld.js) into its own canvas under the 2D one,
// which keeps taking the gestures, and has the 2D renderer's methods, so the
// rest of the game does not know which one draws.
//
// The view is orthographic, tilted GAME_TILT_DEG from straight down with north
// up the screen: the shared Camera (with ky, its north-south squash) still
// decides what is on screen, and each frame the three.js camera is put where
// it shows the same ground. Taps follow the line of sight (diorama.rayHex), so
// a tall tile in front is hit before the low one behind it.
//
// Frames cost little: the world's instances are re-placed only when the
// people, settlements or buildings change (at most every PEOPLE_FRAME_MS while
// the game runs) and shadows are recomputed only then; a pan or zoom just
// draws again. When a game starts the tiles rise out of the flat map from the
// middle outwards (instantly with reduced motion or a software renderer).
//
// Day and night run on their own clock in real seconds (dayNight.js), the
// same one the inside of a hex uses: the sun crosses from east to west, dusk
// and dawn fade the light, and at night a dimmer moonlight keeps the map
// readable while windows glow where people live. The seasons follow the
// sim's day of the year (seasons.js), easing in rather than jumping. Light
// alone redraws at most every LIGHT_FRAME_MS (TWILIGHT_FRAME_MS while it
// fades) and moves the shadows at most every SHADOW_MS.

import { loadThree, probeGl, addLights, aimSun } from './threeLoad.js';
import { daylight, sunArc, moonArc } from './dayNight.js';
import { seasonLook, seasonAmount, looksDiffer } from './seasons.js';
import { DioramaWorld } from './dioramaWorld.js';
import { RISE_MS, GAME_TILT_DEG, VIEW_PLANE, tiltKy, riseAt, rayHex } from './diorama.js';
import { hexColours } from '../render/palette.js';
import { HEX_SIZE } from '../render/layout.js';

const PEOPLE_FRAME_MS = 400; // as the 2D renderer: new head counts are drawn at most this often
const SOFTWARE_MAX_DPR = 1;
const BACKGROUND = 0x0b0e13;
const BACKGROUND_NIGHT = 0x04060b;
const LIGHT_FRAME_MS = 250;
const TWILIGHT_FRAME_MS = 33;
const SOFTWARE_LIGHT_MS = 500;
const SHADOW_MS = 400;
const SEASON_EASE_S = 0.35; // the seasons' look catches up with the calendar over about this long
const STEADY_EASE_S = 1.5; // the steady look (100× and Max) eases in and out over about this long
const SKY_DAY = 0xe4f0ff; const SKY_NIGHT = 0x5d74b8;
const GROUND_DAY = 0x30384a; const GROUND_NIGHT = 0x161b2b;
const SUN = 0xfff1d6; const SUN_LOW = 0xff9a52; const MOON = 0x9fb6ff;

const mixHex = (a, b, t) => {
  const ch = (s) => ((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (Math.round(ch(16)) << 16) | (Math.round(ch(8)) << 8) | Math.round(ch(0));
};
const RING = 0xffffff;

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ky = tiltKy(GAME_TILT_DEG);
    this.map = null;
    this.world = null;
    this.software = false;
    this.selected = -1;
    this.lastDraw = -Infinity;
    this.pending = { pop: null, settlements: null, buildings: null };
    this.dirtyWorld = false;
    this.riseStart = -1; // render time the tiles began rising, -1 when risen
    /** Render time (ms) when the day/night clock read 0 (see setClock). */
    this.clockStart = -4000;
    this.lastShadow = -Infinity;
    /** The seasons: the look the calendar asks for, and the look on show. */
    this.lookWant = null; this.lookShown = null; this.lookPainted = null; this.lastLookAt = 0;
    this.steady = false; this.steadyMix = 0;
    /** Mirrors the 2D renderer's people layer; step 1 of the 3D map draws no individual people. */
    this.people = { shown: false };
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => { this.reducedMotion = e.matches; });
  }

  async init() {
    const soft = probeGl();
    if (soft === null) throw new Error('WebGL is unavailable');
    this.software = soft;
    const T = await loadThree();
    this.T = T;
    const renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: !soft, powerPreference: 'high-performance' });
    renderer.setClearColor(BACKGROUND, 1);
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    // Shadows only change with the world, so they are drawn again only then.
    renderer.shadowMap.autoUpdate = false;
    this.renderer = renderer;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.sun = addLights(T, this.scene, !soft, 2048);
    this.sky = this.scene.children.find((o) => o.isHemisphereLight);
    this.moon = new T.DirectionalLight(MOON, 0);
    this.scene.add(this.moon, this.moon.target);
    this.diorama = new DioramaWorld(T, { shadows: !soft });
    const ring = new T.RingGeometry(0.8, 1, 6, 1, Math.PI / 6);
    ring.rotateX(-Math.PI / 2);
    this.ring = new T.Mesh(ring, new T.MeshBasicMaterial({ color: RING, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 1;
    this.scene.add(this.ring);
    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  }

  get still() { return this.reducedMotion || this.software; }

  /** types is unused in 3D for now (the 2D map marks buildings by civ type). */
  setMap(map) {
    this.map = map;
    this.scene.add(this.diorama.build(map, hexColours(map)));
    aimSun(this.sun, this.diorama.board);
    this.moon.target.position.copy(this.sun.target.position);
    this.moon.target.updateMatrixWorld();
    this.lookPainted = null;
    this.pending = { pop: null, settlements: null, buildings: null };
    this.year = { pop: null, settlements: null, buildings: [], levels: null };
    this.selected = -1;
    this.riseStart = this.still ? -1 : 0;
    this.dirtyWorld = true;
  }

  setBuildings(list) {
    if (!this.map || !list || list === this.year.buildings) return false;
    this.year.buildings = list;
    this.dirtyWorld = true;
    return true;
  }

  /** Each civ's level (1 to 5): a civ at level 1 lives in huts. Returns whether anything changed. */
  setLevels(levels) {
    if (!this.map || !levels) return false;
    const old = this.year.levels;
    if (old && old.length === levels.length && old.every((v, k) => v === levels[k])) return false;
    this.year.levels = levels;
    this.dirtyWorld = true;
    return true;
  }

  setSettlements(data, now = performance.now(), force = false) {
    if (!this.map || !data) return false;
    if (!force) { this.pending.settlements = data; return false; }
    this.year.settlements = data;
    this.pending.settlements = null;
    this.dirtyWorld = true;
    return true;
  }

  setPopulation(data) {
    if (!this.map || !data) return;
    this.pending.pop = data;
  }

  setMoving() {}
  selectPerson() {}
  personAt() { return null; }
  personPosition() { return null; }

  /** Start the day/night clock at `seconds` (it runs on from there in real time). */
  setClock(seconds, now = performance.now()) { this.clockStart = now - seconds * 1000; }

  /** Seconds on the day/night clock at render time `now`. */
  clock(now = performance.now()) { return (now - this.clockStart) / 1000; }

  /**
   * Steady look (at 100× and Max): the light eases to a summer noon and stays there, and the
   * seasons' look fades to plain summer, while the clock and the calendar run on underneath.
   */
  setSteady(on) { this.steady = on; }

  /** The sim's day of the year (0 = first day of spring) and how many years pass a second (0 when paused). */
  setDay(day, yearsPerSecond) {
    if (day < 0) return;
    this.lookWant = seasonLook(day, this.steady ? 0 : seasonAmount(yearsPerSecond));
    if (!this.lookShown || this.still) this.lookShown = { ...this.lookWant };
  }

  /** Whether a redraw is due with nothing else changed: tiles rising, light changing, the season easing, or new head counts waiting. */
  needsFrame(now) {
    if (!this.map) return false;
    if (this.riseStart >= 0) return true;
    if (this.steadyMix !== (this.steady ? 1 : 0) && now - this.lastDraw >= TWILIGHT_FRAME_MS) return true;
    const d = this.dayAt(now);
    const every = this.software ? SOFTWARE_LIGHT_MS : d > 0 && d < 1 ? TWILIGHT_FRAME_MS : LIGHT_FRAME_MS;
    if (now - this.lastDraw >= every) return true;
    if (looksDiffer(this.lookShown, this.lookWant, 0.002) && now - this.lastDraw >= TWILIGHT_FRAME_MS) return true;
    return (this.pending.pop || this.pending.settlements) !== null && now - this.lastDraw >= PEOPLE_FRAME_MS;
  }

  resize(cssW, cssH, dpr) {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(this.software ? Math.min(dpr, SOFTWARE_MAX_DPR) : Math.min(dpr, 2));
    this.renderer.setSize(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)), false);
  }

  /** Hex under screen point (sx, sy), or -1. */
  hexAt(sx, sy, camera) {
    if (!this.map) return -1;
    const w = camera.screenToWorld(sx, sy);
    const d = this.diorama;
    return rayHex(this.map.cols, this.map.rows, w.x / HEX_SIZE, w.y / HEX_SIZE, (i) => d.topOf(i) * (d.tiles.rise[i] < 0 ? 1 : d.tiles.rise[i]));
  }

  /** Screen point (CSS px) of the middle of hex `index`'s top. */
  hexToScreen(index, camera) {
    const d = this.diorama;
    const p = camera.worldToScreen(d.tiles.cx[index] * HEX_SIZE, d.tiles.cz[index] * HEX_SIZE);
    const lift = (d.topOf(index) - VIEW_PLANE) * Math.sin((GAME_TILT_DEG * Math.PI) / 180) * camera.scale * HEX_SIZE;
    return { x: p.x, y: p.y - lift };
  }

  /** Hex of a building or wonder drawn under screen point (sx, sy), or -1. */
  buildingAt(sx, sy, camera) {
    const hex = this.hexAt(sx, sy, camera);
    return hex >= 0 && (this.diorama.show?.monument[hex] ?? -1) >= 0 ? hex : -1;
  }

  /** Daylight on show at `now`: the clock's, pulled towards full day by the steady look. */
  dayAt(now) {
    const day = daylight(this.clock(now));
    return day + (1 - day) * this.steadyMix;
  }

  draw(camera, selected = -1, now = performance.now()) {
    if (!this.renderer || !this.map) return;
    const dt = Math.min(0.25, Math.max(0, (now - this.lastDraw) / 1000));
    this.lastDraw = now;
    // The steady look comes and goes over STEADY_EASE_S rather than jumping.
    const goal = this.steady ? 1 : 0;
    const step = this.still ? 1 : dt / STEADY_EASE_S;
    this.steadyMix = goal > this.steadyMix ? Math.min(goal, this.steadyMix + step) : Math.max(goal, this.steadyMix - step);
    this.light(now);
    this.season(dt);
    const d = this.diorama;
    // New head counts and settlements wait for this redraw (see needsFrame).
    if (this.pending.pop) { this.year.pop = this.pending.pop; this.pending.pop = null; this.dirtyWorld = true; }
    if (this.pending.settlements) { this.year.settlements = this.pending.settlements; this.pending.settlements = null; this.dirtyWorld = true; }
    let rising = false;
    if (this.riseStart === 0) this.riseStart = now;
    if (this.riseStart > 0) {
      const u = Math.min(1, (now - this.riseStart) / RISE_MS);
      const { dist } = d.tiles;
      if (this.dirtyWorld && this.year.pop) d.setYear(this.year);
      d.place((i) => riseAt(u, dist[i]));
      this.dirtyWorld = false;
      rising = true;
      if (u >= 1) this.riseStart = -1;
    } else if (this.dirtyWorld) {
      if (this.year.pop) d.setYear(this.year);
      d.place(() => 1);
      this.dirtyWorld = false;
      rising = true;
    }
    if (rising || now - this.lastShadow >= SHADOW_MS) { this.renderer.shadowMap.needsUpdate = true; this.lastShadow = now; }
    this.placeRing(selected);
    this.placeCamera(camera);
    this.renderer.render(this.scene, this.camera);
  }

  /** Day and night: sky light, the sun and moon on their arcs, the background, and the lights where people live. */
  light(now) {
    const t = this.clock(now);
    const day = this.dayAt(now);
    const mix = this.steadyMix;
    const b = this.diorama.board;
    const full = Math.max(b.w, b.d);
    this.sky.intensity = 0.8 + 1.1 * day;
    this.sky.color.setHex(mixHex(SKY_NIGHT, SKY_DAY, day));
    this.sky.groundColor.setHex(mixHex(GROUND_NIGHT, GROUND_DAY, day));
    // Low sun at dawn and dusk turns warm.
    const warm = day > 0 && day < 1 ? 1 - Math.abs(day * 2 - 1) : 0;
    this.sun.color.setHex(mixHex(SUN, SUN_LOW, warm));
    this.sun.intensity = 2.6 * day;
    // The steady look swings the sun to noon (half its arc).
    const sa = (sunArc(t) + (0.5 - sunArc(t)) * mix) * Math.PI;
    this.sun.position.set(b.cx + Math.cos(sa) * full * 0.9, full * (0.25 + 0.9 * Math.sin(sa)), b.cz - full * 0.7);
    this.moon.intensity = 0.55 * (1 - day);
    const ma = (moonArc(t) + (0.5 - moonArc(t)) * mix) * Math.PI;
    this.moon.position.set(b.cx + Math.cos(ma) * full * 0.9, full * (0.3 + 0.8 * Math.sin(ma)), b.cz - full * 0.5);
    this.renderer.setClearColor(mixHex(BACKGROUND_NIGHT, BACKGROUND, day), 1);
    this.diorama.setGlow(1 - day);
  }

  /** Ease the seasons' look on show toward the calendar's, repainting when it has moved. */
  season(dt) {
    const want = this.lookWant; const shown = this.lookShown;
    if (!want || !shown) return;
    const k = this.still ? 1 : Math.min(1, dt / SEASON_EASE_S);
    for (const key of ['snow', 'autumn', 'spring']) shown[key] += (want[key] - shown[key]) * k;
    if (looksDiffer(shown, this.lookPainted)) {
      this.diorama.setLook({ ...shown });
      this.lookPainted = { ...shown };
    }
  }

  placeRing(selected) {
    const d = this.diorama;
    this.ring.visible = selected >= 0;
    if (selected < 0) return;
    const r = d.tiles.rise[selected];
    this.ring.position.set(d.tiles.cx[selected], d.topOf(selected) * (r < 0 ? 1 : r) + 0.012, d.tiles.cz[selected]);
  }

  /** Put the three.js camera where it shows what the shared Camera has on screen. */
  placeCamera(camera) {
    const cam = this.camera;
    const px = camera.scale * HEX_SIZE; // screen px per hex radius
    const w = camera.viewW / px / 2; const h = camera.viewH / px / 2;
    cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h;
    const c = camera.screenToWorld(camera.viewW / 2, camera.viewH / 2);
    const x = c.x / HEX_SIZE; const z = c.y / HEX_SIZE;
    const a = (GAME_TILT_DEG * Math.PI) / 180;
    const dist = 400;
    cam.position.set(x, VIEW_PLANE + dist * Math.cos(a), z + dist * Math.sin(a));
    cam.near = dist - 200; cam.far = dist + 200;
    cam.lookAt(x, VIEW_PLANE, z);
    cam.updateProjectionMatrix();
  }

  /** Stop drawing into the canvas and free the GPU memory (switching back to 2D). */
  dispose() {
    this.diorama?.dispose();
    this.renderer?.dispose();
  }
}
