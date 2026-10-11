// Floating card describing the tapped hex.

import { h, formatNumber } from './dom.js';

const MATERIAL_KIND = { forest: 'wood', hills: 'stone' };

export function renderInspector(el, hex, onClose) {
  if (!hex) {
    el.hidden = true;
    el.removeAttribute('data-index');
    el.removeAttribute('data-shown');
    return;
  }
  el.hidden = false;
  el.dataset.index = String(hex.index);
  const rows = [
    ['People', peopleText(hex)],
    ['Food', `${formatNumber(hex.food)} / ${formatNumber(hex.foodCap)}`],
    ['Food capacity', formatNumber(hex.foodCap)],
    ['Materials', hex.materials > 0 ? `${formatNumber(hex.materials)} (${MATERIAL_KIND[hex.terrain]})` : 'None'],
    ['Movement cost', hex.moveCost === null ? 'Impassable' : String(hex.moveCost)],
    ['Defence bonus', hex.defence > 0 ? `+${Math.round(hex.defence * 100)}%` : '0%'],
  ];
  if (hex.river) rows.splice(3, 0, ['River', 'Yes (fertile)']);
  // Same hex already shown: update the values in place, so the card (and its
  // close button) is not rebuilt under the player's finger as years pass.
  const dds = el.querySelectorAll('dd');
  if (el.dataset.shown === String(hex.index) && dds.length === rows.length) {
    rows.forEach(([, v], k) => { if (dds[k].textContent !== v) dds[k].textContent = v; });
    return;
  }
  el.dataset.shown = String(hex.index);
  el.replaceChildren(
    h('header', {},
      h('h3', { id: 'inspector-title' }, hex.name, h('small', {}, ` (${hex.col}, ${hex.row})`)),
      h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Close hex details', onclick: onClose }, '✕')),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', { 'data-field': k.toLowerCase().replace(/ /g, '-') }, v)])),
  );
}

function peopleText(hex) {
  if (!hex.people) return 'None';
  const parts = (hex.peopleByCiv ?? []).map((n, c) => (n > 0 ? `Civ ${c + 1}: ${formatNumber(n)}` : null)).filter(Boolean);
  return `${formatNumber(hex.people)} (${parts.join(', ')})`;
}
