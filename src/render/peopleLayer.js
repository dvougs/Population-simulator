// People on the map (RULES.md "How civs and people look"). Zoomed out, each
// land hex with people shows its largest civ's emblem and its head count;
// zoomed in past PEOPLE_ZOOM_PX, every person in view is a tiny emblem sprite.
// Everything is a Sprite cut from one canvas-drawn texture atlas (emblems in
// white, tinted per civ, plus the digits for the counts), so there is no
// per-person Graphics and the whole layer batches into a few draws.
//
// Movement is render-side only: when a person's hex changes between two
// population snapshots, their sprite glides from where it was drawn to the new
// spot over MOVE_MS of render time. On top of that, while time runs, everyone
// idles: a slow circle of DRIFT_R around their spot, at a pace picked from their
// id, driven by a drift clock the renderer only advances while the game is not
// paused. The sim never sees any of this.

import { Container, Graphics, Rectangle, Sprite, Texture, CanvasSource } from '../../vendor/pixi.mjs';
import { hexCentre, HEX_SIZE } from './layout.js';
import { CIV_TINTS, traceEmblem, civStyle, EMBLEM_ORDER } from './civStyle.js';
import { hash32, personSpot, hexTotal, largestCiv, shortCount, LABEL_R, PERSON_R, SPREAD_R } from './peopleMaths.js';

// Moved to peopleMaths.js (no PixiJS there, so the How to play pictures can share them); re-exported for existing importers.
export { hexTotal, largestCiv, shortCount };

/** People are drawn one by one once a hex is at least this many CSS px across (corner to corner) on screen. */
export const PEOPLE_ZOOM_PX = 120;
/** Tapping a hex while zoomed out flies the camera in until a hex is this many CSS px across. */
export const PEOPLE_FLY_PX = 180;
/** Render time a migrating person takes to glide to their new hex. */
const MOVE_MS = 600;

const CELL = 64; // atlas cell, px
const CELL_R = 24; // emblem radius inside a cell, px
const WOMAN_DOT_R = 8; // the dark dot in a woman's emblem, px
const GLYPHS = '0123456789kM.';
// World sizes (HEX_SIZE is 32) of the count digits; emblem sizes are in spots.js.
const DIGIT_SPRITE = 0.62 * HEX_SIZE; // whole cell, so the digit itself is about 0.36 hex high
const DIGIT_ADVANCE = 0.3 * HEX_SIZE;
/** Idle drift: radius of each person's slow circle around their spot, and the slowest and fastest lap. */
export const DRIFT_R = 0.1 * HEX_SIZE;
export const DRIFT_LAP_MIN_S = 4;
export const DRIFT_LAP_MAX_S = 8;
const TAP_PX = 22; // half of the 44 px touch target

export function peopleShown(scale) {
  return 2 * HEX_SIZE * scale >= PEOPLE_ZOOM_PX;
}

/** One canvas: row 0 the eight emblems in white with a dark outline (men), rows 1 to 2 the count glyphs, row 3 the emblems with a dark dot in the middle (women). */
function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 8 * CELL;
  canvas.height = 4 * CELL; // powers of two, so mipmaps work on every WebGL
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  for (const row of [0, 3]) {
    EMBLEM_ORDER.forEach((emblem, k) => {
      const x = k * CELL + CELL / 2;
      const y = row * CELL + CELL / 2;
      traceEmblem(ctx, emblem, x, y, CELL_R);
      ctx.fillStyle = '#ffffff';
      ctx.fill('evenodd');
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0b0e13';
      ctx.stroke();
      if (row === 3) {
        // The tint colours the white; the dot stays dark, so women read at a glance in every civ colour.
        ctx.beginPath();
        ctx.arc(x, y, WOMAN_DOT_R, 0, 2 * Math.PI);
        ctx.fillStyle = '#0b0e13';
        ctx.fill();
      }
    });
  }
  ctx.font = 'bold 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#0b0e13';
  ctx.fillStyle = '#ffffff';
  [...GLYPHS].forEach((ch, k) => {
    const x = (k % 8) * CELL + CELL / 2;
    const y = (1 + Math.floor(k / 8)) * CELL + CELL / 2 + 2;
    ctx.strokeText(ch, x, y);
    ctx.fillText(ch, x, y);
  });
  const source = new CanvasSource({
    resource: canvas, width: canvas.width, height: canvas.height, resolution: 1, autoGenerateMipmaps: true,
  });
  const cut = (col, row) => new Texture({ source, frame: new Rectangle(col * CELL, row * CELL, CELL, CELL) });
  const emblems = {};
  const womenEmblems = {};
  EMBLEM_ORDER.forEach((e, k) => { emblems[e] = cut(k, 0); womenEmblems[e] = cut(k, 3); });
  const glyphs = {};
  [...GLYPHS].forEach((ch, k) => { glyphs[ch] = cut(k % 8, 1 + Math.floor(k / 8)); });
  return { source, emblems, womenEmblems, glyphs };
}

