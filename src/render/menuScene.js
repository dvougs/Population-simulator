// The animated backdrop behind the home page, How to play and the new-game
// screens: one PixiJS Application on a fixed full-screen canvas (the second
// and last WebGL context; the game map has the other). It is created on the
// first menu screen shown and its ticker stops whenever no menu screen is on
// show, so it costs nothing during a game.
//
// Layers, back to front: drifting aurora glows, a faint hex grid with a few
// hexes lighting up in civ colours, the home page's living world (a floating
// board with a glow under it and clouds over it), drifting motes and a
// vignette. The living world is the real DemoWorld: HomeScreen hands over each
// year's population and the board crossfades to it, with a ripple wherever a
// hex was newly settled.
//
// Everything is decoration driven by render time, never by the sim. With
// reduced motion the ticker never runs: each change is drawn once, standing
// still. The same still drawing is used on a software WebGL renderer (no GPU,
// as in headless browsers), where every frame is read back by the CPU and a
// running animation would starve the page; there the living world is redrawn
// at most every LITE_MS. If WebGL is unavailable, init() fails quietly and the pages keep
// their Canvas 2D drawing (live stays false).

import { Application, Container, Graphics, Sprite, Texture, CanvasSource } from '../../vendor/pixi.mjs';
import { hexPolygon, hexCentre, riverSegments, worldBounds, HEX_SIZE } from './layout.js';
import { rgbToHex, RIVER_RGB } from './palette.js';
import { CIV_STYLES, EMBLEM_SHAPES, civStyle } from './civStyle.js';
import { TerritoryLayer } from './territoryLayer.js';
import { hexTotal, largestCiv, LABEL_R } from './peopleMaths.js';
import { DEEP_WATER } from '../sim/terrain.js';

const MAX_DPR = 2; // a phone's 3x backing store would triple the fill cost for no visible gain
const PAGE_DPR = 1.5; // the pages only show soft shapes behind cards
const PAGE_FPS = 30; // the pages' backdrop moves slowly; half the frames is plenty
const PAGE_START_MS = 2500; // how long a page opened first waits before its backdrop starts
const LITE_MS = 1000; // software renderer: at most one still redraw a second
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const FADE_MS = 150; // year-to-year crossfade, shorter than a year at 6 a second
const ENTER_MS = 900; // the board rising in when the home page opens
const CASING = 0x0b0e13;
const SLAB = 0.42 * HEX_SIZE; // depth of the board's edge under the hexes
const ACCENT = 0x5fb3ff;
const VIOLET = 0x8a6bff;
const WARM = 0xffb04a;
const GLOW_COLOURS = [ACCENT, VIOLET, 0x2fd3c0];
const LIT_COLOURS = [ACCENT, VIOLET, ...CIV_STYLES.slice(0, 6).map((s) => rgbToHex(s.rgb))];
const RIPPLES = 32;
const CLOUDS = 5;
const LIT = 22;
// Pointy-top hex corners for the backdrop grid, as unit offsets (no trigonometry per hex).
const HX = Math.sqrt(3) / 2;
const CORNERS = [HX, -0.5, HX, 0.5, 0, 1, -HX, 0.5, -HX, -0.5, 0, -1];

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t) => (t >= 1 ? 1 : 1 - (1 - t) * (1 - t) * (1 - t));

/** Small seeded generator, so the decoration lays out the same on every visit (and in screenshots). */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  return new Texture({ source: new CanvasSource({ resource: c, width: size, height: size, resolution: 1, autoGenerateMipmaps: true }) });
}

