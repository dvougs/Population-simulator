// Floating card describing the tapped hex.

import { h, formatNumber } from './dom.js';

const MATERIAL_KIND = { forest: 'wood', hills: 'stone' };

export function renderInspector(el, hex, onClose) {
  if (!hex) {
    el.hidden = true;
    el.removeAttribute('data-index');
    return;
  }
  el.hidden = false;
  el.dataset.index = String(hex.index);
  const rows = [
    ['Food', `${formatNumber(hex.food)} / ${formatNumber(hex.foodCap)}`],
    ['Food capacity', formatNumber(hex.foodCap)],
    ['Materials', hex.materials > 0 ? `${formatNumber(hex.materials)} (${MATERIAL_KIND[hex.terrain]})` : 'None'],
    ['Movement cost', hex.moveCost === null ? 'Impassable' : String(hex.moveCost)],
    ['Defence bonus', hex.defence > 0 ? `+${Math.round(hex.defence * 100)}%` : '0%'],
  ];
  if (hex.river) rows.splice(2, 0, ['River', 'Yes (fertile)']);
  el.replaceChildren(
    h('header', {},
      h('h3', { id: 'inspector-title' }, hex.name, h('small', {}, ` (${hex.col}, ${hex.row})`)),
      h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Close hex details', onclick: onClose }, '✕')),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', { 'data-field': k.toLowerCase().replace(/ /g, '-') }, v)])),
  );
}
