// Floating card describing the tapped hex (with its people) or the tapped person.

import { h, formatNumber } from './dom.js';
import { emblemSvg } from '../render/civStyle.js';

const MATERIAL_KIND = { forest: 'wood', hills: 'stone' };

/** A civ's emblem as a decorative inline element (no text, so it never changes a row's text). */
export function emblem(civ, size = 14) {
  const el = h('span', { class: 'emblem', 'aria-hidden': 'true' });
  el.innerHTML = emblemSvg(civ, size);
  return el;
}

function hide(el) {
  el.hidden = true;
  el.removeAttribute('data-index');
  el.removeAttribute('data-shown');
  el.removeAttribute('data-person');
  el.removeAttribute('data-list');
}

/**
 * Rows are [label, text, build?]: build() returns the nodes to show when the
 * row needs more than text (emblems); their text must equal `text`.
 */
function fillRows(el, rows) {
  const dds = el.querySelectorAll('dl > dd');
  if (dds.length !== rows.length) return false;
  rows.forEach(([, v, build], k) => {
    if (dds[k].textContent === v) return;
    if (build) dds[k].replaceChildren(...build());
    else dds[k].textContent = v;
  });
  return true;
}

const dl = (rows) => h('dl', {}, rows.flatMap(([k, v, build]) => [
  h('dt', {}, k),
  h('dd', { 'data-field': k.toLowerCase().replace(/ /g, '-') }, build ? build() : v),
]));

/**
 * Hex card. opts.people is SimHost.hexPeople() for this hex while the people
 * list is open (else null); opts.onToggleList() asks for it; opts.onPerson(slot, id)
 * opens a person's card.
 */
