// Levels in the live report: each civ's level, capital store and progress
// towards its next level, and a guide to what every level, material and
// settlement does. The guide is written from the numbers in levels.js,
// settlements.js and materials.js, so it follows RULES.md ("Gathering and
// levels", "Settlements") without copying numbers by hand.

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';
import { MATERIAL_IDS, MATERIAL_NAMES, MATERIAL_TIER } from '../sim/materials.js';
import {
  LEVEL_NAMES, REQUIREMENTS, GATHER, LEVEL_EFFECTS, TYPE_LEVEL_RULES, levelMinimums,
} from '../sim/levels.js';
import { DEEP_WATER } from '../sim/terrain.js';
import { BUILDING_COST, WONDERS, WONDER_RULES, ERAS, materialText, effectText } from '../sim/buildings.js';
import {
  TIERS, TIER_NAMES, HAND, SETTLE, SETTLEMENT_BUILDINGS, MAX_PROGRESS_BONUS, settlementEffectText,
} from '../sim/settlements.js';

const materialName = (id) => MATERIAL_NAMES[MATERIAL_IDS.indexOf(id)] ?? id;
/** Stockpile amounts, rounded down to one decimal so 79.96 never reads as 80. */
export const amount = (v) => (Math.floor(v * 10 + 1e-9) / 10).toFixed(1).replace(/\.0$/, '');
const pct = (v) => `${Math.round(v * 100)}%`;

