// Home page (RULES.md "Home page"): the first screen. New game, How to play,
// and a small world living behind them, a year at a time. The world is drawn
// by the menu scene (menuScene.js, PixiJS) as a floating board that crossfades
// from year to year; without WebGL, or until the scene is ready, the game's
// Canvas 2D map code draws it instead. It only runs while the page is shown,
// and stands still for people who ask for reduced motion.
//
// While the 3D graphics flag (flags.js) is on, the same world is drawn in 3D
// by homeScene3d.js over the 2D board, which fades out under it. The 2D / 3D
// switch that turns the flag on and off is on the game settings screen; this
// screen still drives it, so the switch shows the 3D world's state.

import { h, formatNumber } from './dom.js';
import { DemoWorld, DEMO } from './demoWorld.js';
import { drawWorld } from '../render/miniMap.js';
import { emblem } from './inspector.js';
import { TRAITS } from '../sim/traits.js';
import { CIV_TYPES } from '../sim/civTypes.js';
import { LEVEL_NAMES } from '../sim/levels.js';
import { LIMITS } from '../sim/params.js';

const HERO = { rings: true, labels: true, pad: 0.05 };

export class HomeScreen {
  /**
   * els: { canvas, caption, points, figure, toggle }; scene: the MenuScene (or null);
   * scene3d: the HomeScene3D (or null); flags: the feature flags (createFlags), or null.
   */
  constructor({ canvas, caption, points, figure, toggle }, scene = null, { scene3d = null, flags = null } = {}) {
    this.canvas = canvas;
    this.caption = caption;
    this.figure = figure;
    this.scene = scene;
    this.scene3d = scene3d;
    this.flags = flags;
    this.toggle = toggle ?? null;
    this.world = null;
    this.active = false;
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
      this.reduced = e.matches;
      if (this.active) this.setActive(true);
    });
    // Each point wears one of the first civs' emblems, so the page speaks the map's language.
    const point = (civ, title, text) => h('li', {},
      h('span', { class: 'point-icon' }, emblem(civ, 18)), h('strong', {}, title), h('span', {}, text));
    points.replaceChildren(
      point(0, 'Every person', 'lives a life of their own'),
      point(1, `${TRAITS.length} traits`, 'passed from parent to child'),
      point(2, `${CIV_TYPES.length} civ types`, `up to ${LIMITS.civCount.max} civs a world`),
      point(3, `${LEVEL_NAMES[0]} to ${LEVEL_NAMES[LEVEL_NAMES.length - 1]}`, `in ${LEVEL_NAMES.length} levels`),
    );
    new ResizeObserver(() => { if (this.active && this.world && !this.scene?.live) this.draw(); }).observe(canvas);
    if (scene) {
      scene.onLive = () => {
        this.figure?.classList.add('live');
        if (this.world) scene.setWorld(this.world.map, this.world.colours);
        if (this.active && this.world) this.draw();
      };
    }
    if (scene3d && flags) this.wire3d();
  }

  /** The 2D / 3D switch, the flag behind it and the 3D world's crossfade with the 2D board. */
  wire3d() {
    const { scene3d, flags, toggle } = this;
    scene3d.onBlend = (a) => {
      this.scene?.setBoardFade(1 - a);
      // Without the menu scene the 2D drawing is on this canvas; it fades the other way too.
      this.canvas.style.opacity = a > 0 && !this.scene?.live ? String(1 - a) : '';
    };
    toggle?.addEventListener('click', () => flags.set('graphics3d', !flags.get('graphics3d')));
    flags.onChange((name) => { if (name === 'graphics3d') this.apply3d(); });
    this.apply3d();
  }

  /** Follow the 3D flag: load and rise into the 3D world, or sink back to the 2D board. */
  async apply3d() {
    const on = this.flags.get('graphics3d');
    this.syncToggle(on);
    const s3 = this.scene3d;
    if (!on) { s3.setOn(false); return; }
    if (!s3.ready) {
      this.toggle?.classList.add('busy');
      // Start from the flat board, so the first rise is seen as well.
      s3.setActive(this.active);
      if (this.world) { s3.setWorld(this.world.map, this.world.colours); s3.setYear(this.yearData()); }
    }
    const ok = await s3.init();
    this.toggle?.classList.remove('busy');
    if (!ok) { this.syncToggle(on, true); return; }
    // The flag may have been turned off again while three.js loaded.
    if (!this.flags.get('graphics3d')) return;
    if (this.world) { s3.setWorld(this.world.map, this.world.colours); s3.setYear(this.yearData()); }
    s3.setOn(true);
  }

  syncToggle(on, unavailable = false) {
    const t = this.toggle;
    if (!t) return;
    t.setAttribute('aria-checked', String(on && !unavailable));
    t.classList.toggle('on', on && !unavailable);
    if (unavailable) {
      t.disabled = true;
      t.title = 'This browser cannot draw 3D graphics (WebGL is unavailable).';
    }
  }

  /** The living world's year, as the 3D world takes it. */
  yearData() {
    const { host } = this.world;
    return { pop: host.population(), settlements: host.settlements(), buildings: host.buildings() };
  }

  /** Whether the 3D world is wanted or still on show (rising, risen or sinking back). */
  get uses3d() { return !!this.scene3d && (this.flags?.get('graphics3d') || this.scene3d.shown); }

  /** Start (true) or stop (false) the living world; called whenever the screen is shown or hidden. */
  setActive(on) {
    this.active = on;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scene3d?.setActive(on);
    if (!on) return;
    if (this.reduced) {
      if (!this.world || this.world.year !== DEMO.homeStillYear) {
        this.world = new DemoWorld();
        this.world.runTo(DEMO.homeStillYear);
      }
      this.draw();
      return;
    }
    if (!this.world) this.restart();
    this.draw();
    this.last = 0;
    this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  restart() {
    this.world = new DemoWorld();
    this.world.runTo(DEMO.homeStartYear);
  }

  frame(now) {
    if (!this.active) return;
    // Long gaps (tab in the background) do not pile up years.
    const dt = this.last ? Math.min(250, now - this.last) : 0;
    this.last = now;
    this.acc += dt;
    const step = 1000 / DEMO.homeYearsPerSecond;
    if (this.acc >= step) {
      this.acc %= step;
      const stats = this.world.host.stats();
      if (this.world.year >= DEMO.homeRestartYear || stats.totalPop === 0) this.restart();
      else this.world.host.tick(1);
      this.draw();
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  draw() {
    const { scene } = this;
    if (scene?.live) {
      scene.setWorld(this.world.map, this.world.colours);
      scene.setPopulation(this.world.host.population(), this.world.year);
    } else drawWorld(this.canvas, this.world.world(), HERO);
    if (this.uses3d) {
      this.scene3d.setWorld(this.world.map, this.world.colours);
      this.scene3d.setYear(this.yearData());
    }
    const s = this.world.host.stats();
    const alive = s.civs.filter((c) => c.pop > 0).length;
    this.caption.textContent = `Year ${s.tick} · ${formatNumber(s.totalPop)} people · ${alive} civs`;
  }
}
