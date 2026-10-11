// How to play (RULES.md "Home page"): the rules in plain words (howText.js,
// which reads every number from the game), with pictures of a real world drawn
// by the game itself: the map, its people, a year's walk, the civs, a border
// where they meet, their traits and levels, and the end screen's chart. The
// world is run once, while the home page is idle (or when the page first
// opens); the pictures are redrawn only when the page changes size.
//
// Presentation: the section links sit in the sticky header and follow the
// reader (the section in the middle of the screen is marked current), a thin
// bar under the header shows how far down the page is, and each section
// fades up as it scrolls into view (not with reduced motion; see main.css).

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';
import { renderLevels } from './levelsPanel.js';
import { chartCard, eventText, warText } from './endScreen.js';
import { howText } from './howText.js';
import { DemoWorld, DEMO } from './demoWorld.js';
import { drawWorld } from '../render/miniMap.js';
import { hexTotal } from '../render/peopleMaths.js';
import { hexCentre } from '../render/layout.js';
import { TERRAIN_RGB, rgbCss } from '../render/palette.js';
import { civStyle } from '../render/civStyle.js';
import { buildNeighbourTable } from '../sim/hex.js';
import { DEEP_WATER, PLAINS, COAST } from '../sim/terrain.js';
import { TYPE_RULES } from '../sim/civTypes.js';
import { TRAITS, TRAIT_NAMES, TRAIT_RULES } from '../sim/traits.js';

const civName = (c) => `Civ ${c + 1}`;
const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const chip = (c) => h('span', { class: 'civ-chip' }, emblem(c), civName(c));

export class HowScreen {
  /** body: the page's content element; onNewGame: the New game buttons; nav: where the section links go; progress: the reading bar. */
  constructor(body, { onNewGame, nav = null, progress = null }) {
    this.body = body;
    this.onNewGame = onNewGame;
    this.nav = nav;
    this.progress = progress;
    this.scroller = body.closest('.screen') ?? body;
    this.current = null;
    // Sections scroll to just under the sticky header, whatever its height on this screen.
    const header = this.scroller.querySelector?.('.how-header');
    if (header) {
      new ResizeObserver(() => this.scroller.style.setProperty('--how-head', `${header.offsetHeight}px`)).observe(header);
    }
    this.built = false;
    this.data = null;
    this.figures = []; // [canvas, draw()]
    this.pending = 0;
    new ResizeObserver(() => this.scheduleDraw()).observe(body);
  }

  /** Build on first show, then draw the pictures at the current size. */
  show() {
    if (!this.built) this.build();
    this.scheduleDraw();
  }

  /** Run the pictured world (a few hundred milliseconds on a phone at most); main.js calls this when the browser is idle. */
  prepare() {
    if (this.data) return this.data;
    const demo = new DemoWorld();
    demo.runTo(DEMO.howYear);
    const world = demo.world();
    this.data = { demo, world, stats: demo.host.stats(), report: demo.host.report(), pick: pickHexes(demo, world) };
    return this.data;
  }