let atlas = null;
function getAtlas() {
  atlas ??= buildAtlas();
  return atlas;
}

/** Seconds person `id` takes for one lap of their idle drift: DRIFT_LAP_MIN_S to DRIFT_LAP_MAX_S. */
export function driftLap(id) {
  const hash = hash32(id ^ 0x5bd1e995);
  return DRIFT_LAP_MIN_S + ((DRIFT_LAP_MAX_S - DRIFT_LAP_MIN_S) * ((hash >>> 1) & 0xffff)) / 65535;
}

/** Person `id`'s drift speed in radians per second, signed for which way round they go. */
function driftRate(id) {
  return ((2 * Math.PI) / driftLap(id)) * (hash32(id ^ 0x5bd1e995) & 1 ? 1 : -1);
}

function driftPhase(id) {
  return (2 * Math.PI * (hash32(id ^ 0x5bd1e995) >>> 17)) / 32768;
}

export class PeopleLayer {
  constructor(map) {
    this.atlas = getAtlas();
    this.cols = map.cols;
    const n = map.cols * map.rows;
    this.hexX = new Float32Array(n);
    this.hexY = new Float32Array(n);
    for (let h = 0; h < n; h++) {
      const c = hexCentre(map.cols, h);
      this.hexX[h] = c.x;
      this.hexY[h] = c.y;
    }
    this.tints = CIV_TINTS;

    this.container = new Container();
    this.labels = new Container();
    this.peopleC = new Container();
    this.ring = new Graphics().circle(0, 0, PERSON_R * 2).stroke({ width: 1.2, color: 0xffffff, alignment: 0.5 });
    this.ring.visible = false;
    this.container.addChild(this.labels, this.peopleC, this.ring);

    this.hexLabels = new Array(n).fill(null);
    this.data = null;
    this.labelsDirty = false;

    // Per pool slot: who was drawn there, where they were heading and since when.
    this.cap = 0;
    this.high = 0;
    this.grow(256);
    this.pool = [];
    this.used = 0;
    this.visibleSlots = new Int32Array(0);
    this.animUntil = 0;
    this.shown = false;
    this.picked = { slot: -1, id: 0 };
    this.driftT = 0; // seconds of drift clock, set by the renderer each frame
  }

  grow(cap) {
    const g = (Type, prev) => { const a = new Type(cap); if (prev) a.set(prev); return a; };
    this.pAlive = g(Uint8Array, this.pAlive);
    this.pId = g(Uint32Array, this.pId);
    this.pHex = g(Int32Array, this.pHex);
    this.pCiv = g(Uint8Array, this.pCiv);
    this.pFemale = g(Uint8Array, this.pFemale);
    this.fromX = g(Float32Array, this.fromX);
    this.fromY = g(Float32Array, this.fromY);
    this.toX = g(Float32Array, this.toX);
    this.toY = g(Float32Array, this.toY);
    this.t0 = g(Float64Array, this.t0);
    this.drawX = g(Float32Array, this.drawX);
    this.drawY = g(Float32Array, this.drawY);
    this.dPhase = g(Float32Array, this.dPhase);
    this.dRate = g(Float32Array, this.dRate);
    this.cap = cap;
  }