export function renderInspector(el, hex, onClose, opts = {}) {
  if (!hex) { hide(el); return; }
  el.hidden = false;
  el.dataset.index = String(hex.index);
  el.removeAttribute('data-person');
  el.onPerson = opts.onPerson;
  const rows = [
    ['People', peopleText(hex), () => peopleNodes(hex)],
    ['Food', `${formatNumber(hex.food)} / ${formatNumber(hex.foodCap)}`],
    ['Food capacity', formatNumber(hex.foodCap)],
    ['Materials', hex.materials > 0 ? `${formatNumber(hex.materials)} (${MATERIAL_KIND[hex.terrain]})` : 'None'],
    ['Movement cost', hex.moveCost === null ? 'Impassable' : String(hex.moveCost)],
    ['Defence bonus', hex.defence > 0 ? `+${Math.round(hex.defence * 100)}%` : '0%'],
  ];
  if (hex.river) rows.splice(3, 0, ['River', 'Yes (fertile)']);
  // Same hex already shown: update the values in place, so the card (and its
  // buttons) is not rebuilt under the player's finger as years pass.
  if (el.dataset.shown !== String(hex.index) || !fillRows(el, rows)) {
    el.dataset.shown = String(hex.index);
    el.removeAttribute('data-list');
    el.replaceChildren(
      h('header', {},
        h('h3', { id: 'inspector-title' }, hex.name, h('small', {}, ` (${hex.col}, ${hex.row})`)),
        h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Close hex details', onclick: onClose }, '✕')),
      dl(rows),
      h('button', {
        type: 'button',
        class: 'btn small people-toggle',
        'aria-expanded': 'false',
        onclick: () => {
          el.dataset.list = el.dataset.list === 'open' ? 'closed' : 'open';
          opts.onToggleList?.();
        },
      }),
      h('ul', { class: 'people-list', 'aria-label': 'People in this hex' }),
    );
  }
  const open = el.dataset.list === 'open';
  const toggle = el.querySelector('.people-toggle');
  toggle.hidden = !hex.people;
  toggle.setAttribute('aria-expanded', String(open));
  const label = open ? 'Hide people' : `List people (${formatNumber(hex.people)})`;
  if (toggle.textContent !== label) toggle.textContent = label;
  const list = el.querySelector('.people-list');
  list.hidden = !open || !hex.people;
  if (open && opts.people) fillPeopleList(el, list, opts.people);
}

/** The open list keeps its buttons and rewrites them in place, so a tap mid-update still lands on a button. */
function fillPeopleList(el, list, data) {
  const items = data.people;
  const more = data.total - items.length;
  const want = items.length + (more > 0 ? 1 : 0);
  while (list.children.length > want) list.lastElementChild.remove();
  items.forEach((p, k) => {
    let li = list.children[k];
    if (!li || !li.firstElementChild?.classList.contains('person-row')) {
      const btn = h('button', {
        type: 'button',
        class: 'person-row',
        onclick: () => el.onPerson?.(Number(btn.dataset.slot), Number(btn.dataset.id)),
      });
      const fresh = h('li', {}, btn);
      if (li) li.replaceWith(fresh); else list.append(fresh);
      li = fresh;
    }
    const btn = li.firstElementChild;
    const key = `${p.slot}:${p.id}:${p.civ}:${p.age}:${p.health}:${p.hunger}`;
    if (btn.dataset.key === key) return;
    btn.dataset.key = key;
    btn.dataset.slot = String(p.slot);
    btn.dataset.id = String(p.id);
    btn.replaceChildren(
      emblem(p.civ),
      h('span', { class: 'pid' }, `#${p.id}`),
      h('span', { class: 'pinfo' }, `Civ ${p.civ + 1} · age ${p.age} · health ${p.health}${p.hunger ? ' · hungry' : ''}`),
    );
  });
  if (more > 0) {
    let li = list.children[items.length];
    if (!li || li.firstElementChild) {
      li?.remove();
      li = h('li', { class: 'more' });
      list.append(li);
    }
    li.textContent = `and ${formatNumber(more)} more`;
  }
}

function peopleText(hex) {
  if (!hex.people) return 'None';
  const parts = (hex.peopleByCiv ?? []).map((n, c) => (n > 0 ? `Civ ${c + 1}: ${formatNumber(n)}` : null)).filter(Boolean);
  return `${formatNumber(hex.people)} (${parts.join(', ')})`;
}

/** Same text as peopleText, with each civ's emblem before its name. */
function peopleNodes(hex) {
  if (!hex.people) return ['None'];
  const out = [`${formatNumber(hex.people)} (`];
  let first = true;
  (hex.peopleByCiv ?? []).forEach((n, c) => {
    if (n <= 0) return;
    if (!first) out.push(', ');
    first = false;
    out.push(emblem(c, 12), `Civ ${c + 1}: ${formatNumber(n)}`);
  });
  out.push(')');
  return out;
}

/**
 * Person card. person is SimHost.person() data; with dead = true it shows the
 * last values seen. onShowHex opens the card of the hex they are in.
 */
export function renderPersonCard(el, person, { onClose, onShowHex, dead = false } = {}) {
  if (!person) { hide(el); return; }
  el.hidden = false;
  el.removeAttribute('data-index');
  el.dataset.person = String(person.id);
  const civName = `Civ ${person.civ + 1}`;
  const rows = [
    ['Status', dead ? 'Died' : 'Alive'],
    ['Civ', civName, () => [emblem(person.civ), civName]],
    ['Age', `${person.age} years`],
    ['Health', `${person.health} / 100`],
    ['Hunger', person.hunger === 0 ? 'Ate this year' : `${person.hunger} year${person.hunger === 1 ? '' : 's'} without food`],
    ['Parent', person.parent === null ? 'None (founder)' : `#${person.parent}${person.parentAlive ? '' : ' (died)'}`],
    ['Children', `${person.children} living`],
    ['Hex', `(${person.col}, ${person.row})`],
  ];
  const key = `p${person.id}`;
  if (el.dataset.shown === key && fillRows(el, rows)) return;
  el.dataset.shown = key;
  el.replaceChildren(
    h('header', {},
      h('h3', { id: 'inspector-title' }, emblem(person.civ, 16), ` Person #${person.id}`),
      h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Close person details', onclick: onClose }, '✕')),
    dl(rows),
    h('button', { type: 'button', class: 'btn small people-toggle', onclick: () => onShowHex?.() }, 'Show their hex'),
  );
}
