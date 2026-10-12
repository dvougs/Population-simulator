// Floating card describing the tapped hex (with its people) or the tapped person.

import { h, formatNumber } from './dom.js';
import { emblemSvg } from '../render/civStyle.js';
import { MATERIAL_IDS, MATERIAL_NAMES } from '../sim/materials.js';
import { TRAITS, TRAIT_NAMES } from '../sim/traits.js';
import { BUILDINGS } from '../sim/buildings.js';
import { CIV_TYPE_NAMES } from '../sim/civTypes.js';
import { LEVEL_NAMES } from '../sim/levels.js';
import { rgbCss } from '../render/palette.js';
import { civStyle } from '../render/civStyle.js';

const materialName = (id) => MATERIAL_NAMES[MATERIAL_IDS.indexOf(id)] ?? id;

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
  const dds = el.querySelectorAll(':scope > dl > dd'); // not the building cards' rows
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
    ['Deposits', hex.deposits?.length ? hex.deposits.map(materialName).join(', ') : 'None'],
    ['Gathering', gatheringText(hex), () => gatheringNodes(hex)],
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
      h('div', { class: 'settlement-card' }),
      h('div', { class: 'building-cards' }),
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
  fillSettlement(el.querySelector('.settlement-card'), hex.settlement);
  fillBuildingCards(el.querySelector('.building-cards'), hex.buildings ?? []);
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

const whole = (v) => formatNumber(Math.floor(v + 1e-9));

/** Routes in plain words: "from 3 hexes: 12 food, 5 materials". */
function routeText(list, dir) {
  if (!list.length) return null;
  let food = 0;
  let mat = 0;
  const hexes = new Set();
  for (const r of list) { food += r.food; mat += r.materials; hexes.add(r.hex); }
  const goods = [food >= 0.5 ? `${whole(food)} food` : null, mat >= 0.5 ? `${whole(mat)} materials` : null].filter(Boolean).join(', ') || 'a little';
  return `${dir} ${hexes.size} ${hexes.size === 1 ? 'hex' : 'hexes'}: ${goods}`;
}