  /** Take a new population snapshot (SimHost.population()) at render time `now`. */
  setPopulation(data, now) {
    this.data = data;
    this.labelsDirty = true;
    if (data.high > this.cap) this.grow(Math.max(data.high, this.cap * 2));
    for (let i = 0; i < data.high; i++) {
      if (!data.alive[i]) { this.pAlive[i] = 0; continue; }
      const id = data.id[i];
      const h = data.hex[i];
      const same = this.pAlive[i] && this.pId[i] === id;
      if (same && this.pHex[i] === h) continue; // most people, most years: nothing to redo
      const spot = personSpot(id, SPREAD_R);
      const tx = this.hexX[h] + spot.dx;
      const ty = this.hexY[h] + spot.dy;
      if (same) {
        // Moved: glide from wherever they are on their way now (drift rides on top throughout).
        this.glide(i, now);
        this.fromX[i] = this.drawX[i];
        this.fromY[i] = this.drawY[i];
        this.t0[i] = now;
        this.animUntil = Math.max(this.animUntil, now + MOVE_MS);
      } else {
        this.fromX[i] = tx;
        this.fromY[i] = ty;
        this.t0[i] = -Infinity;
        this.dPhase[i] = driftPhase(id);
        this.dRate[i] = driftRate(id);
      }
      this.pAlive[i] = 1;
      this.pId[i] = id;
      this.pHex[i] = h;
      this.pCiv[i] = data.civ[i];
      this.pFemale[i] = data.female ? data.female[i] : 0;
      this.toX[i] = tx;
      this.toY[i] = ty;
    }
    for (let i = data.high; i < this.high; i++) this.pAlive[i] = 0;
    this.high = data.high;
  }

  /** Where slot i is on its glide at render time now (no drift), into drawX/drawY. */
  glide(i, now) {
    const t = (now - this.t0[i]) / MOVE_MS;
    if (t >= 1) { this.drawX[i] = this.toX[i]; this.drawY[i] = this.toY[i]; return; }
    const e = t <= 0 ? 0 : t * t * (3 - 2 * t);
    this.drawX[i] = this.fromX[i] + (this.toX[i] - this.fromX[i]) * e;
    this.drawY[i] = this.fromY[i] + (this.toY[i] - this.fromY[i]) * e;
  }

  /** Drawn position of slot i at render time now, glide plus idle drift, into drawX/drawY. */
  position(i, now) {
    this.glide(i, now);
    const a = this.dPhase[i] + this.dRate[i] * this.driftT;
    this.drawX[i] += DRIFT_R * Math.cos(a);
    this.drawY[i] += DRIFT_R * Math.sin(a);
  }

  /** True while people are drawn and someone is still gliding, so the frame loop keeps redrawing. */
  animating(now) {
    return this.shown && now < this.animUntil;
  }

  selectPerson(slot, id) {
    this.picked = { slot, id };
  }

  /** Bring the layer up to date for this frame; driftT is the drift clock in seconds. */
  update(camera, now, driftT = this.driftT) {
    this.driftT = driftT;
    const shown = peopleShown(camera.scale);
    this.shown = shown;
    this.labels.visible = !shown;
    this.peopleC.visible = shown;
    if (!shown) {
      this.ring.visible = false;
      if (this.labelsDirty) this.updateLabels();
      return;
    }
    this.updatePeople(camera, now);
  }

  updateLabels() {
    this.labelsDirty = false;
    const d = this.data;
    if (!d) return;
    const civs = d.civs;
    const n = this.hexX.length;
    for (let h = 0; h < n; h++) {
      const total = hexTotal(d.hexCivPop, civs, h);
      let lab = this.hexLabels[h];
      if (total === 0) {
        if (lab && lab.box.visible) { lab.box.visible = false; lab.total = 0; }
        continue;
      }
      lab ??= this.makeLabel(h);
      lab.box.visible = true;
      const best = largestCiv(d.hexCivPop, civs, h);
      if (lab.civ !== best) {
        lab.civ = best;
        lab.emblem.texture = this.atlas.emblems[civStyle(best).emblem];
        lab.emblem.tint = this.tints[best % this.tints.length];
      }
      if (lab.total !== total) {
        lab.total = total;
        const text = shortCount(total);
        const x0 = -((text.length - 1) * DIGIT_ADVANCE) / 2;
        for (let k = 0; k < lab.glyphs.length; k++) {
          const g = lab.glyphs[k];
          if (k >= text.length) { g.visible = false; continue; }
          g.visible = true;
          g.texture = this.atlas.glyphs[text[k]];
          g.x = x0 + k * DIGIT_ADVANCE;
        }
      }
    }
  }

