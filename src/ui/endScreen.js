// End screen: winner, reason and years run, the four buttons, and cards built
// from SimHost.report() (stats and records kept during the run, so it opens at once).
// The header, buttons, Civs and War cards come first; every other card is a
// native <details> that shows as one tappable row until opened, so a phone
// does not scroll past pages of detail. Closed cards are still in the DOM.

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';
import { civStyle } from '../render/civStyle.js';
import { rgbCss } from '../render/palette.js';
import { TRAITS, TRAIT_NAMES } from '../sim/traits.js';
import { MATERIAL_IDS, MATERIAL_NAMES } from '../sim/materials.js';
import { LEVEL_NAMES, MAX_LEVEL } from '../sim/levels.js';
import { amount } from './levelsPanel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Chart points per civ at most; longer histories are sampled evenly (the last row always kept). */
const CHART_POINTS = 400;

const civName = (c) => `Civ ${c + 1}`;
const civLabel = (c) => h('span', { class: 'civ-chip' }, emblem(c), civName(c));
const card = (id, title, ...body) => h('section', { class: 'card', id }, h('h2', {}, title), ...body);
/** A card that opens on tap: the summary row is the card's title. */
const fold = (id, title, open, ...body) => h('details', { class: 'card end-fold', id, open: open || undefined },
  h('summary', {}, h('h2', {}, title)), ...body);
const dl = (rows) => h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
const years = (a, b) => (a === b ? `year ${a}` : `years ${a} to ${b}`);
const pct = (n, total) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%');

/**
 * report: SimHost.report(). actions: { onKeepWatching, onSameAgain, onNewMap, onSetup }.
 */
export function renderEndScreen(el, report, actions) {
  el.replaceChildren(
    header(report),
    buttons(report, actions),
    civsCard(report),
    warCard(report),
    chartCard(report, true),
    levelChartCard(report),
    stockpileCard(report),
    traitsCard(report),
    peopleCard(report),
    deathsCard(report),
    recordsCard(report),
    historyCard(report),
  );
}

function header(r) {
  return h('section', { class: 'card end-header', id: 'end-summary' },
    h('p', { class: 'end-winner', id: 'end-winner' },
      r.winner === null ? 'No winner' : h('span', {}, 'Winner: ', civLabel(r.winner))),
    h('p', { class: 'end-reason', id: 'end-reason' }, r.endReason ?? 'Still running'),
    h('p', { class: 'end-years', id: 'end-years' }, `${formatNumber(r.tick)} ${r.tick === 1 ? 'year' : 'years'} run`));
}

function buttons(r, a) {
  return h('div', { class: 'end-actions' },
    // Watching an empty world is pointless, so Keep watching goes when everyone has died.
    r.endKind === 'extinction' ? null
      : h('button', { type: 'button', class: 'btn primary', id: 'btn-keep-watching', onclick: a.onKeepWatching }, 'Keep watching'),
    h('button', { type: 'button', class: 'btn', id: 'btn-same-again', onclick: a.onSameAgain }, 'Same settings again'),
    h('button', { type: 'button', class: 'btn', id: 'btn-new-map', onclick: a.onNewMap }, 'New map'),
    h('button', { type: 'button', class: 'btn', id: 'btn-end-setup', onclick: a.onSetup }, 'Back to setup'));
}

/** One compact block per civ: a head row and a line or two of facts (fights are in the War card). */
function civsCard(r) {
  const order = r.civs.slice().sort((x, y) => y.pop - x.pop || y.peakPop - x.peakPop || x.id - y.id);
  const facts = (c) => [
    c.typeName ?? null,
    c.level ? `level ${c.level} ${c.levelName}${c.reached?.[c.level - 1] ? ` since year ${c.reached[c.level - 1]}` : ''}` : null,
    `peak ${formatNumber(c.peakPop)} in year ${c.peakPopYear}`,
    `${formatNumber(c.peakHexes)} hexes at most`,
    c.avgLifespan === null ? 'no deaths' : `lived ${c.avgLifespan} years on average`,
    `switched in ${formatNumber(c.switchesIn)}, out ${formatNumber(c.switchesOut)}`,
    c.extinctYear === null ? null : `died out in year ${c.extinctYear}`,
  ].filter(Boolean).join(' · ');
  return card('end-civs', 'Civs by final population',
    h('ol', { class: 'end-civs' }, order.map((c) => h('li', { 'data-civ': c.id, class: c.pop === 0 ? 'dead' : undefined },
      h('div', { class: 'end-civ-head' }, civLabel(c.id), h('span', { class: 'num' }, `${formatNumber(c.pop)} people`)),
      h('p', { class: 'end-civ-facts' }, facts(c))))));
}

