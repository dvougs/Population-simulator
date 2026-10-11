// Bottom-sheet statistics: live population per civ, and hexes of each terrain.

import { h, formatNumber } from './dom.js';
import { rgbCss, TERRAIN_RGB } from '../render/palette.js';
import { TERRAIN_NAMES } from '../sim/terrain.js';
import { emblem } from './inspector.js';

export function renderStats(listEl, stats) {
  const rows = TERRAIN_NAMES.map((name, t) => ({ name, t, n: stats.terrainCounts[t] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.t - b.t);
  listEl.replaceChildren(...rows.map((r) => h('li', { 'data-terrain': r.t },
    h('span', { class: 'swatch', style: { background: rgbCss(TERRAIN_RGB[r.t]) } }),
    h('span', { class: 'name' }, r.name),
    h('span', { class: 'num' }, formatNumber(r.n), h('small', {}, 'hexes')),
  )));
}

/** One row per civ: people alive and hexes held; extinct civs are dimmed with their year. */
export function renderCivStats(listEl, stats) {
  listEl.replaceChildren(...stats.civs.map((c, k) => h('li', { 'data-civ': c.id, class: c.pop === 0 ? 'dead' : undefined },
    emblem(k),
    h('span', { class: 'name' }, c.extinctYear !== null ? `${c.name} (died out, year ${c.extinctYear})` : c.name),
    h('span', { class: 'num' }, formatNumber(c.pop), h('small', {}, 'people')),
    h('span', { class: 'num' }, formatNumber(c.hexes), h('small', {}, 'hexes')),
  )));
}

/** HUD line under the totals: each civ's emblem and people alive (extinct civs dimmed). */
export function renderHudCivs(el, stats) {
  if (!el) return;
  el.replaceChildren(...stats.civs.map((c, k) => h('span', {
    class: c.pop === 0 ? 'hud-civ dead' : 'hud-civ',
    'data-civ': c.id,
    title: c.name,
  }, emblem(k, 12), h('span', { class: 'visually-hidden' }, `${c.name}: `), formatNumber(c.pop))));
}