  makeLabel(h) {
    const box = new Container();
    box.position.set(this.hexX[h], this.hexY[h]);
    const emblem = new Sprite(this.atlas.emblems[EMBLEM_ORDER[0]]);
    emblem.anchor.set(0.5);
    emblem.width = emblem.height = (CELL * LABEL_R) / CELL_R;
    emblem.y = -0.24 * HEX_SIZE;
    box.addChild(emblem);
    const glyphs = [];
    for (let k = 0; k < 4; k++) {
      const g = new Sprite(this.atlas.glyphs['0']);
      g.anchor.set(0.5);
      g.width = g.height = DIGIT_SPRITE;
      g.y = 0.36 * HEX_SIZE;
      g.visible = false;
      box.addChild(g);
      glyphs.push(g);
    }
    this.labels.addChild(box);
    const lab = { box, emblem, glyphs, civ: -1, total: -1 };
    this.hexLabels[h] = lab;
    return lab;
  }

  updatePeople(camera, now) {
    const s = camera.scale;
    const m = HEX_SIZE;
    const x0 = -camera.x / s - m;
    const y0 = -camera.y / s - m;
    const x1 = (camera.viewW - camera.x) / s + m;
    const y1 = (camera.viewH - camera.y) / s + m;
    if (this.visibleSlots.length < this.high) this.visibleSlots = new Int32Array(this.cap);
    const size = (CELL * PERSON_R) / CELL_R;
    let k = 0;
    for (let i = 0; i < this.high; i++) {
      if (!this.pAlive[i]) continue;
      const h = this.pHex[i];
      const hx = this.hexX[h];
      const hy = this.hexY[h];
      // Quick reject by hex (also catches a glide whose ends are both off screen).
      const fx = this.fromX[i];
      const fy = this.fromY[i];
      if ((hx < x0 || hx > x1 || hy < y0 || hy > y1) && (fx < x0 || fx > x1 || fy < y0 || fy > y1)) continue;
      this.position(i, now);
      let sp = this.pool[k];
      if (!sp) {
        sp = new Sprite(this.atlas.emblems[EMBLEM_ORDER[0]]);
        sp.anchor.set(0.5);
        sp.width = sp.height = size;
        this.pool.push(sp);
        this.peopleC.addChild(sp);
      }
      const c = this.pCiv[i];
      const tex = (this.pFemale[i] ? this.atlas.womenEmblems : this.atlas.emblems)[civStyle(c).emblem];
      if (sp.texture !== tex) sp.texture = tex;
      const tint = this.tints[c % this.tints.length];
      if (sp.tint !== tint) sp.tint = tint;
      sp.position.set(this.drawX[i], this.drawY[i]);
      sp.visible = true;
      this.visibleSlots[k++] = i;
    }
    for (let j = k; j < this.used; j++) this.pool[j].visible = false;
    this.used = k;

    const { slot, id } = this.picked;
    const on = slot >= 0 && slot < this.high && this.pAlive[slot] && this.pId[slot] === id;
    this.ring.visible = on;
    if (on) {
      this.position(slot, now);
      this.ring.position.set(this.drawX[slot], this.drawY[slot]);
    }
  }

  /** The person drawn nearest screen point (sx, sy), within the touch target, as { slot, id }; or null. */
  personAt(sx, sy, camera) {
    if (!this.shown) return null;
    const reach = Math.max(TAP_PX, PERSON_R * camera.scale);
    let best = -1;
    let bestD = reach * reach;
    for (let k = 0; k < this.used; k++) {
      const i = this.visibleSlots[k];
      const dx = camera.x + this.drawX[i] * camera.scale - sx;
      const dy = camera.y + this.drawY[i] * camera.scale - sy;
      const d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = i; }
    }
    return best < 0 ? null : { slot: best, id: this.pId[best] };
  }

  /** World position where person (slot, id) is drawn, or null. */
  personPosition(slot, id) {
    if (slot < 0 || slot >= this.high || !this.pAlive[slot] || this.pId[slot] !== id) return null;
    return this.shown ? { x: this.drawX[slot], y: this.drawY[slot] } : { x: this.toX[slot], y: this.toY[slot] };
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