/** One war row as text (also used on How to play). */
export function warText(w) {
  const [a, b] = w.civs;
  return `${civName(a)} and ${civName(b)}, ${years(w.firstYear, w.lastYear)}: ${formatNumber(w.fights)} ${w.fights === 1 ? 'fight' : 'fights'}; `
    + `${civName(a)} won ${formatNumber(w.won[0])} and killed ${formatNumber(w.killed[0])}, `
    + `${civName(b)} won ${formatNumber(w.won[1])} and killed ${formatNumber(w.killed[1])}`;
}

/** Each pair of civs that ever fought, totals over the game, deadliest first (RULES.md "End screen", War). */
export function warCard(r) {
  const wars = r.records.wars ?? [];
  if (wars.length === 0) return card('end-war', 'War', h('p', { class: 'muted' }, 'No wars.'));
  const two = (x, y) => h('td', {}, h('span', {}, formatNumber(x)), h('span', {}, formatNumber(y)));
  return card('end-war', 'War',
    h('p', { class: 'muted' }, 'Every pair of civs that fought, deadliest first: fights won, and the other side\'s people killed.'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'end-war' },
        h('thead', {}, h('tr', {}, ['Sides', 'Years', 'Fights', 'Won', 'Killed'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, wars.map((w) => h('tr', { 'data-civs': w.civs.join(' '), title: warText(w) },
          h('th', { scope: 'row' }, civLabel(w.civs[0]), civLabel(w.civs[1])),
          h('td', {}, w.firstYear === w.lastYear ? String(w.firstYear) : `${w.firstYear}–${w.lastYear}`),
          h('td', {}, formatNumber(w.fights)),
          two(w.won[0], w.won[1]),
          two(w.killed[0], w.killed[1])))))));
}

/**
 * Population over time per civ: one SVG polyline each, no libraries. Also drawn
 * on How to play, as a plain card; on the end screen it folds but starts open.
 */