  scheduleDraw() {
    if (!this.built || this.pending || this.body.closest('[hidden]')) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      if (this.body.closest('[hidden]')) return;
      for (const [canvas, draw] of this.figures) if (canvas.clientWidth > 0) draw(canvas);
    });
  }

  build() {
    this.built = true;
    const { demo, world, stats, report, pick } = this.prepare();
    const text = howText();
    const year = demo.year;

    const figure = (label, caption, draw, cls = '') => {
      const canvas = h('canvas', { class: `how-canvas ${cls}`, role: 'img', 'aria-label': label });
      this.figures.push([canvas, draw]);
      return h('figure', { class: 'how-fig' }, canvas, h('figcaption', {}, caption));
    };

    const extras = {
      map: () => [
        figure(`The map of the world "${demo.map.params.seed}": ${demo.map.cols} by ${demo.map.rows} hexes`,
          `This world, seed “${demo.map.params.seed}”, ${demo.map.cols} × ${demo.map.rows} hexes, before anyone arrives.`,
          (c) => drawWorld(c, { ...world, pop: null })),
        h('ul', { class: 'how-legend', 'aria-label': 'Food capacity by terrain' }, text.sections[0].legend.map((t) => h('li', {},
          h('span', { class: 'swatch', style: { background: rgbCss(TERRAIN_RGB[t.terrain]) } }),
          h('span', { class: 'how-legend-name' }, t.name), h('span', { class: 'how-legend-num' }, `${t.food} food`)))),
      ],
      people: () => [
        figure('Close up on the busiest hex: every small emblem is a person',
          `Zoomed in on its busiest hex in year ${year}: each little emblem is one person, ${formatNumber(hexTotal(world.pop.hexCivPop, world.pop.civs, pick.busy))} of them here.`,
          (c) => drawWorld(c, world, { focus: [pick.busy], pad: 1.1, civs: true, outlines: true, people: true })),
      ],
      year: (s) => [
        h('ol', { class: 'how-steps' }, s.steps.map(([title, body]) => h('li', {}, h('strong', {}, title), h('span', {}, body)))),
      ],
      migration: () => [
        figure('How far one person can walk in a year from the outlined hex',
          `From the outlined hex, most people can move to the ${pick.reach3.length} land hexes next door in a year (bright); `
            + `a Nomad's ${TYPE_RULES.nomadic.movePoints} movement points reach ${pick.reach5.length} (faint). Rough ground and water hold Nomads back.`,
          (c) => drawWorld(c, { ...world, pop: null }, {
            focus: [pick.origin, ...pick.reach5], pad: 0.2, mark: pick.origin,
            reach: [{ hexes: pick.reach5, fill: 'rgba(255,255,255,0.22)' }, { hexes: pick.reach3, fill: 'rgba(255,255,255,0.38)' }],
          })),
      ],
      civs: (s) => [
        figure(`The world in year ${year}, with each civ's land tinted and outlined in its colour`,
          `The same world in year ${year}: ${world.pop.civs} civs, their land tinted and outlined in their colours, each hex labelled with its largest civ.`,
          (c) => drawWorld(c, world, { rings: true, labels: true })),
        h('ul', { class: 'how-emblems', 'aria-label': 'Civ colours and emblems' }, s.emblems.map((e) => h('li', {}, emblem(e.civ, 20),
          h('span', {}, `${civName(e.civ)}`), h('small', {}, `${e.colour} ${e.emblem}`)))),
      ],
      traits: (s) => [
        h('dl', { class: 'how-traits' }, s.traits.flatMap((t) => [h('dt', {}, t.name), h('dd', {}, t.text)])),
        traitFigure(stats, year),
      ],
      types: (s) => [
        h('ul', { class: 'how-types' }, s.types.map((t) => h('li', { 'data-type': t.type },
          h('h4', {}, t.name),
          h('p', {}, t.text),
          t.levels ? h('p', { class: 'muted' }, t.levels) : null))),
      ],
      contact: () => [
        figure('Close up on a hex shared by two civs, with its ring split by each civ\'s share',
          'Where civs meet: each ring is split by each civ\'s share of the hex, under the largest civ\'s emblem and the head count.',
          (c) => drawWorld(c, world, { focus: [pick.border], pad: 0.9, rings: true, labels: true, counts: true })),
        historyFigure(report),
      ],
      levels: (s) => [
        h('ul', { class: 'how-materials' }, ['common', 'uncommon', 'exotic'].map((tier) => h('li', {},
          h('span', { class: `tier tier-${tier}` }, tier),
          h('span', {}, s.materials.filter((m) => m.tier === tier)
            .map((m) => `${m.name} (${m.where.map((w) => w.name).join(', ')})`).join('; '))))),
        ...[].concat(s.after).map((p) => h('p', {}, p)),
        h('ol', { class: 'how-ladder' }, s.levels.map((l) => h('li', { 'data-level': l.level },
          h('span', { class: 'rung' }, String(l.level)),
          h('div', {}, h('strong', {}, l.name), h('p', {}, l.does), l.needs ? h('p', { class: 'muted' }, `Needs ${l.needs}`) : null)))),
        levelsFigure(stats, year),
        s.buildings ? buildingsBlock(s.buildings) : null,
      ],
      end: () => [endFigure(report, year)],
    };

    const links = text.sections.map((s, k) => h('button', {
      type: 'button', class: 'btn small', 'data-for': s.id,
      onclick: () => this.body.querySelector(`[data-section="${s.id}"]`)?.scrollIntoView({ behavior: smooth(), block: 'start' }),
    }, h('span', { class: 'toc-num', 'aria-hidden': 'true' }, String(k + 1)), s.title));
    let toc = null;
    if (this.nav) this.nav.replaceChildren(...links);
    else toc = h('nav', { class: 'how-toc', 'aria-label': 'Sections' }, links);

    const sections = text.sections.map((s, k) => {
      const parts = [
        h('p', { class: 'how-kicker' }, `${k + 1} · ${s.kicker}`),
        h('h2', {}, s.title),
        ...(s.paras ?? []).map((p) => h('p', {}, p)),
        s.points ? h('ul', { class: 'how-points' }, s.points.map((p) => h('li', {}, p))) : null,
      ];
      const extra = extras[s.id]?.(s) ?? [];
      // Levels places its own "after" paragraphs between the materials and the ladder.
      const after = s.id === 'levels' ? [] : [].concat(s.after ?? []).map((p) => h('p', {}, p));
      return h('section', { class: 'how-section reveal', 'data-section': s.id }, parts, extra, after);
    });

    this.body.replaceChildren(
      h('p', { class: 'how-intro' }, text.intro),
      ...(toc ? [toc] : []),
      ...sections,
      h('section', { class: 'how-section how-outro reveal' },
        h('h2', {}, 'Your world is waiting'),
        h('p', {}, 'Pick a map, place your peoples, press start, and see what history they make.'),
        h('button', { type: 'button', class: 'btn primary how-cta', onclick: () => this.onNewGame() }, 'New game')),
    );
    this.watch(sections);
  }

  /** Reveal sections as they scroll in, keep the current section's link marked, and move the reading bar. */
  watch(sections) {
    const root = this.scroller;
    const reveal = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }, { root, rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    for (const el of this.body.querySelectorAll('.reveal')) reveal.observe(el);
    // A section is current while it crosses a line a third of the way down the screen.
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.mark(e.target.dataset.section);
    }, { root, rootMargin: '-33% 0px -66% 0px' });
    for (const el of sections) spy.observe(el);
    if (sections.length) this.mark(sections[0].dataset.section);
    if (this.progress) {
      let queued = 0;
      const move = () => {
        queued = 0;
        const max = root.scrollHeight - root.clientHeight;
        this.progress.style.transform = `scaleX(${max > 0 ? Math.min(1, root.scrollTop / max) : 0})`;
      };
      root.addEventListener('scroll', () => { queued ||= requestAnimationFrame(move); }, { passive: true });
      move();
    }
  }

  mark(id) {
    if (!this.nav || id === this.current) return;
    this.current = id;
    for (const b of this.nav.children) {
      if (b.dataset.for === id) {
        b.setAttribute('aria-current', 'true');
        // Keep the marked link in the middle of the strip without scrolling the page itself.
        const nr = this.nav.getBoundingClientRect(); const br = b.getBoundingClientRect();
        if (this.nav.scrollWidth > this.nav.clientWidth) {
          this.nav.scrollTo({ left: Math.max(0, this.nav.scrollLeft + br.left - nr.left - (nr.width - br.width) / 2), behavior: smooth() });
        } else if (this.nav.scrollHeight > this.nav.clientHeight) {
          this.nav.scrollTo({ top: Math.max(0, this.nav.scrollTop + br.top - nr.top - (nr.height - br.height) / 2), behavior: smooth() });
        }
      } else b.removeAttribute('aria-current');
    }
  }
}