/** The settlement in the hex (RULES.md "Settlements"): tier, people and housing, store, its buildings and routes. */
function fillSettlement(box, st) {
  if (!box) return;
  if (!st) { box.hidden = true; box.dataset.key = ''; return; }
  const store = Object.entries(st.store).map(([id, v]) => `${materialName(id).toLowerCase()} ${whole(v)}`).join(', ');
  const own = st.buildings.map((b) => (b.status === 'standing' ? b.name
    : b.status === 'building' ? `${b.name} (building ${b.years > 0 ? Math.floor((b.work / b.years) * 100) : 0}%)`
      : `${b.name} (planned, needs ${Object.entries(b.cost).map(([id, v]) => `${v} ${materialName(id).toLowerCase()}`).join(', ')})`));
  const routes = [routeText(st.routesIn, 'In from'), routeText(st.routesOut, 'Out to')].filter(Boolean).join('. ');
  const rows = [
    ['People', `${formatNumber(st.people)} of ${formatNumber(st.housing)} houses`],
    ['Store', `${store || 'empty'} (holds ${formatNumber(st.storeCap)} of each)`],
    ['Buildings', `${own.length ? own.join(', ') : 'none yet'} (${st.buildings.filter((b) => b.status === 'standing').length} of ${st.slots} slots)`],
    ['Routes', routes || 'none this year'],
  ];
  const key = `${st.name}|${st.tier}|${st.holder}|${st.capital}|${rows.map((r) => r[1]).join('|')}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.hidden = false;
  box.dataset.tier = String(st.tier);
  box.replaceChildren(
    h('h4', {}, emblem(st.holder, 14), st.name, h('span', { class: 'tag' }, st.tierName), st.capital ? h('span', { class: 'tag wonder-tag' }, 'Capital') : null),
    h('dl', { class: 'building-facts' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', { 'data-field': `settlement-${k.toLowerCase()}` }, v)])));
}

/** The civ type whose era building has this id (BUILDINGS), or null. */
function typeOfBuilding(id) {
  for (const [type, list] of Object.entries(BUILDINGS)) if (list.some((b) => b.id === id)) return type;
  return null;
}

/** Status in plain words: "Building 34% (10 of 30 work years)", "Standing", "Abandoned". */
export function buildingStatus(b) {
  if (b.status === 'building') {
    const share = b.years > 0 ? Math.floor((b.work / b.years) * 100) : 0;
    return `Building ${share}% (${b.work} of ${b.years} work years)`;
  }
  return b.status === 'abandoned' ? 'Abandoned' : 'Standing';
}

/** One card per building or wonder in the hex (RULES.md "Buildings and wonders"), rebuilt only when one changes. */
function fillBuildingCards(box, list) {
  if (!box) return;
  const key = list.map((b) => `${b.kind}${b.id}${b.civ}${b.status}${b.work}${b.captures ?? ''}`).join(';');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.hidden = list.length === 0;
  box.replaceChildren(...list.map(buildingCard));
}

function buildingCard(b) {
  const wonder = b.kind === 'wonder';
  const owned = b.civ >= 0;
  const type = wonder ? null : typeOfBuilding(b.id);
  const what = wonder ? `Wonder of era ${b.era} (${LEVEL_NAMES[b.era - 1]})`
    : `Era ${b.era} building of Civ ${b.civ + 1}${type ? ` (${CIV_TYPE_NAMES[type] ?? type})` : ''}`;
  const ownerName = owned ? `Civ ${b.civ + 1}` : 'Nobody';
  const rows = [
    ['Owner', ownerName, () => (owned ? [emblem(b.civ, 12), ownerName] : [ownerName])],
    ['Status', buildingStatus(b)],
  ];
  if (wonder && b.year !== undefined) {
    rows.push(['Built', `by Civ ${b.builder + 1} in year ${b.year}`, () => ['by ', emblem(b.builder, 12), `Civ ${b.builder + 1} in year ${b.year}`]]);
    rows.push(['Captured', b.captures === 1 ? 'once' : b.captures ? `${b.captures} times` : 'never']);
  }
  const off = b.status === 'abandoned' ? ' (off until someone settles here)' : b.status === 'building' ? ' (once it stands)' : '';
  const style = { borderLeftColor: owned ? rgbCss(civStyle(b.civ).rgb) : 'var(--text-dim)' };
  return h('section', { class: `building-card${wonder ? ' wonder' : ''}`, 'data-building': b.id, 'data-status': b.status, style },
    h('h4', {}, wonder ? h('span', { class: 'tag wonder-tag' }, 'Wonder') : null, b.name),
    h('p', { class: 'building-what' }, what),
    h('dl', { class: 'building-facts' }, rows.flatMap(([k, v, build]) => [h('dt', {}, k), h('dd', {}, build ? build() : v)])),
    h('p', { class: 'building-bonus-head' }, `Bonuses for its civ${off}`),
    h('ul', { class: 'building-bonuses' }, b.bonuses.map((t) => h('li', {}, t))));
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

const oneDecimal = (v) => (Math.floor(v * 10 + 1e-9) / 10).toFixed(1);

/** One civ's gathering in the hex: materials worked, gatherers and this year's take. */
function gatherPart(g) {
  const what = g.materials.length ? `${g.materials.map(materialName).join(', ').toLowerCase()}, ${oneDecimal(g.gatherers)} gatherers` : 'won the yield in a fight';
  return `Civ ${g.civ + 1}: ${what}; got ${oneDecimal(g.amount)}`;
}

function gatheringText(hex) {
  const list = hex.gathering ?? [];
  return list.length ? list.map(gatherPart).join('. ') : 'Nobody';
}

/** Same text as gatheringText, one line per civ with its emblem. */
function gatheringNodes(hex) {
  const list = hex.gathering ?? [];
  if (!list.length) return ['Nobody'];
  return list.flatMap((g, k) => [k > 0 ? '. ' : null, emblem(g.civ, 12), gatherPart(g)].filter((x) => x !== null));
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
    ...TRAITS.map((k, t) => [TRAIT_NAMES[t], person.traits ? person.traits[k].toFixed(2) : '–']),
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