export function chartCard(r, folding = false) {
  const hist = r.history;
  const n = hist.rows;
  const civs = hist.civs;
  let maxPop = 1;
  for (let k = 0; k < hist.pop.length; k++) if (hist.pop[k] > maxPop) maxPop = hist.pop[k];
  const lastYear = n > 0 ? hist.years[n - 1] : 0;
  const W = 300;
  const H = 150;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Population of each civ from year 0 to year ${lastYear}; the highest is ${maxPop}`);
  for (const y of [0.25, 0.5, 0.75]) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '0'); line.setAttribute('x2', String(W));
    line.setAttribute('y1', String(H * y)); line.setAttribute('y2', String(H * y));
    line.setAttribute('class', 'grid');
    svg.append(line);
  }
  const step = Math.max(1, Math.ceil(n / CHART_POINTS));
  for (let c = 0; c < civs; c++) {
    const pts = [];
    for (let row = 0; row < n; row += step) pts.push(point(hist, row, c, lastYear, maxPop, W, H));
    if (n > 0 && (n - 1) % step !== 0) pts.push(point(hist, n - 1, c, lastYear, maxPop, W, H));
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', rgbCss(civStyle(c).rgb));
    line.setAttribute('stroke-width', '2');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('data-civ', String(c));
    svg.append(line);
  }
  const body = [
    h('div', { class: 'chart-wrap' },
      h('span', { class: 'chart-max' }, formatNumber(maxPop)),
      svg,
      h('div', { class: 'chart-x' }, h('span', {}, 'Year 0'), h('span', {}, `Year ${lastYear}`))),
    h('div', { class: 'chart-legend' }, Array.from({ length: civs }, (_, c) => civLabel(c))),
  ];
  return folding ? fold('end-chart', 'Population over time', true, ...body) : card('end-chart', 'Population over time', ...body);
}

/**
 * Level over time per civ: a step line each, levels 1 (bottom) to 5 (top).
 * Lines are nudged apart by civ so civs on the same level stay visible.
 */
function levelChartCard(r) {
  const hist = r.history;
  const n = hist.rows;
  const civs = hist.civs;
  const lastYear = n > 0 ? hist.years[n - 1] : 0;
  const W = 300;
  const H = 120;
  const pad = 8;
  const yOf = (level, c) => H - pad - ((level - 1) / (MAX_LEVEL - 1)) * (H - 2 * pad) + (c - (civs - 1) / 2) * 1.5;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'chart level-chart');
  svg.setAttribute('role', 'img');
  const top = r.civs.reduce((m, c) => Math.max(m, c.level ?? 1), 1);
  svg.setAttribute('aria-label', `Level of each civ from year 0 to year ${lastYear}; the highest at the end is level ${top}`);
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const line = document.createElementNS(SVG_NS, 'line');
    const y = String(yOf(L, (civs - 1) / 2));
    line.setAttribute('x1', '0'); line.setAttribute('x2', String(W));
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('class', 'grid');
    svg.append(line);
  }
  const level = hist.level;
  const step = Math.max(1, Math.ceil(n / CHART_POINTS));
  for (let c = 0; c < civs; c++) {
    if (!level) break;
    const pts = [];
    let prev = 1;
    const at = (row) => {
      const x = lastYear > 0 ? (hist.years[row] / lastYear) * W : 0;
      const L = level[row * civs + c] || 1;
      // Steps: hold the old level until the year it changed.
      if (L !== prev && pts.length) pts.push(`${x.toFixed(1)},${yOf(prev, c).toFixed(1)}`);
      pts.push(`${x.toFixed(1)},${yOf(L, c).toFixed(1)}`);
      prev = L;
    };
    for (let row = 0; row < n; row += step) at(row);
    if (n > 0 && (n - 1) % step !== 0) at(n - 1);
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', rgbCss(civStyle(c).rgb));
    line.setAttribute('stroke-width', '2');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('data-civ', String(c));
    svg.append(line);
  }
  return fold('end-levels', 'Level over time', false,
    h('div', { class: 'level-chart-wrap' },
      h('ol', { class: 'level-axis', 'aria-hidden': 'true' }, LEVEL_NAMES.slice().reverse().map((name, k) => h('li', {}, `${MAX_LEVEL - k} ${name}`))),
      h('div', { class: 'chart-wrap' }, svg,
        h('div', { class: 'chart-x' }, h('span', {}, 'Year 0'), h('span', {}, `Year ${lastYear}`)))),
    h('ul', { class: 'level-reached' }, r.civs.map((c) => h('li', { 'data-civ': c.id }, civLabel(c.id),
      h('span', {}, ` ${(c.reached ?? []).map((y, k) => (y !== null && k > 0 ? `${LEVEL_NAMES[k]} in year ${y}` : null)).filter(Boolean).join(', ') || 'stayed Foragers'}`)))));
}

/** Each civ's stockpile at the end (materials it never had are left out). */
function stockpileCard(r) {
  const civs = r.civs.filter((c) => c.stockpile);
  const mats = MATERIAL_IDS.filter((id) => civs.some((c) => c.stockpile[id] > 0));
  if (civs.length === 0 || mats.length === 0) return fold('end-stockpiles', 'Stockpiles at the end', false, h('p', { class: 'muted' }, 'Nobody gathered anything.'));
  return fold('end-stockpiles', 'Stockpiles at the end', false,
    h('p', { class: 'muted' }, 'Materials gathered and not yet spent on levelling up.'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'end-traits end-stock' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Material'), civs.map((c) => h('th', { scope: 'col', 'data-civ': c.id }, civLabel(c.id))))),
        h('tbody', {}, mats.map((id) => h('tr', { 'data-material': id },
          h('th', { scope: 'row' }, MATERIAL_NAMES[MATERIAL_IDS.indexOf(id)]),
          civs.map((c) => h('td', {}, amount(c.stockpile[id])))))))));
}

function point(hist, row, c, lastYear, maxPop, W, H) {
  const x = lastYear > 0 ? (hist.years[row] / lastYear) * W : 0;
  const y = H - (hist.pop[row * hist.civs + c] / maxPop) * H;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

/** Each civ's average traits at the end (or when it died out), with the change since its founders. */
function traitsCard(r) {
  const civs = r.civs.filter((c) => c.traits);
  if (civs.length === 0) return fold('end-traits', 'Traits', false, h('p', { class: 'muted' }, 'No traits recorded.'));
  const cell = (c, k) => {
    const end = c.traits[k];
    const d = c.startTraits ? end - c.startTraits[k] : 0;
    const sign = d > 0.0005 ? '+' : d < -0.0005 ? '−' : '±';
    return h('td', {}, end.toFixed(2), h('small', {}, ` ${sign}${Math.abs(d).toFixed(2)}`));
  };
  return fold('end-traits', 'Traits', false,
    h('p', { class: 'muted' }, 'Average of each trait (0 to 1) at the end, and the change since the founders.'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'end-traits' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Trait'), civs.map((c) => h('th', { scope: 'col', 'data-civ': c.id }, civLabel(c.id))))),
        h('tbody', {}, TRAITS.map((k, t) => h('tr', { 'data-trait': k },
          h('th', { scope: 'row' }, TRAIT_NAMES[t]), civs.map((c) => cell(c, k))))))));
}

const personText = (p) => `#${p.id}, ${civName(p.civ)}, age ${p.age}`;

function peopleCard(r) {
  const { oldestEver, oldestAlive } = r.records;
  let ever = 'Nobody';
  if (oldestEver) ever = `${personText(oldestEver)}${oldestEver.alive ? ' (alive)' : ` (died in year ${oldestEver.diedYear})`}`;
  return fold('end-people', 'People', false, dl([
    ['Oldest ever', ever],
    ['Oldest alive at the end', oldestAlive ? personText(oldestAlive) : 'Nobody'],
  ]));
}

function deathsCard(r) {
  const { oldAge, starvation, war } = r.deaths;
  const total = oldAge + starvation + war;
  const bar = (n, cls) => h('span', { class: `bar ${cls}`, style: { width: pct(n, total) } });
  return fold('end-deaths', 'Deaths by cause', false,
    h('div', { class: 'death-bar', 'aria-hidden': 'true' }, bar(oldAge, 'old-age'), bar(starvation, 'starvation'), bar(war, 'war')),
    dl([
      ['Old age', `${formatNumber(oldAge)} (${pct(oldAge, total)})`],
      ['Starvation', `${formatNumber(starvation)} (${pct(starvation, total)})`],
      ['War', `${formatNumber(war)} (${pct(war, total)})`],
      ['Total', formatNumber(total)],
    ]));
}

function recordsCard(r) {
  const { longestLine: line, mostDescendants: most, worstFamine: famine } = r.records;
  const lineText = line.generations <= 1 ? '1 generation (founders only)'
    : `${line.generations} generations, from founder #${line.founderId} (${civName(line.civ)}) to #${line.personId}, born in year ${line.year}`;
  return fold('end-records', 'Records', false, dl([
    ['Longest family line', lineText],
    ['Most descendants', most ? `Founder #${most.id} (${civName(most.civ)}): ${formatNumber(most.descendants)}` : 'Nobody was born'],
    ['Worst famine', famine
      ? `${civName(famine.civ)}, ${years(famine.startYear, famine.endYear)}${famine.ongoing ? ' (still going)' : ''}: ${formatNumber(famine.deaths)} starved`
      : 'None'],
  ]));
}

/** One chronicle line as the end screen reads it (RULES.md "End screen", History). */
export function eventText(e) {
  if (e.type === 'extinction') return `${civName(e.civ)} died out`;
  if (e.type === 'contact') return `${civName(e.civ)} met ${civName(e.other)} at (${e.col}, ${e.row})`;
  if (e.type === 'milestone') return `${civName(e.civ)} passed ${formatNumber(e.people)} people`;
  if (e.type === 'level') return `${civName(e.civ)} reached level ${e.level}, ${LEVEL_NAMES[e.level - 1]}`;
  const share = e.startPop > 0 ? ` (${pct(e.deaths, e.startPop)} of its people)` : '';
  return `Famine in ${civName(e.civ)}${e.ongoing ? ' (still going)' : ''}: ${formatNumber(e.deaths)} starved${share}${e.endYear > e.year ? ` by year ${e.endYear}` : ''}`;
}

/** The turning points only (RULES.md "End screen", History); fights are summed up in the War card. */
function historyCard(r) {
  const lines = r.records.chronicle ?? [];
  return fold('end-history', 'History', false,
    lines.length === 0 ? h('p', { class: 'muted' }, 'Nothing to report.')
      : h('ol', { class: 'end-log' }, lines.map((e) => h('li', { 'data-type': e.type, 'data-civ': e.civ },
        h('span', { class: 'log-year' }, `Year ${e.year}`), emblem(e.civ, 12), h('span', {}, eventText(e))))));
}