/** The hexes the pictures centre on: the busiest hex, a hex shared by civs, and a walk's start with its reach. */
function pickHexes(demo, world) {
  const { map } = demo;
  const { hexCivPop, civs } = world.pop;
  const n = map.cols * map.rows;
  let busy = 0; let border = -1; let borderScore = -1;
  for (let i = 0; i < n; i++) {
    const total = hexTotal(hexCivPop, civs, i);
    if (total > hexTotal(hexCivPop, civs, busy)) busy = i;
    let here = 0; let least = Infinity;
    for (let c = 0; c < civs; c++) { const k = hexCivPop[i * civs + c]; if (k > 0) { here++; least = Math.min(least, k); } }
    // A border hex where the smaller side is big enough to see in the ring.
    if (here >= 2 && least > borderScore) { borderScore = least; border = i; }
  }
  if (border < 0) border = busy;
  // The walk starts on the open lowland nearest the middle of the land, so the picture has room on every side.
  let cx = 0; let cy = 0; let land = 0;
  for (let i = 0; i < n; i++) {
    if (map.terrain[i] === DEEP_WATER) continue;
    const c = hexCentre(map.cols, i); cx += c.x; cy += c.y; land++;
  }
  cx /= land; cy /= land;
  const nb = buildNeighbourTable(map.cols, map.rows);
  let origin = busy; let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (map.terrain[i] !== PLAINS && map.terrain[i] !== COAST) continue;
    let wet = 0;
    for (let d = 0; d < 6; d++) if (nb[i * 6 + d] < 0 || map.terrain[nb[i * 6 + d]] === DEEP_WATER) wet++;
    const c = hexCentre(map.cols, i);
    const score = (c.x - cx) ** 2 + (c.y - cy) ** 2 + wet * 4000;
    if (score < best) { best = score; origin = i; }
  }
  const reach3 = Array.from(demo.host.reach(origin, 0) ?? []);
  const reach5 = Array.from(demo.host.reach(origin, TYPE_RULES.nomadic.movePoints) ?? []);
  return { busy, border, origin, reach3, reach5 };
}