function buildTextures() {
  const radial = (stops) => (ctx, n) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [at, col] of stops) g.addColorStop(at, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  };
  return {
    glow: canvasTexture(256, radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']])),
    dot: canvasTexture(32, radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']])),
    vignette: canvasTexture(256, radial([[0, 'rgba(11,14,19,0)'], [0.55, 'rgba(11,14,19,0)'], [1, 'rgba(11,14,19,0.85)']])),
    hex: canvasTexture(128, (ctx, n) => {
      const r = n * 0.42;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx[k ? 'lineTo' : 'moveTo'](n / 2 + CORNERS[2 * k] * r, n / 2 + CORNERS[2 * k + 1] * r);
      ctx.closePath();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = n * 0.06;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.lineWidth = n * 0.03;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }),
    ring: canvasTexture(128, (ctx, n) => {
      ctx.beginPath();
      ctx.arc(n / 2, n / 2, n * 0.4, 0, 2 * Math.PI);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = n * 0.05;
      ctx.lineWidth = n * 0.05;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }),
  };
}

export class MenuScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = null;
    this.ready = null;
    this.live = false;
    this.mode = null; // 'home', 'page' or null
    this.t = 0; // decoration clock, seconds
    this.w = 0;
    this.h = 0;
    this.res = 1;
    this.hero = { x: 0, y: 0, w: 0, h: 0 };
    this.heroEl = null;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.board = null; // { map, ... } of the world on show
    this.frames = null;
    this.front = 0;
    this.fadeT0 = -1;
    this.enterT0 = -1;
    this.heroAlpha = 0;
    this.lastYear = -1;
    this.totals = null;
    this.onLive = null;
    this.lite = false;
    this.idle = 0; // pending idle callback that will create the Application
    this.liteTimer = 0;
    this.lastDraw = -Infinity;
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => { this.reduced = e.matches; this.setMode(this.mode, true); });
    this.onPointer = (e) => {
      if (e.pointerType !== 'mouse' || !this.w) return;
      this.parallax.tx = (e.clientX / this.w - 0.5) * 2;
      this.parallax.ty = (e.clientY / this.h - 0.5) * 2;
    };
  }

  /** Create the Application on first use; resolves to true when the scene draws, false without WebGL. */
  init() {
    this.ready ??= (async () => {
      try {
        const app = new Application();
        await app.init({
          canvas: this.canvas,
          preference: 'webgl',
          backgroundAlpha: 0,
          antialias: true,
          autoStart: false,
          sharedTicker: false,
          autoDensity: false,
          width: Math.max(1, window.innerWidth),
          height: Math.max(1, window.innerHeight),
          resolution: 1,
          eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
        });
        // Pixi falls back to its own canvas renderer without WebGL; full-screen effects there would be slow, so the pages keep their 2D drawing instead.
        const kind = app.renderer?.name;
        if (kind !== 'webgl') { try { app.destroy(); } catch { /* half-made app */ } throw new Error(`no WebGL (got ${kind})`); }
        app.stage.eventMode = 'none';
        this.app = app;
        this.lite = isSoftware(app.renderer.gl);
        this.tex = buildTextures();
        this.build();
        app.ticker.add((tk) => this.update(tk.deltaMS));
        this.live = true;
        this.canvas.classList.add('live');
        window.addEventListener('resize', () => { if (this.mode) this.resize(); });
        window.addEventListener('pointermove', this.onPointer, { passive: true });
        this.setMode(this.mode, true);
        this.onLive?.();
        return true;
      } catch (err) {
        console.warn('Menu backdrop unavailable, using the plain pages.', err);
        this.canvas.hidden = true;
        return false;
      }
    })();
    return this.ready;
  }

  build() {
    const { stage } = this.app;
    const rnd = prng(20261011);
    this.auroraC = new Container();
    this.glows = GLOW_COLOURS.map((tint, k) => {
      const s = new Sprite(this.tex.glow);
      s.anchor.set(0.5);
      s.tint = tint;
      s.blendMode = 'add';
      s.seed = { a: rnd() * 6.28, b: rnd() * 6.28, sp: 0.05 + 0.04 * k };
      this.auroraC.addChild(s);
      return s;
    });
    this.gridC = new Container();
    this.grid = new Graphics();
    this.litC = new Container();
    this.gridC.addChild(this.grid, this.litC);
    this.lit = [];
    for (let k = 0; k < LIT; k++) {
      const s = new Sprite(this.tex.hex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0;
      this.litC.addChild(s);
      this.lit.push({ s, t0: -rnd() * 6, dur: 4 + rnd() * 4, peak: 0 });
    }
    this.litRnd = rnd;

    this.heroC = new Container();
    this.heroGlow = new Sprite(this.tex.glow);
    this.heroGlow.anchor.set(0.5);
    this.heroGlow.tint = ACCENT;
    this.heroGlow.blendMode = 'add';
    this.heroWarm = new Sprite(this.tex.glow);
    this.heroWarm.anchor.set(0.5);
    this.heroWarm.tint = WARM;
    this.heroWarm.blendMode = 'add';
    this.heroShadow = new Sprite(this.tex.glow);
    this.heroShadow.anchor.set(0.5);
    this.heroShadow.tint = 0x000000;
    this.boardC = new Container();
    this.heroC.addChild(this.heroShadow, this.heroGlow, this.heroWarm, this.boardC);
    this.heroC.visible = false;

    this.motesC = new Container();
    this.motes = [];
    for (let k = 0; k < 70; k++) {
      const s = new Sprite(this.tex.dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = k % 5 === 0 ? WARM : k % 3 === 0 ? VIOLET : 0xcfe8ff;
      this.motesC.addChild(s);
      this.motes.push({ s, x: rnd(), y: rnd(), vx: (rnd() - 0.5) * 0.006, vy: -(0.006 + rnd() * 0.012), ph: rnd() * 6.28, size: 2 + rnd() * 4 });
    }
    this.vignette = new Sprite(this.tex.vignette);
    this.vignette.anchor.set(0.5);
    stage.addChild(this.auroraC, this.gridC, this.heroC, this.motesC, this.vignette);
  }

  /**
   * Show the scene for a screen: 'home' (backdrop and living world), 'page'
   * (backdrop only) or null (stopped and hidden, e.g. during a game).
   */
  setMode(mode, force = false) {
    if (mode === this.mode && !force) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'home' && !this.ready) this.init();
    // The pages' backdrop only fades in behind them, so its WebGL start-up (shader compiles, a hitch of tens of
    // milliseconds) waits until the page has settled and the browser is idle, never while someone starts typing.
    else if (mode && !this.ready && !this.idle) {
      const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 0));
      this.idle = setTimeout(() => idle(() => { this.idle = 0; if (!this.ready && this.mode) this.init(); }, { timeout: 2000 }), PAGE_START_MS);
    }
    if (!this.app) return;
    const { ticker } = this.app;
    if (!mode) {
      ticker.stop();
      clearTimeout(this.liteTimer);
      this.liteTimer = 0;
      this.canvas.classList.remove('on');
      return;
    }
    // A software renderer only draws the living world; the pages keep their still CSS backdrop.
    if (this.lite && mode === 'page') {
      ticker.stop();
      this.canvas.classList.remove('on');
      return;
    }
    this.canvas.classList.add('on');
    if (mode === 'home' && was !== 'home') this.enterT0 = this.t;
    this.res = this.lite ? 1 : Math.min(mode === 'home' ? MAX_DPR : PAGE_DPR, window.devicePixelRatio || 1);
    ticker.maxFPS = mode === 'home' ? 0 : PAGE_FPS;
    this.resize();
    if (this.still) {
      ticker.stop();
      this.heroAlpha = mode === 'home' ? 1 : 0;
      this.drawStill(true);
    } else ticker.start();
  }

  /** No running animation: reduced motion, or a software renderer. */
  get still() { return this.reduced || this.lite; }

  /** Draw one still frame (now, or within LITE_MS on a software renderer). */
  drawStill(now = false) {
    if (!this.app || !this.mode) return;
    const wait = this.lite && !now ? LITE_MS - (performance.now() - this.lastDraw) : 0;
    if (wait > 0) {
      this.liteTimer ||= setTimeout(() => { this.liteTimer = 0; this.drawStill(true); }, wait);
      return;
    }
    clearTimeout(this.liteTimer);
    this.liteTimer = 0;
    this.lastDraw = performance.now();
    this.update(0);
    this.app.render();
  }

  /** The element the living world sits over, and the element that scrolls it. */
  trackHero(el, scroller) {
    this.heroEl = el;
    const measure = () => { if (this.mode === 'home') this.measureHero(); };
    scroller.addEventListener('scroll', measure, { passive: true });
    new ResizeObserver(measure).observe(el);
  }

  measureHero() {
    if (!this.heroEl) return;
    const r = this.heroEl.getBoundingClientRect();
    this.hero.x = r.left; this.hero.y = r.top; this.hero.w = r.width; this.hero.h = r.height;
    if (this.still) this.drawStill();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const sizeChanged = w !== this.w || h !== this.h;
    this.w = w; this.h = h;
    this.app.renderer.resize(w, h, this.res);
    if (sizeChanged) this.layoutBackdrop();
    this.measureHero();
  }

  layoutBackdrop() {
    const { w, h } = this;
    const s = Math.round(Math.max(22, Math.min(34, Math.min(w, h) / 13)));
    this.cell = s;
    const dx = 2 * HX * s; const dy = 1.5 * s;
    const margin = 3 * s;
    const g = this.grid.clear();
    const cols = Math.ceil((w + 2 * margin) / dx) + 1;
    const rows = Math.ceil((h + 2 * margin) / dy) + 1;
    this.gridCols = cols; this.gridRows = rows; this.gridDx = dx; this.gridDy = dy; this.gridM = margin;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -margin + c * dx + (r & 1 ? dx / 2 : 0);
        const y = -margin + r * dy;
        g.moveTo(x + CORNERS[0] * s, y + CORNERS[1] * s);
        for (let k = 1; k < 6; k++) g.lineTo(x + CORNERS[2 * k] * s, y + CORNERS[2 * k + 1] * s);
        g.closePath();
      }
    }
    g.stroke({ width: 1, color: 0x9fc4ff, alpha: 0.075 });
    const big = Math.max(w, h);
    this.glows.forEach((sp) => { sp.width = sp.height = big * 1.1; });
    this.vignette.position.set(w / 2, h / 2);
    this.vignette.width = w * 1.5;
    this.vignette.height = h * 1.5;
    for (const l of this.lit) { l.s.width = l.s.height = 2 * s; this.placeLit(l); }
  }

  placeLit(l) {
    const rnd = this.litRnd;
    const c = Math.floor(rnd() * this.gridCols);
    const r = Math.floor(rnd() * this.gridRows);
    l.s.x = -this.gridM + c * this.gridDx + (r & 1 ? this.gridDx / 2 : 0);
    l.s.y = -this.gridM + r * this.gridDy;
    l.s.tint = LIT_COLOURS[Math.floor(rnd() * LIT_COLOURS.length)];
    l.peak = 0.1 + rnd() * 0.16;
    l.dur = 4 + rnd() * 5;
  }

  /** Build the floating board for a map (once per map). */
  setWorld(map, colours) {
    if (!this.app) return;
    // A restarted world is the same map: keep the board and crossfade the people back to their start.
    if (this.board && this.board.map.hash === map.hash) { this.board.map = map; return; }
    for (const child of this.boardC.removeChildren()) child.destroy({ children: true });
    const n = map.cols * map.rows;
    const slab = new Graphics();
    for (let i = 0; i < n; i++) slab.poly(hexPolygon(map.cols, i)).fill({ color: 0x06101c });
    slab.y = SLAB;
    const rim = new Graphics();
    for (let i = 0; i < n; i++) rim.poly(hexPolygon(map.cols, i)).fill({ color: 0x15385a });
    rim.y = SLAB * 0.45;
    const terrain = new Graphics();
    for (let i = 0; i < n; i++) terrain.poly(hexPolygon(map.cols, i)).fill({ color: rgbToHex(colours[i]) });
    const water = new Graphics();
    for (let i = 0; i < n; i++) if (map.terrain[i] === DEEP_WATER) water.poly(hexPolygon(map.cols, i)).fill({ color: 0xffffff });
    water.blendMode = 'add';
    const rivers = new Graphics();
    for (const [x0, y0, x1, y1] of riverSegments(map)) rivers.moveTo(x0, y0).lineTo(x1, y1);
    rivers.stroke({ width: HEX_SIZE * 0.22, color: rgbToHex(RIVER_RGB), cap: 'round', join: 'round' });
    const grid = new Graphics();
    for (let i = 0; i < n; i++) grid.poly(hexPolygon(map.cols, i));
    grid.stroke({ width: 1.2, color: 0x000000, alpha: 0.2 });

    const frame = () => {
      const territory = new TerritoryLayer(map);
      const tintC = new Container();
      tintC.addChild(territory.tint);
      const labels = new Graphics();
      const overC = new Container();
      overC.addChild(territory.rings, territory.outlines, labels);
      return { territory, tintC, overC, labels };
    };
    this.frames = [frame(), frame()];
    const ripples = new Container();
    this.ripples = [];
    for (let k = 0; k < RIPPLES; k++) {
      const s = new Sprite(this.tex.ring);
      s.anchor.set(0.5);
      s.visible = false;
      s.blendMode = 'add';
      ripples.addChild(s);
      this.ripples.push({ s, t0: -1 });
    }
    this.nextRipple = 0;
    const b = worldBounds(map.cols, map.rows);
    const clouds = new Container();
    const rnd = prng(7);
    this.clouds = [];
    for (let k = 0; k < CLOUDS; k++) {
      const s = new Sprite(this.tex.glow);
      s.anchor.set(0.5);
      s.width = (3 + rnd() * 3) * HEX_SIZE;
      s.height = s.width * (0.35 + rnd() * 0.15);
      clouds.addChild(s);
      this.clouds.push({ s, u: rnd(), y: b.minY + (0.1 + 0.8 * rnd()) * (b.maxY - b.minY), sp: 0.012 + rnd() * 0.014, a: 0.06 + rnd() * 0.07 });
    }
    this.boardC.addChild(slab, rim, terrain, this.frames[0].tintC, this.frames[1].tintC, rivers, water, grid,
      this.frames[0].overC, this.frames[1].overC, ripples, clouds);
    this.board = { map, b, water, n, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY + SLAB) / 2, bw: b.maxX - b.minX, bh: b.maxY - b.minY + SLAB };
    this.totals = new Int32Array(n);
    this.lastYear = -1;
    for (const f of this.frames) f.tintC.alpha = f.overC.alpha = 0;
  }

  /** A new year of the living world (SimHost.population() data). */
  setPopulation(pop, year) {
    if (!this.board || !pop) return;
    const back = 1 - this.front;
    const f = this.frames[back];
    f.territory.setPopulation(pop);
    f.territory.update(true);
    this.drawLabels(f.labels, pop);
    // Newly settled hexes ripple in their civ's colour (not on the first year shown, or after a restart).
    const { map, n } = this.board;
    const counts = pop.hexCivPop; const civs = pop.civs;
    const fresh = this.lastYear >= 0 && year > this.lastYear;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const total = map.terrain[i] === DEEP_WATER ? 0 : hexTotal(counts, civs, i);
      if (fresh && total > 0 && this.totals[i] === 0 && spawned < 6 && !this.still) {
        this.ripple(i, largestCiv(counts, civs, i));
        spawned++;
      }
      this.totals[i] = total;
    }
    this.lastYear = year;
    // The new frame goes on top and fades in; the old one stays until it is covered.
    const old = this.frames[this.front];
    for (const key of ['tintC', 'overC']) {
      const i = this.boardC.getChildIndex(old[key]);
      if (this.boardC.getChildIndex(f[key]) < i) this.boardC.setChildIndex(f[key], i);
    }
    this.front = back;
    if (this.still || !this.app.ticker.started) {
      f.tintC.alpha = f.overC.alpha = 1;
      this.frames[1 - back].tintC.alpha = this.frames[1 - back].overC.alpha = 0;
      this.fadeT0 = -1;
      this.drawStill();
    } else this.fadeT0 = this.t;
  }

  drawLabels(g, pop) {
    g.clear();
    const { map, n } = this.board;
    const counts = pop.hexCivPop; const civs = pop.civs;
    for (let i = 0; i < n; i++) {
      if (map.terrain[i] === DEEP_WATER || hexTotal(counts, civs, i) === 0) continue;
      const civ = largestCiv(counts, civs, i);
      const { x, y } = hexCentre(map.cols, i);
      const style = civStyle(civ);
      const paths = EMBLEM_SHAPES[style.emblem];
      const pts = (path) => path.flatMap(([px, py]) => [x + px * LABEL_R, y + py * LABEL_R]);
      g.poly(pts(paths[0])).fill({ color: rgbToHex(style.rgb) });
      if (paths.length > 1) g.poly(pts(paths[1])).cut();
      for (const path of paths) g.poly(pts(path)).stroke({ width: LABEL_R * 0.25, color: CASING, join: 'round' });
    }
  }

  ripple(i, civ) {
    const r = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
    const c = hexCentre(this.board.map.cols, i);
    r.s.position.set(c.x, c.y);
    r.s.tint = rgbToHex(civStyle(civ).rgb);
    r.s.visible = true;
    r.t0 = this.t;
  }

  update(deltaMS) {
    const dt = Math.min(50, deltaMS) / 1000;
    this.t += dt;
    const { t, w, h } = this;
    const home = this.mode === 'home';
    const still = this.still;
    const k = still ? 1 : 1 - Math.pow(0.002, dt); // frame-rate independent easing
    const px = this.parallax;
    if (!still) { px.x += (px.tx - px.x) * k * 0.6; px.y += (px.ty - px.y) * k * 0.6; }

    // Aurora: three glows wandering on slow Lissajous paths.
    for (let j = 0; j < this.glows.length; j++) {
      const g = this.glows[j]; const sd = g.seed;
      const a = still ? sd.a : sd.a + t * sd.sp;
      g.x = w * (0.5 + 0.42 * Math.cos(a)) - px.x * 10;
      g.y = h * (0.45 + 0.4 * Math.sin(a * 1.3 + sd.b)) - px.y * 10;
      g.alpha = (home ? 0.2 : 0.15) * (0.75 + 0.25 * Math.sin(a * 2.1));
    }

    // Grid: drifts a little (never wraps, so lit hexes stay on their cells) and follows the pointer.
    this.gridC.x = (still ? 0 : Math.sin(t * 0.05) * this.cell * 1.2) - px.x * 14;
    this.gridC.y = (still ? 0 : Math.cos(t * 0.04) * this.cell * 0.9) - px.y * 14;
    this.gridC.alpha = home ? 1 : 0.8;
    for (const l of this.lit) {
      let u = (t - l.t0) / l.dur;
      if (u >= 1 && !still) { this.placeLit(l); l.t0 = t; u = 0; }
      l.s.alpha = still ? l.peak * 0.5 : l.peak * Math.sin(Math.PI * Math.max(0, u));
    }

    // Motes rise and twinkle, wrapping round the screen.
    for (const m of this.motes) {
      if (!still) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.y < -0.05) { m.y = 1.05; m.x = (m.x + 0.37) % 1; }
        if (m.x < -0.05) m.x += 1.1; else if (m.x > 1.05) m.x -= 1.1;
      }
      m.s.x = m.x * w - px.x * 24;
      m.s.y = m.y * h - px.y * 24;
      m.s.width = m.s.height = m.size * (home ? 1 : 0.8);
      m.s.alpha = (home ? 0.55 : 0.35) * (0.45 + 0.55 * Math.abs(Math.sin(m.ph + t * 0.9)));
    }

    this.updateHero(dt, home, still);
  }

  updateHero(dt, home, still) {
    const target = home && this.board ? 1 : 0;
    this.heroAlpha = still ? target : this.heroAlpha + (target - this.heroAlpha) * Math.min(1, dt * 7);
    if (this.heroAlpha < 0.01) { this.heroC.visible = false; return; }
    this.heroC.visible = true;
    const { t } = this;
    const hb = this.hero; const bd = this.board;
    const enter = still || this.enterT0 < 0 ? 1 : easeOut((t - this.enterT0) / (ENTER_MS / 1000));
    const fit = Math.min(hb.w / bd.bw, hb.h / bd.bh) * 0.95;
    const breathe = still ? 1 : 1 + 0.012 * Math.sin(t * 0.35);
    const scale = fit * breathe * (0.9 + 0.1 * enter);
    const px = this.parallax;
    const cx = hb.x + hb.w / 2 + px.x * 8;
    const cy = hb.y + hb.h / 2 + (still ? 0 : Math.sin(t * 0.6) * 4) + (1 - enter) * 30 + px.y * 6;
    this.heroC.alpha = this.heroAlpha * enter;
    const bc = this.boardC;
    bc.pivot.set(bd.cx, bd.cy);
    bc.position.set(cx, cy);
    bc.scale.set(scale);
    bc.rotation = still ? 0 : Math.sin(t * 0.21) * 0.012 + px.x * 0.01;
    const size = Math.max(bd.bw, bd.bh) * scale;
    this.heroGlow.position.set(cx, cy);
    this.heroGlow.width = this.heroGlow.height = size * 1.9;
    this.heroGlow.alpha = 0.42 + (still ? 0 : 0.08 * Math.sin(t * 0.8));
    this.heroWarm.position.set(cx + size * 0.32, cy + size * 0.3);
    this.heroWarm.width = this.heroWarm.height = size * 1.1;
    this.heroWarm.alpha = 0.16;
    this.heroShadow.position.set(cx, cy + size * 0.12);
    this.heroShadow.width = size * 1.25;
    this.heroShadow.height = size * 1.05;
    this.heroShadow.alpha = 0.7;

    // Year crossfade: the new frame fades in over the old, then the old fades out.
    const front = this.frames[this.front]; const back = this.frames[1 - this.front];
    if (this.fadeT0 >= 0) {
      const u = Math.min(1, (t - this.fadeT0) / (FADE_MS / 1000));
      front.overC.alpha = smooth(u / 0.6);
      back.overC.alpha = 1 - smooth((u - 0.6) / 0.4);
      front.tintC.alpha = u; back.tintC.alpha = 1 - u;
      if (u >= 1) this.fadeT0 = -1;
    }
    bd.water.alpha = still ? 0.03 : 0.035 + 0.035 * Math.sin(t * 0.8);
    for (const r of this.ripples) {
      if (r.t0 < 0) continue;
      const u = (t - r.t0) / 1.1;
      if (u >= 1) { r.s.visible = false; r.t0 = -1; continue; }
      r.s.width = r.s.height = HEX_SIZE * (0.8 + 1.8 * easeOut(u));
      r.s.alpha = 0.85 * (1 - u);
    }
    const span = bd.bw + 8 * HEX_SIZE;
    for (const c of this.clouds) {
      const u = still ? c.u : (c.u + t * c.sp) % 1;
      c.s.x = bd.b.minX - 4 * HEX_SIZE + u * span;
      c.s.y = c.y;
      c.s.alpha = c.a * Math.sin(Math.PI * u);
    }
  }
}

/** Whether a WebGL context is drawn in software (no GPU), from the driver's renderer string where the browser shares it. */
function isSoftware(gl) {
  try {
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
    return SOFTWARE_GL.test(String(name ?? ''));
  } catch {
    return false;
  }
}