/** One progress row: label, a bar, and "have / need". */
function progress(label, have, need, text) {
  const done = have >= need;
  const share = need > 0 ? Math.min(1, have / need) : 1;
  return h('li', { class: done ? 'done' : undefined },
    h('span', { class: 'p-label' }, label),
    h('span', { class: 'p-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round(share * 100)}%` } })),
    h('span', { class: 'p-num' }, text ?? `${formatNumber(have)} / ${formatNumber(need)}`));
}

/** Per civ: level, food security, progress to the next level and its capital's store. */
export function renderLevels(el, stats) {
  if (!el) return;
  el.replaceChildren(...stats.civs.map((c, k) => {
    const head = h('div', { class: 'level-head' },
      emblem(k),
      h('span', { class: 'name' }, `${c.name} · Level ${c.level} ${c.levelName}`),
      c.pop > 0 ? h('span', { class: c.foodSecure ? 'tag ok' : 'tag' }, c.foodSecure ? 'Well fed' : 'Many hungry') : null);
    const parts = [head];
    if (c.pop === 0) parts.push(h('p', { class: 'muted' }, 'Died out.'));
    else if (c.next) {
      const n = c.next;
      const rows = [
        progress('Years', c.yearsAtLevel, n.years),
        progress('People', c.pop, n.pop),
        progress('Hexes', c.hexes, n.hexes),
        ...MATERIAL_IDS.filter((id) => n.materials[id] > 0)
          .map((id) => progress(materialName(id), c.stockpile[id], n.materials[id], `${amount(c.stockpile[id])} / ${formatNumber(n.materials[id])}`)),
      ];
      const era = c.buildings?.eras[c.level - 1];
      parts.push(h('p', { class: 'level-next' }, `Next: Level ${n.level} ${n.levelName}`
        + (c.progressBonus > 0 ? ` (years count ${pct(c.progressBonus)} faster)` : '')), h('ul', { class: 'progress' }, rows));
      if (n.waitingForWonder && era) {
        parts.push(h('p', { class: 'muted wonder-wait' }, `Waiting for the ${era.wonder.name}: it will not level up until it starts building it `
          + `(it gives up after ${WONDER_RULES.giveUpYears} years, or if it becomes unsafe).`));
      }
    } else parts.push(h('p', { class: 'level-next' }, 'Kingdom: the top level.'));
    if (c.pop > 0 && c.level > 1 && c.pop < c.minPop) {
      parts.push(h('p', { class: 'muted warn' },
        `Below ${formatNumber(c.minPop)} people for ${c.yearsBelowMinimum} of ${LEVEL_EFFECTS.fallBackYears} years: then it falls back a level.`));
    }
    if (c.buildings) parts.push(buildingsBlock(c));
    if (c.pop > 0) {
      const inStore = MATERIAL_IDS.filter((id) => c.stockpile[id] > 0);
      const where = c.capital ? `Capital store, ${c.capital.name} (${c.capital.tierName}): ` : 'Capital store: ';
      parts.push(h('p', { class: 'stock' }, h('span', { class: 'p-label' }, where),
        inStore.length ? inStore.map((id) => `${materialName(id)} ${amount(c.stockpile[id])}`).join(', ') : 'empty'));
      const all = MATERIAL_IDS.filter((id) => c.held?.[id] >= 0.05);
      if (all.length) {
        parts.push(h('p', { class: 'stock muted' }, h('span', { class: 'p-label' }, 'In all its settlements: '),
          all.map((id) => `${materialName(id)} ${amount(c.held[id])}`).join(', ')));
      }
    }
    return h('section', { class: c.pop === 0 ? 'level-civ dead' : 'level-civ', 'data-civ': c.id }, parts);
  }));
}

const share = (work, years) => `${years > 0 ? Math.floor((work / years) * 100) : 0}%`;

const BUILDING_STATUS = { none: 'not built', building: 'building', standing: 'standing' };

/** The wonder chase in plain words: free, gathering, building x%, owned, taken by Civ N. */
export function wonderStatus(w) {
  if (w.status === 'owned') return 'owned';
  if (w.status === 'building') return `building ${share(w.work, w.years)}`;
  if (w.status === 'gathering') return 'going for it, gathering materials';
  if (w.status === 'taken') return w.owner >= 0 ? `taken by Civ ${w.owner + 1}` : 'built, now abandoned';
  return 'free';
}

/** A civ's era buildings, its current era's wonder chase (and any wonder it owns), and its total bonuses. */
function buildingsBlock(c) {
  const { eras, bonusText } = c.buildings;
  const items = eras.map((e) => {
    const b = e.building;
    const status = b.status === 'building' ? `building ${share(b.work, b.years)}` : BUILDING_STATUS[b.status];
    const lost = b.destroyed ? `, lost ${b.destroyed === 1 ? 'once' : `${b.destroyed} times`}` : '';
    return h('li', { 'data-era': e.era, 'data-status': b.status, class: e.era > c.level ? 'later' : undefined },
      h('span', { class: 'b-name' }, `${e.era} ${b.name}`), h('span', { class: 'b-status' }, `${status}${lost}`),
      h('small', {}, b.bonuses.join('; ')));
  });
  const wonders = eras.filter((e) => e.era === c.level || e.wonder.status === 'owned').map((e) => {
    const w = e.wonder;
    return h('li', { 'data-era': e.era, 'data-status': w.status },
      h('span', { class: 'b-name' }, w.name), h('span', { class: 'b-status' }, wonderStatus(w)),
      h('small', {}, w.bonuses.join('; ')));
  });
  return h('div', { class: 'level-buildings' },
    h('p', { class: 'b-head' }, 'Buildings'),
    h('ul', { class: 'b-list' }, items),
    wonders.length ? h('p', { class: 'b-head' }, 'Wonders') : null,
    wonders.length ? h('ul', { class: 'b-list wonders' }, wonders) : null,
    h('p', { class: 'b-bonus' }, h('span', { class: 'p-label' }, 'Bonuses: '), bonusText.length ? bonusText.join('; ') : 'none yet'));
}

const SITE_TEXT = { farm: ', on plains, coast or a river', water: ', next to water', capital: ', capital only', deposit: ', on its deposit' };

const LEVEL_TEXT = [
  'Gathering only. Every civ starts here.',
  `Plains and river hexes feed ${pct(LEVEL_EFFECTS.farmBonus)} more.`,
  `Shelter: hunger hurts half as much in desert, tundra and mountain.`,
  `Boats: people can migrate across one sea or lake hex (it costs ${LEVEL_EFFECTS.boatCost} movement point).`,
  `Every hex feeds ${pct(LEVEL_EFFECTS.kingdomBonus)} more (plains and rivers ${pct(LEVEL_EFFECTS.farmBonus + LEVEL_EFFECTS.kingdomBonus)} in all), old age starts `
    + `${LEVEL_EFFECTS.oldAgeDelay} years later, and it fights at × ${LEVEL_EFFECTS.kingdomStrength} strength against civs that are not Kingdoms. `
    + 'A hex whose land neighbours all hold its people is enclosed: everyone else there joins the Kingdom, and no other civ can move in.',
];

const list = (nums) => MATERIAL_IDS.map((id, m) => (nums[m] > 0 ? `${nums[m]} ${materialName(id).toLowerCase()}` : null)).filter(Boolean).join(', ');

/** The level guide for `map` started by `civs` civs: what each level needs and does, and what each material is for. */
export function renderLevelGuide(el, map, civs) {
  if (!el) return;
  let land = 0;
  for (let i = 0; i < map.terrain.length; i++) if (map.terrain[i] !== DEEP_WATER) land++;
  const levels = LEVEL_NAMES.map((name, k) => {
    const L = k + 1;
    const r = REQUIREMENTS[L - 2];
    const m = levelMinimums(L, land, civs);
    const needs = r ? `Needs ${r.years} years at level ${L - 1}, ${formatNumber(m.hexes)} hexes (${r.landPct}% of the land per civ), `
      + `${formatNumber(m.pop)} people, and spends ${list(r.materials)}.` : null;
    const birth = L > 1 ? ` Birth chance +${(LEVEL_EFFECTS.birthPerLevel * 100 * (L - 1)).toFixed(1)} percentage points.` : '';
    return h('li', { 'data-level': L },
      h('strong', {}, `${L} ${name}`), h('span', {}, ` ${LEVEL_TEXT[k]}${birth}`),
      needs ? h('small', {}, needs) : null);
  });
  const used = (m) => [
    ...REQUIREMENTS.map((r, k) => (r.materials[m] > 0 ? `${LEVEL_NAMES[k + 1]} ${r.materials[m]}` : null)),
    ...BUILDING_COST.map((b, e) => (b.materials[m] > 0 ? `era ${e + 1} building ${b.materials[m]}` : null)),
    ...WONDERS.map((w) => (w.materials[m] > 0 ? `${w.name} ${w.materials[m]}` : null)),
  ].filter(Boolean).join(', ');
  const materials = MATERIAL_IDS.map((id, m) => {
    const tier = MATERIAL_TIER[m];
    const works = SETTLEMENT_BUILDINGS.find((b) => b.effects.industry?.materials.includes(id));
    const ind = works.effects.industry;
    return h('li', { 'data-material': id },
      h('strong', {}, materialName(id)), h('span', {}, ` (${tier}): by hand ${HAND.yield[tier]} a gatherer a year, at most ${HAND.cap[tier]} a deposit a year; `
        + `with a ${works.name} ${ind.yield} a gatherer, at most ${ind.cap}. Spent on ${used(m) || 'nothing'}.`));
  });
  const t = TYPE_LEVEL_RULES;
  el.replaceChildren(
    h('p', {}, `A hex gathers while its food is secure: at most ${pct(SETTLE.secureHungry)} of its people went hungry there last year. Then ${pct(GATHER.gatherShare)} of its adults gather its deposits, `
      + 'first what its civ\'s next level and its settlements\' planned buildings need. The holder of the hex keeps what is gathered in that settlement\'s store. '
      + 'Deposits never run out, but rare materials come slowly by hand: an industry building on the deposit gathers much faster. '
      + 'Carriers bring materials to the capital, whose store pays for levels, era buildings and wonders.'),
    h('p', {}, `Hexes needed are a share of the land per civ: ${formatNumber(land)} land hexes ÷ ${civs} ${civs === 1 ? 'civ' : 'civs'} here. `
      + 'People needed are so many per hex needed. '
      + `A civ that stays below its level's people for ${LEVEL_EFFECTS.fallBackYears} years in a row falls back one level and keeps its stores.`),
    h('ol', { class: 'guide-levels' }, levels),
    h('h3', {}, 'Materials'),
    h('ul', { class: 'guide-materials' }, materials),
    h('h3', {}, 'Buildings and wonders'),
    h('p', {}, 'Each civ type has its own building for every level from 1 to 4. It is optional: it gives its bonuses, and a civ builds it only with materials to spare beyond its next level. '
      + 'Each level also has one wonder for the whole world: the first civ to finish it takes it.'),
    h('ul', { class: 'guide-materials guide-buildings' }, Array.from({ length: ERAS }, (_, e) => h('li', { 'data-era': e + 1 },
      h('strong', {}, `${e + 1} ${LEVEL_NAMES[e]}`),
      h('span', {}, ` building: ${materialText(BUILDING_COST[e].materials)}, ${BUILDING_COST[e].years} work years. `
        + `Wonder, the ${WONDERS[e].name}: ${materialText(WONDERS[e].materials)}, ${WONDERS[e].years} work years; ${effectText(WONDERS[e].effects).join(', ')}.`)))),
    h('h3', {}, 'Settlements'),
    h('p', {}, 'Every lived-in hex is a settlement. It grows with its people, up to what its civ\'s level allows; '
      + `it shrinks a tier after ${SETTLE.shrinkYears} years below ${pct(SETTLE.shrinkShare)} of its tier's people. `
      + `Civic buildings make every year at a level count for more, up to +${pct(MAX_PROGRESS_BONUS)} in all.`),
    h('ul', { class: 'guide-materials guide-tiers' }, TIERS.map((t, k) => h('li', { 'data-tier': k },
      h('strong', {}, TIER_NAMES[k]),
      h('span', {}, ` from ${formatNumber(t.people)} ${t.people === 1 ? 'person' : 'people'}, level ${t.level}: houses ${t.housing}, `
        + `${t.slots} building ${t.slots === 1 ? 'slot' : 'slots'}, stores ${t.store} of each material`
        + `${t.food > 0 ? `, food capacity +${pct(t.food)}` : ''}, routes ${t.reach} ${t.reach === 1 ? 'step' : 'steps'}.`)))),
    h('ul', { class: 'guide-materials guide-settlement-buildings' }, SETTLEMENT_BUILDINGS.map((b) => h('li', { 'data-building': b.id },
      h('strong', {}, b.name),
      h('span', {}, ` (${TIER_NAMES[b.tier]}${b.level > 1 ? `, level ${b.level}` : ''}${SITE_TEXT[b.site] ?? ''}): `
        + `${materialText(b.cost)}, ${b.years} work years; ${settlementEffectText(b).join(', ')}.`)))),
    h('h3', {}, 'Civ types'),
    h('p', {}, `Cooperative gathers ${t.cooperative.gatherPct - 100}% more. Nomadic needs ${t.nomadic.yearsPct - 100}% more years at each level. `
      + `Isolationist needs ${100 - t.isolationist.yearsPct}% fewer years but ${t.isolationist.materialsPct - 100}% more materials. `
      + `Each gatherer's own cooperation counts too: × (${GATHER.personBase} + cooperation).`),
  );
}
