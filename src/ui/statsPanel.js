// Bottom-sheet statistics: live population per civ.

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';

/** One row per civ: type and level, men and women, people alive and hexes held; extinct civs are dimmed with their year. */
export function renderCivStats(listEl, stats) {
  listEl.replaceChildren(...stats.civs.map((c, k) => h('li', { 'data-civ': c.id, class: c.pop === 0 ? 'dead' : undefined },
    emblem(k),
    h('span', { class: 'name' }, c.extinctYear !== null ? `${c.name} (died out, year ${c.extinctYear})` : c.name,
      c.typeName ? h('small', {}, ` ${c.typeName}`) : null,
      c.level ? h('small', { class: 'lvl' }, ` · L${c.level}`) : null,
      c.pop > 0 && c.women !== undefined ? h('small', { class: 'sexes' }, ` · ${formatNumber(c.men)} men, ${formatNumber(c.women)} women`) : null),
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
