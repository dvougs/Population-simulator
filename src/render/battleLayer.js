// Battles and sieges on the map (RULES.md "How civs and people look"). Each
// battle under way gets a small crossed-swords badge in the middle of its hex:
// rimmed half in the attacker's colour (left) and half in the defender's
// (right), with two thin bars under it, each side's fit warriors ÷ the
// warriors it called up (attacker on top). A besieged hex also gets a ring of
// short dashes round the hex in the attacker's colour.
//
// There are only ever a few battles, so they show at every zoom; the badge is
// kept at least MIN_PX on screen so it stays readable on a phone far out.
// Cheap: SimHost.battles() is compared by a small signature, a badge's static
// part is drawn once per battle, the bars only when a side's share crosses a
// BAR_STEPS step, and per frame only a scale check when the zoom changed.

import { Container, Graphics } from '../../vendor/pixi.mjs';
import { hexCentre, HEX_SIZE } from './layout.js';
import { civStyle } from './civStyle.js';
import { rgbToHex } from './palette.js';

const CASING = 0x0b0e13;
const STEEL = 0xe8ecf1;
/** Badge radius in local units (a hex is HEX_SIZE 32 from centre to corner). */
const R = 10;
/** Smallest on-screen badge radius in CSS px. */
const MIN_PX = 12;
const BAR_W = 2 * R;
const BAR_H = 2.6;
const BAR_STEPS = 20;
/** Siege ring: dashes on a circle of RING_R × HEX_SIZE. */
const RING_R = 0.8;
const DASHES = 12;
const DASH_SHARE = 0.55;

const colourOf = (c) => rgbToHex(civStyle(c).rgb);
const share = (fit, start) => (start > 0 ? Math.round((Math.min(fit, start) / start) * BAR_STEPS) : 0);

/** Crossed swords on a dark disc, rimmed in the two sides' colours. */
function drawBadge(g, att, def) {
  g.clear();
  g.circle(0, 0, R).fill({ color: CASING, alpha: 0.85 });
  g.moveTo(0, -R).arc(0, 0, R, -Math.PI / 2, Math.PI / 2, true).stroke({ width: 2.6, color: colourOf(att) });
  g.moveTo(0, R).arc(0, 0, R, Math.PI / 2, -Math.PI / 2, true).stroke({ width: 2.6, color: colourOf(def) });
  // Two blades, hilts at the bottom corners, with cross-guards.
  g.moveTo(-5.5, 5.5).lineTo(5, -5).moveTo(5.5, 5.5).lineTo(-5, -5)
    .stroke({ width: 1.9, color: STEEL, cap: 'round' });
  g.moveTo(-5.6, 2.4).lineTo(-2.4, 5.6).moveTo(5.6, 2.4).lineTo(2.4, 5.6)
    .stroke({ width: 1.6, color: STEEL, cap: 'round' });
}

/** The two strength bars under the badge: attacker on top, defender below. */
function drawBars(g, att, def, a, d) {
  g.clear();
  const x = -BAR_W / 2;
  const y0 = R + 2.5;
  const y1 = y0 + BAR_H + 1.4;
  g.rect(x - 1, y0 - 1, BAR_W + 2, 2 * BAR_H + 3.4).fill({ color: CASING, alpha: 0.85 });
  if (a > 0) g.rect(x, y0, (BAR_W * a) / BAR_STEPS, BAR_H).fill({ color: colourOf(att) });
  if (d > 0) g.rect(x, y1, (BAR_W * d) / BAR_STEPS, BAR_H).fill({ color: colourOf(def) });
}

/** A ring of short dashes round the hex in the besieger's colour, over a dark casing. */
function drawRing(g, att) {
  g.clear();
  const r = RING_R * HEX_SIZE;
  const step = (2 * Math.PI) / DASHES;
  for (const [width, color] of [[4.2, CASING], [2.4, colourOf(att)]]) {
    for (let k = 0; k < DASHES; k++) {
      const a0 = k * step;
      const a1 = a0 + step * DASH_SHARE;
      g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
    }
    g.stroke({ width, color, cap: 'round' });
  }
}

export class BattleLayer {
  constructor(map) {
    this.cols = map.cols;
    this.container = new Container();
    /** hex → { badge, swords, bars, ring, look, bars key } */
    this.items = new Map();
    this.signature = '';
    this.camScale = -1;
  }

  /** Take SimHost.battles(); returns true if anything on the map changed. */
  setBattles(list) {
    let sig = '';
    for (const b of list) sig += `${b.hex},${b.attacker},${b.defender},${b.siege ? 1 : 0},${share(b.warriors[0], b.start[0])},${share(b.warriors[1], b.start[1])};`;
    if (sig === this.signature) return false;
    this.signature = sig;
    const seen = new Set();
    for (const b of list) {
      seen.add(b.hex);
      let it = this.items.get(b.hex);
      if (!it) {
        const c = hexCentre(this.cols, b.hex);
        it = { badge: new Container(), swords: new Graphics(), bars: new Graphics(), ring: new Graphics(), look: '', barKey: '' };
        it.badge.addChild(it.swords, it.bars);
        it.ring.position.set(c.x, c.y);
        it.badge.position.set(c.x, c.y);
        // Rings under every badge, so a badge is never crossed by a neighbour's ring.
        this.container.addChildAt(it.ring, 0);
        this.container.addChild(it.badge);
        this.items.set(b.hex, it);
        this.camScale = -1; // scale the new badge
      }
      const look = `${b.attacker},${b.defender}`;
      if (it.look !== look) { it.look = look; drawBadge(it.swords, b.attacker, b.defender); drawRing(it.ring, b.attacker); it.barKey = ''; }
      it.ring.visible = !!b.siege;
      const a = share(b.warriors[0], b.start[0]);
      const d = share(b.warriors[1], b.start[1]);
      const barKey = `${a},${d}`;
      if (it.barKey !== barKey) { it.barKey = barKey; drawBars(it.bars, b.attacker, b.defender, a, d); }
    }
    for (const [hex, it] of this.items) {
      if (seen.has(hex)) continue;
      it.badge.destroy({ children: true });
      it.ring.destroy();
      this.items.delete(hex);
    }
    return true;
  }

  /** Keep badges readable: at least MIN_PX across on screen; camScale is CSS px per world unit. */
  update(camScale) {
    if (camScale === this.camScale) return;
    this.camScale = camScale;
    const r = R * camScale;
    const s = r > 0 && r < MIN_PX ? MIN_PX / r : 1;
    for (const it of this.items.values()) it.badge.scale.set(s);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