/** Each civ's average of every trait, as bars around the 0.5 mark. */
function traitFigure(stats, year) {
  const civs = stats.civs.filter((c) => c.traits);
  const mid = `${TRAIT_RULES.base * 100}%`;
  return h('figure', { class: 'how-fig' },
    h('div', { class: 'how-bars', role: 'img', 'aria-label': `Average traits of each civ in year ${year}` }, TRAITS.map((id, k) => h('div', { class: 'how-bar-row' },
      h('span', { class: 'how-bar-name' }, TRAIT_NAMES[k]),
      h('span', { class: 'how-bar-set' }, civs.map((c) => h('span', { class: 'how-bar', title: `${c.name}: ${c.traits[id].toFixed(2)}` },
        h('span', { class: 'how-bar-fill', style: { width: `${Math.round(c.traits[id] * 100)}%`, background: rgbCss(civStyle(c.id).rgb) } }),
        h('span', { class: 'how-bar-mid', style: { left: mid } }))))))),
    h('figcaption', {}, `Each civ's average traits in year ${year}, one bar per civ; the line marks ${TRAIT_RULES.base}. `,
      ...civs.map((c) => chip(c.id))));
}

/** This world's first meeting (from the end screen's History) and its deadliest war (from the War card). */
function historyFigure(report) {
  const { events, wars = [] } = report.records;
  const firstContact = events.find((e) => e.type === 'contact');
  const war = wars[0];
  if (!firstContact && !war) return null;
  const warYears = war && (war.firstYear === war.lastYear ? `Year ${war.firstYear}` : `Years ${war.firstYear}–${war.lastYear}`);
  return h('figure', { class: 'how-fig' },
    h('ol', { class: 'end-log' },
      firstContact ? h('li', {}, h('span', { class: 'log-year' }, `Year ${firstContact.year}`), emblem(firstContact.civ, 12), h('span', {}, eventText(firstContact))) : null,
      war ? h('li', {}, h('span', { class: 'log-year' }, warYears), emblem(war.civs[0], 12), h('span', {}, warText(war))) : null),
    h('figcaption', {}, 'This world\'s first meeting and its deadliest war, as the end screen shows them.'));
}

/** Buildings and wonders (howText.js buildingsSection): the rules, each era's costs and wonder, and every type's four buildings. */
function buildingsBlock(b) {
  return h('div', { class: 'how-sub', 'data-part': b.id },
    h('p', { class: 'how-kicker' }, b.kicker),
    h('h3', {}, b.title),
    ...b.paras.map((p) => h('p', {}, p)),
    h('ol', { class: 'how-ladder how-eras' }, b.eras.map((e) => h('li', { 'data-era': e.era },
      h('span', { class: 'rung' }, String(e.era)),
      h('div', {},
        h('strong', {}, `${e.level} building`),
        h('p', {}, `${e.cost}; ${e.years} years of work with ${e.perHex} people in its hex.`),
        h('p', { class: 'how-wonder' }, h('strong', {}, e.wonder.name), ` (wonder): ${e.wonder.cost}; ${e.wonder.years} years. ${cap(e.wonder.bonuses.join(', '))}.`))))),
    h('ul', { class: 'how-types how-buildings' }, b.types.map((t) => h('li', { 'data-type': t.type },
      h('h4', {}, t.name),
      h('ol', {}, t.buildings.map((x) => h('li', { 'data-building': x.id }, h('strong', {}, x.name), `: ${x.bonuses.join(', ')}`)))))),
    ...b.after.map((p) => h('p', {}, p)));
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** The in-game Levels panel for the first two civs. */
function levelsFigure(stats, year) {
  const el = h('div', { class: 'levels' });
  renderLevels(el, { ...stats, civs: stats.civs.slice(0, 2) });
  return h('figure', { class: 'how-fig how-panel' }, el,
    h('figcaption', {}, `The Levels panel from the game's bottom sheet, for two of this world's civs in year ${year}.`));
}

function endFigure(report, year) {
  const chart = chartCard(report);
  chart.removeAttribute('id');
  return h('figure', { class: 'how-fig how-panel' }, chart,
    h('figcaption', {}, `The end screen's population chart for this world's first ${year} years.`));
}
