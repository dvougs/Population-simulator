// End screen: winner, reason and years run, the four buttons, and cards built
// from SimHost.report() (stats and records kept during the run, so it opens at once).

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';
import { civStyle } from '../render/civStyle.js';
import { rgbCss } from '../render/palette.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Chart points per civ at most; longer histories are sampled evenly (the last row always kept). */
const CHART_POINTS = 400;

const civName = (c) => `Civ ${c + 1}`;
const civLabel = (c) => h('span', { class: 'civ-chip' }, emblem(c), civName(c));
const card = (id, title, ...body) => h('section', { class: 'card', id }, h('h2', {}, title), ...body);
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
    chartCard(report),
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

function civsCard(r) {
  const order = r.civs.slice().sort((x, y) => y.pop - x.pop || y.peakPop - x.peakPop || x.id - y.id);
  return card('end-civs', 'Civs by final population',
    h('ol', { class: 'end-civs' }, order.map((c) => h('li', { 'data-civ': c.id, class: c.pop === 0 ? 'dead' : undefined },
      h('div', { class: 'end-civ-head' }, civLabel(c.id), h('span', { class: 'num' }, `${formatNumber(c.pop)} people`)),
      dl([
        ['Peak population', `${formatNumber(c.peakPop)} in year ${c.peakPopYear}`],
        ['Average lifespan', c.avgLifespan === null ? 'No deaths' : `${c.avgLifespan} years`],
        ['Peak hexes held', formatNumber(c.peakHexes)],
        ['Died out', c.extinctYear === null ? 'No' : `Year ${c.extinctYear}`],
      ])))));
}

/** Population over time per civ: one SVG polyline each, no libraries. */
function chartCard(r) {
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
  return card('end-chart', 'Population over time',
    h('div', { class: 'chart-wrap' },
      h('span', { class: 'chart-max' }, formatNumber(maxPop)),
      svg,
      h('div', { class: 'chart-x' }, h('span', {}, 'Year 0'), h('span', {}, `Year ${lastYear}`))),
    h('div', { class: 'chart-legend' }, Array.from({ length: civs }, (_, c) => civLabel(c))));
}

function point(hist, row, c, lastYear, maxPop, W, H) {
  const x = lastYear > 0 ? (hist.years[row] / lastYear) * W : 0;
  const y = H - (hist.pop[row * hist.civs + c] / maxPop) * H;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

const personText = (p) => `#${p.id}, ${civName(p.civ)}, age ${p.age}`;

function peopleCard(r) {
  const { oldestEver, oldestAlive } = r.records;
  let ever = 'Nobody';
  if (oldestEver) ever = `${personText(oldestEver)}${oldestEver.alive ? ' (alive)' : ` (died in year ${oldestEver.diedYear})`}`;
  return card('end-people', 'People', dl([
    ['Oldest ever', ever],
    ['Oldest alive at the end', oldestAlive ? personText(oldestAlive) : 'Nobody'],
  ]));
}

function deathsCard(r) {
  const { oldAge, starvation } = r.deaths;
  const total = oldAge + starvation;
  const bar = (n, cls) => h('span', { class: `bar ${cls}`, style: { width: pct(n, total) } });
  return card('end-deaths', 'Deaths by cause',
    h('div', { class: 'death-bar', 'aria-hidden': 'true' }, bar(oldAge, 'old-age'), bar(starvation, 'starvation')),
    dl([
      ['Old age', `${formatNumber(oldAge)} (${pct(oldAge, total)})`],
      ['Starvation', `${formatNumber(starvation)} (${pct(starvation, total)})`],
      ['Total', formatNumber(total)],
    ]));
}

function recordsCard(r) {
  const { longestLine: line, mostDescendants: most, worstFamine: famine } = r.records;
  const lineText = line.generations <= 1 ? '1 generation (founders only)'
    : `${line.generations} generations, from founder #${line.founderId} (${civName(line.civ)}) to #${line.personId}, born in year ${line.year}`;
  return card('end-records', 'Records', dl([
    ['Longest family line', lineText],
    ['Most descendants', most ? `Founder #${most.id} (${civName(most.civ)}): ${formatNumber(most.descendants)}` : 'Nobody was born'],
    ['Worst famine', famine
      ? `${civName(famine.civ)}, ${years(famine.startYear, famine.endYear)}${famine.ongoing ? ' (still going)' : ''}: ${formatNumber(famine.deaths)} starved`
      : 'None'],
  ]));
}

function historyCard(r) {
  const { events, eventsDropped } = r.records;
  const text = (e) => (e.type === 'extinction'
    ? `${civName(e.civ)} died out`
    : `Famine in ${civName(e.civ)}${e.ongoing ? ' (still going)' : ''}: ${formatNumber(e.deaths)} starved${e.endYear > e.year ? ` by year ${e.endYear}` : ''}`);
  return card('end-history', 'History',
    events.length === 0 ? h('p', { class: 'muted' }, 'No famines or extinctions.')
      : h('ol', { class: 'end-log' }, events.map((e) => h('li', { 'data-type': e.type, 'data-civ': e.civ },
        h('span', { class: 'log-year' }, `Year ${e.year}`), emblem(e.civ, 12), h('span', {}, text(e))))),
    eventsDropped > 0 ? h('p', { class: 'muted' }, `${formatNumber(eventsDropped)} later famines not listed.`) : null);
}
