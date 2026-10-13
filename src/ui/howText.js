// The words of How to play (RULES.md "Home page"). Every number is read from
// the module that uses it, so the page follows RULES.md as the rules change.
// Pure strings and plain data: no DOM, so it can be checked in node.

import { TERRAIN_NAMES, FOOD_CAPACITY, MOVE_COST, DEFENCE_BONUS, RIVER_FOOD_BONUS, DEEP_WATER } from '../sim/terrain.js';
import { LIFE } from '../sim/life.js';
import { MIGRATION } from '../sim/migration.js';
import { TRAITS, TRAIT_NAMES, TRAIT_RULES, CIV_TYPE_TRAITS } from '../sim/traits.js';
import { CIV_TYPES, CIV_TYPE_NAMES, TYPE_RULES, civTypeText } from '../sim/civTypes.js';
import { CONTACT } from '../sim/contact.js';
import { WAR } from '../sim/war.js';
import { DIPLOMACY, TRADE } from '../sim/diplomacy.js';
import {
  LEVEL_NAMES, REQUIREMENTS, GATHER, LEVEL_EFFECTS, TYPE_LEVEL_RULES,
} from '../sim/levels.js';
import { MATERIAL_NAMES, MATERIAL_TIER, DEPOSIT_CHANCE, RIVER_DEPOSIT_CHANCE } from '../sim/materials.js';
import { BUILDINGS, BUILDING_COST, WONDERS, WONDER_RULES, ERAS, effectText, materialText } from '../sim/buildings.js';
import { DEFAULT_PARAMS, LIMITS, YEAR_LIMIT_CHOICES } from '../sim/params.js';
import { TIERS, TIER_NAMES, HAND, SETTLE, MAX_PROGRESS_BONUS, SETTLEMENT_BUILDINGS, SB_INDEX } from '../sim/settlements.js';
import { BASE_TPS, SPEEDS, STEP_DAYS } from '../loop.js';
import { DAYS_PER_YEAR } from '../sim/calendar.js';
import { CIV_STYLES } from '../render/civStyle.js';

/** Whole percent, with up to one decimal when needed: 0.25 → "25%", 0.075 → "7.5%". */
export const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const num = (v) => String(Math.round(v * 100) / 100);
const lower = (s) => s.toLowerCase();
/** "a, b and c". */
export const andList = (items, word = 'and') => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`);
const orList = (items) => andList(items, 'or');
const names = (ids) => ids.map((t) => lower(TERRAIN_NAMES[t]));

const LAND = TERRAIN_NAMES.map((_, t) => t).filter((t) => t !== DEEP_WATER);

/** Land terrains with their food capacity, movement cost and defence bonus, most food first (ties in terrain order). */
export function terrainFacts() {
  return LAND.map((t) => ({ terrain: t, name: TERRAIN_NAMES[t], food: FOOD_CAPACITY[t], move: MOVE_COST[t], defence: DEFENCE_BONUS[t] }))
    .sort((a, b) => b.food - a.food || a.terrain - b.terrain);
}

/** Terrains grouped by a per-terrain value (movement cost, defence bonus), lowest value first. */
function byValue(values, keep = () => true) {
  const groups = new Map();
  for (const t of LAND) {
    if (!keep(values[t])) continue;
    if (!groups.has(values[t])) groups.set(values[t], []);
    groups.get(values[t]).push(t);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

/** For each material: its tier and the terrains most likely to hold it (best two, plus rivers when they are as good). */
export function materialFacts() {
  return MATERIAL_NAMES.map((name, m) => {
    const where = LAND.filter((t) => DEPOSIT_CHANCE[m][t] > 0)
      .sort((a, b) => DEPOSIT_CHANCE[m][b] - DEPOSIT_CHANCE[m][a] || a - b)
      .slice(0, 2)
      .map((t) => ({ name: lower(TERRAIN_NAMES[t]), chance: DEPOSIT_CHANCE[m][t] }));
    if (RIVER_DEPOSIT_CHANCE[m] > 0 && RIVER_DEPOSIT_CHANCE[m] >= (where[where.length - 1]?.chance ?? 0)) {
      where.push({ name: 'rivers', chance: RIVER_DEPOSIT_CHANCE[m] });
    }
    return { name, tier: MATERIAL_TIER[m], where };
  });
}

const materialList = (nums) => andList(nums.map((v, m) => (v > 0 ? `${v} ${lower(MATERIAL_NAMES[m])}` : null)).filter(Boolean));

/** The five levels: name, what it takes to reach (hexes as a share of the land per civ) and what it does. */
export function levelFacts() {
  const e = LEVEL_EFFECTS;
  const does = [
    'Hunting, gathering and getting by. Every civ starts here.',
    `Farming: plains and river hexes feed ${pct(e.farmBonus)} more. Rafts: people can cross ${e.raftRange === 1 ? 'one sea or lake hex' : `${e.raftRange} sea or lake hexes`} when they move.`,
    `Shelter: hunger hurts ${e.shelterFactor === 0.5 ? 'half as much' : `× ${e.shelterFactor}`} in desert, tundra and mountain.`,
    `Boats: people can sail across up to ${e.boatRange} sea or lake hexes in a row when they move.`,
    `Every hex feeds ${pct(e.kingdomBonus)} more, old age comes ${e.oldAgeDelay} years later, and the Kingdom has +${pct(WAR.kingdomMorale)} morale `
      + 'in battles against civs that are not Kingdoms. Land it surrounds joins it, people and all, and no other civ can move in.',
  ];
  return LEVEL_NAMES.map((name, k) => {
    const r = REQUIREMENTS[k - 1];
    const points = num(e.birthPerLevel * 100 * k);
    const birth = k > 0 ? ` Birth chance +${points} percentage point${points === '1' ? '' : 's'}.` : '';
    return {
      level: k + 1,
      name,
      does: does[k] + birth,
      needs: r ? `${r.years} years as ${LEVEL_NAMES[k - 1]}, ${r.landPct}% of its share of the land (${r.perHex} people per hex), `
        + `then spends ${materialList(r.materials)}.` : null,
    };
  });
}

/** Each civ type's four buildings, one per era, with their bonuses in plain words. */
export function buildingFacts() {
  return CIV_TYPES.map((type) => ({
    type,
    name: CIV_TYPE_NAMES[type],
    buildings: BUILDINGS[type].map((b, e) => ({ era: e + 1, id: b.id, name: b.name, bonuses: effectText(b.effects) })),
  }));
}

/** Each era: what its building costs and takes, and its wonder's cost, years and bonuses. */
export function eraFacts() {
  return Array.from({ length: ERAS }, (_, e) => ({
    era: e + 1,
    level: LEVEL_NAMES[e],
    perHex: REQUIREMENTS[e].perHex,
    cost: materialText(BUILDING_COST[e].materials),
    years: BUILDING_COST[e].years,
    wonder: { id: WONDERS[e].id, name: WONDERS[e].name, cost: materialText(WONDERS[e].materials), years: WONDERS[e].years, bonuses: effectText(WONDERS[e].effects) },
  }));
}

/**
 * Buildings and wonders, in the same shape as a page section. How to play shows
 * it inside "From Foragers to Kingdom" (the section list is fixed by RULES.md
 * "Home page"); it can stand on its own as is.
 */
export function buildingsSection() {
  const W = WONDER_RULES;
  const eras = eraFacts();
  const lean = Object.entries(W.lean).sort((a, b) => b[1] - a[1]).map(([t, v]) => `${CIV_TYPE_NAMES[t]} ${num(v)}`);
  return {
    id: 'buildings',
    kicker: 'Buildings and wonders',
    title: 'Monuments of a people',
    paras: [
      `Every people builds its own way. Each civ type has one building of its own for every level from 1 to ${ERAS}, `
        + `${CIV_TYPES.length * ERAS} in all. They are not needed to climb: a civ pays for its next level first and builds only with what it has to spare beyond that. `
        + 'Its bonus helps the whole civ for as long as it stands.',
      'A building rises in one hex: where the civ has the most people, sheltered by its own land and away from threats. '
        + 'The materials go when work starts. Then the years of work count only while that hex holds the people per hex the next level asks for '
        + `(${andList(eras.map((e) => String(e.perHex)))} at levels ${andList(eras.map((e) => String(e.era)))}). `
        + 'If the civ ever leaves the hex, the building is lost with its bonus, and it may build it again, at full price.',
    ],
    eras,
    types: buildingFacts(),
    after: [
      'Each level also has one wonder for the whole world. Any civ at that level or higher may try, but only the first to finish gets it; '
        + `the others stop and get ${W.refund === 0.5 ? 'half' : pct(W.refund)} of their materials back. A wonder is not needed to level up, but its bonus is huge.`,
      'Wonders can be taken. A wonder belongs to whoever holds its hex: win the hex, by numbers or in a battle, and the wonder is yours, bonus and all. '
        + 'An empty wonder stands abandoned, its bonus silent, until someone settles it. A wonder near a border is a prize worth a war.',
      `Who tries? A civ thinks about the unfinished wonders of its level and earlier ones, one at a time and the oldest first, every ${W.checkYears} years. `
        + `It weighs its type's lean (${andList(lean)}), how safe it is (the share of its hexes away from threats it cannot beat) `
        + `and whether it already holds the land its next level needs (counting up to × ${num(W.landCap)}), and each wonder it already owns multiplies its keenness by ${num(W.perOwned)}. If it all multiplies to ${num(W.commitScore)} or more, it commits.`,
      'A civ committed to its own level\'s wonder will not level up until it starts it: it gathers the materials, and building begins. An older wonder never holds back its level. '
        + `It gives up after ${W.giveUpYears} years without starting, or as soon as its safety falls below ${num(W.giveUpSafety)}.`,
    ],
  };
}

const TRAIT_TEXT = {
  fertility: `More children: a birth chance from ${pct(TRAIT_RULES.birthBase)} to ${pct(TRAIT_RULES.birthBase + TRAIT_RULES.birthPerFertility)} a year. But hunger hits harder.`,
  lifeExpectancy: `Old age starts between ${TRAIT_RULES.oldAgeBase} and ${TRAIT_RULES.oldAgeBase + TRAIT_RULES.oldAgePerLife} years.`,
  strength: 'Helps them win their duels in a battle.',
  aggression: 'How ready their civ is to declare war and to attack.',
  cooperation: 'How easily they switch civ, and how much they gather.',
  metabolism: `Eats ${num(TRAIT_RULES.needBase)} to ${num(TRAIT_RULES.needBase + TRAIT_RULES.needPerMetabolism)} food a year. Fast burners have more children and starve sooner.`,
  heatTolerance: 'Copes with hunger in the desert; suffers more in tundra and mountains.',
  coldTolerance: 'Copes with hunger in tundra and mountains; suffers more in the desert.',
};

/** The eight traits: name and what it does. */
export function traitFacts() {
  return TRAITS.map((id, k) => ({ id, name: TRAIT_NAMES[k], text: TRAIT_TEXT[id] }));
}

/** The five civ types: name, the setup screen's explanation, and how it levels differently (or null). */
export function typeFacts() {
  return CIV_TYPES.map((type) => {
    const t = TYPE_LEVEL_RULES[type] ?? {};
    const parts = [];
    if (t.gatherPct) parts.push(`gathers ${t.gatherPct - 100}% more`);
    if (t.yearsPct > 100) parts.push(`needs ${t.yearsPct - 100}% more years at each level`);
    if (t.yearsPct < 100) parts.push(`needs ${100 - t.yearsPct}% fewer years at each level`);
    if (t.materialsPct) parts.push(`but ${t.materialsPct - 100}% more materials`);
    return {
      type,
      name: CIV_TYPE_NAMES[type],
      text: civTypeText(type),
      levels: parts.length ? `Levels: ${parts.join(', ')}.` : null,
      traits: Object.keys(CIV_TYPE_TRAITS[type] ?? {}),
    };
  });
}

/**
 * The page: an intro, then the sections in order. Each section has an id (the
 * pictures are hung on it), a title, a short kicker, paragraphs and optional
 * bullet points or numbered steps.
 */
export function howText() {
  const L = LIFE;
  const M = MIGRATION;
  const C = CONTACT;
  const P = DIPLOMACY;
  const T = TRADE;
  const G = GATHER;
  const E = LEVEL_EFFECTS;
  const D = DEFAULT_PARAMS;
  const terrains = terrainFacts();
  const moves = byValue(MOVE_COST);
  const defence = byValue(DEFENCE_BONUS, (v) => v > 0);
  const starveYears = Math.ceil(L.healthMax / L.healthHungryLoss);
  const speeds = SPEEDS.map((s) => s.label);
  const nomadic = TYPE_RULES.nomadic;
  const cooperative = TYPE_RULES.cooperative;
  const oldestAge = L.baseOldAgeStart + L.oldAgeSpan;
  const switchAverage = C.switchPerCooperation * TRAIT_RULES.base;
  const W = WAR;
  const levy = W.levy.expansionist;
  const wallDays = (id) => SETTLEMENT_BUILDINGS[SB_INDEX[id]].effects.defence * W.siegeDaysPerDefence;

  return {
    intro: 'A whole world in your pocket. You shape the land and choose who lives on it; then you watch. '
      + 'Nobody takes orders from you: every single person eats, raises children, grows old, wanders, fights and builds on their own, '
      + 'and the history of your world writes itself, year by year.',
    sections: [
      {
        id: 'map',
        kicker: 'The map',
        title: 'A world of hexes',
        paras: [
          `Every game begins with a map of hexagons, from ${LIMITS.size.min} × ${LIMITS.size.min} up to ${LIMITS.size.max} × ${LIMITS.size.max}. `
            + 'The sea runs all around the edge; inside it the land rises into coasts and plains, forests, hills and mountain ranges, '
            + 'deserts and tundra, with lakes, and rivers that wind downhill to the water.',
          'On the map screen you pick the seed, the size, one continent or islands, how much water, mountains and rivers, and the mix of plains, forest, desert and tundra, '
            + 'with a live preview. The same settings always make the same map, so a world you love can be shared by its seed.',
          `Land feeds people. Each hex grows food up to its capacity and regrows ${pct(L.foodRegrowth)} of it every year. `
            + `A river adds +${RIVER_FOOD_BONUS} food to every hex it runs through: river valleys are where civilisations bloom.`,
          `Rough ground is slow to cross and easy to hold. A step into ${orList(names(moves[0][1]))} costs ${num(moves[0][0])} movement point, `
            + `${andList(moves.slice(1).map(([v, ts]) => `${orList(names(ts))} ${num(v)}`))}; `
            + `defenders get ${andList(defence.map(([v, ts]) => `+${pct(v)} in ${andList(names(ts))}`))}.`,
        ],
        legend: terrains.map((t) => ({ terrain: t.terrain, name: t.name, food: t.food })),
      },
      {
        id: 'people',
        kicker: 'People',
        title: 'Every person is real',
        paras: [
          `No faceless numbers here: each person is simulated one by one, with an age, health from 0 to ${L.healthMax}, a hunger count, `
            + 'a parent, a family line and eight traits of their own.',
          `A person eats about ${L.foodPerPerson} food a year. Fed, they gain ${L.healthFedGain} health; hungry, they lose about ${L.healthHungryLoss}, `
            + `so ${starveYears} lean years in a row are usually the end.`,
          `Between ${L.fertileMin} and ${L.fertileMax}, a fed person in a hex that is not yet full has about a ${pct(L.baseBirthChance)} chance a year of a child. `
            + 'No partner needed: the child starts beside them, in the same civ, and inherits their traits.',
          `From about ${L.baseOldAgeStart}, old age begins to claim people, a little more each year; nobody lives past about ${oldestAge}.`,
        ],
      },
      {
        id: 'year',
        kicker: 'Time',
        title: 'One tick, one day',
        paras: [
          `Time moves a day at a time, in years of ${DAYS_PER_YEAR} days: spring, summer, autumn and winter. At 1× your world lives ${BASE_TPS} days `
            + `every second, a season in ${num(DAYS_PER_YEAR / 4 / BASE_TPS)} seconds and a year in ${num(DAYS_PER_YEAR / BASE_TPS / 60)} minutes; speed up to ${orList(speeds.slice(1))}, `
            + `pause whenever you like, or step a month (${STEP_DAYS} days) to see what happens. Each year runs the same steps:`,
        ],
        steps: [
          ['First day: gather and level up', 'Civs that are not starving gather materials, work on their buildings and wonders, and may reach a new level.'],
          ['First day: birthdays', 'Everyone grows a year older.'],
          ['First day: eat', 'Each hex shares out its food. When it runs short, some go hungry.'],
          ['First day: deaths', 'The starved and the very old die.'],
          ['First day: births', 'Fed adults may have a child.'],
          ['Every month: migrate', 'A twelfth of the people may set out each month: the hungry and the crowded head for better land, so new land fills up over the year. In winter nobody moves into or out of tundra and mountains.'],
          ['Every season: food regrows', `Hexes regrow ${pct(L.foodRegrowth)} of their capacity over a year, most in spring and summer, least in winter, and nothing on tundra and mountains in winter.`],
          ['Last day: contact', 'People of civs sharing a hex may change sides.'],
          ['Last day: records', 'The year goes into the statistics, the war tallies and the history.'],
          ['Last day: the end?', 'The end conditions you picked are checked.'],
        ],
        after: 'Within each step everyone decides first and then it all happens at once, so nobody gains from being first in line. '
          + 'War runs alongside, day by day: declarations and attacks on the first day of each month, and every battle fights each day.',
      },
      {
        id: 'migration',
        kicker: 'Migration',
        title: 'On the move',
        paras: [
          `A person who went hungry sets out with a ${pct(M.hungryChance)} chance. A fed person in a crowded hex, with more people than `
            + `${pct(M.crowdedShare)} of its food capacity (counting food carried in twice) or more than its settlement can house, sets out with a ${pct(M.crowdedChance)} chance.`,
          `People move one hex a year, into a land hex next door. Nomads walk instead, with ${nomadic.movePoints} movement points a year. `
            + `Seas and lakes block the way, until a civ builds rafts (level ${LEVEL_EFFECTS.raftLevel}) and later boats (level ${LEVEL_EFFECTS.boatLevel}).`,
          'They head for a hex with more spare food than home, picked at random but weighted by that spare food, '
            + `counted ${M.ownCivWeight === 2 ? 'twice' : `× ${M.ownCivWeight}`} where their own civ already lives. So civs spread like ink: along rivers and coasts first, into the hills last.`,
          `Civs also choose with a plan: a hex with a material their next level needs counts × ${M.materialWeight}; `
            + `next to a hostile civ they cannot beat, × ${M.avoidWeight}; next to hostile civs they can beat, × ${M.pushWeight} (if they can declare war); `
            + `and +${pct(M.contiguityPerHex)} for each neighbouring hex they already hold, so their land stays in one piece.`,
        ],
      },
      {
        id: 'civs',
        kicker: 'Civilisations',
        title: 'Peoples with a flag',
        paras: [
          `You place ${LIMITS.civCount.min} to ${LIMITS.civCount.max} civilisations, each starting with ${LIMITS.startPop.min} to ${LIMITS.startPop.max} people `
            + `(${D.startPop} by default) on a fertile hex, at least ${L.startMinDistance} steps from the others where the land allows.`,
          'Each civ has its own colour and emblem, so you can tell them apart by shape as well as colour. '
            + 'The land a civ holds is tinted with its colour and wrapped in a bold outline of it.',
          'Zoomed out, each hex shows its largest civ\'s emblem and its head count, ringed by a circle split into each civ\'s share. '
            + 'Zoom in, or tap a hex, and the labels give way to the people themselves: every tiny emblem is one person.',
        ],
        emblems: CIV_STYLES.map((s, k) => ({ civ: k, colour: s.colour, emblem: s.emblem })),
      },
      {
        id: 'traits',
        kicker: 'Traits',
        title: 'Eight traits, passed down',
        paras: [
          `Every person carries eight traits, each from 0 to 1, where ${TRAIT_RULES.base} is average.`,
        ],
        traits: traitFacts(),
        after: `Children inherit their parent's traits, each nudged by a random mutation of up to ±${pct(D.mutation)} `
          + `(you choose ${pct(LIMITS.mutation.min)} to ${pct(LIMITS.mutation.max)}). Over the centuries the world quietly selects: `
          + 'famines weed out the fast burners, and peoples who live by the desert grow to bear its heat.',
      },
      {
        id: 'types',
        kicker: 'Civ types',
        title: 'Five ways to be a people',
        paras: [
          'On the setup screen each civ gets a type. It sets the founders\' starting traits and bends how its people move, fight and grow. '
            + 'A person always acts by the type of the civ they belong to now.',
        ],
        types: typeFacts(),
      },
      {
        id: 'contact',
        kicker: 'Contact',
        title: 'War, peace and changing sides',
        paras: [
          'Civs fight by going to war. On the first day of each month a civ may declare war on a civ it borders (their people live in the same hex or next door). '
            + `An Aggressive civ declares war on every civ it borders. ${cooperative.neverStartsFights ? 'A Cooperative civ never declares war, though war can be declared on it. ' : ''}`
            + `Any other civ needs a reason, and then declares with a chance of its people's average aggression ÷ ${W.declareMonths} each month:`,
        ],
        points: [
          `hunger: someone went hungry last year where the two meet, and its aggression is above ${W.hungerAggression};`,
          `crowding: a hex where they meet is crowded, and its aggression is above ${W.crowdAggression};`,
          `numbers: it has ${W.numbersRatio} times the other's people, and its aggression is above ${W.numbersAggression};`,
          `materials: the other sits on a deposit it needs next door, and its aggression is above ${W.wantAggression};`,
          `revenge: the other beat it in a battle in the last ${W.revengeYears} years.`,
        ],
        after: [
          'Each month (not in winter), a civ at war may attack one enemy hex next to its people. It weighs the odds, its likely warriors and weapons against the defender\'s, '
            + `and attacks only if they are good enough for its aggression: at least ${num(1 - TRAIT_RULES.base)} at aggression ${TRAIT_RULES.base}, bolder civs at worse odds. `
            + 'A Cooperative civ only attacks to drive enemies out of hexes it holds.',
          `Real people fight. Each side calls up ${pct(levy)} of its fit adults (${W.fitAge} to ${W.maxAge}, health ${W.fitHealth} or more) from the hex and the hexes next to it. `
            + `Every day some of them duel: one on one, or up to ${W.maxGang} on 1 when a side outnumbers the other. `
            + `The loser of a duel is killed or wounded, ${W.killPct === 50 ? '50/50' : `${W.killPct}% killed`}. A side breaks when ${W.breakPct}% of its warriors are out.`,
          'The winner takes the hex at once and loots its store; the loser\'s people there flee to the best hex next door.',
          `Strength, weapons and ground decide the duels. Bronze comes at level 3 (× ${num(W.weapons[3])}) and iron at level 4 (× ${num(W.weapons[4])}); `
            + `the side holding the hex gets the terrain's defence bonus and its walls; a Kingdom has +${pct(W.kingdomMorale)} morale against civs that are not Kingdoms.`,
          `Walls mean a siege first: ${W.siegeDaysPerDefence} days for each +100% of walls (a Palisade ${num(wallDays('palisade'))} days, Stone walls ${num(wallDays('stoneWalls'))}). `
            + 'Nothing grows in a besieged hex, the defenders may come out to break the siege, and winter lifts it.',
          `Where nobody fights, people may simply change sides: about ${pct(switchAverage)} a year at average cooperation `
            + `(${pct(C.switchPerCooperation)} × cooperation), and half as often away from a Cooperative civ.`,
        ],
      },
      {
        id: 'peace',
        kicker: 'Peace and trade',
        title: 'Truces, tribute and caravans',
        paras: [
          `Wars end. Two civs that have not fought a battle for ${P.quietYears} years make a truce. Sooner, a civ that has lost ${P.exhaustPct}% of its people `
            + `to the other in ${P.span} years asks for one, and pays ${pct(P.tribute)} of its capital's store as tribute; `
            + `an Aggressive civ that has won ${P.refuseWinThirds} of every 3 battles refuses.`,
          `A truce lasts ${P.truceYears} years (${P.truceYearsAggressive} with an Aggressive civ): no war at all. Then comes peace. `
            + `At peace there is no revenge, declaring war needs more aggression (+${P.peaceAggression}, and more the longer they trade), `
            + `and an Aggressive civ only declares when it has ${P.aggressivePeaceRatio} times the other's warriors. One declaration and it is war again.`,
          'Civs in a truce or at peace trade, when a road over their own land (or a sea crossing their boats can make) joins their capitals. '
            + `Each buys what its next spend lacks from what the other has spare: common goods are worth ${T.value.common}, uncommon ${T.value.uncommon}, exotic ${T.value.exotic}, `
            + `and the buyer pays ${T.price} × in its own spare goods. Up to ${T.volume} worth a year, more with a Market, a Cooperative partner or an old road of ${T.oldRouteYears} years; `
            + `caravans lose ${pct(T.lossPerStep)} a step.`,
          'Trade partners also let each other\'s goods and food pass through their land. A civ\'s hexes cut off from its capital by civs it does not trade with are enclaves: '
            + `they gather ${pct(SETTLE.enclaveGather)} as much, get half its bonuses, and their stores do not count towards its next spend.`,
        ],
      },
      {
        id: 'levels',
        kicker: 'Materials and levels',
        title: 'From Foragers to Kingdom',
        paras: [
          `There are ${MATERIAL_NAMES.length} materials, each found in its own kind of land:`,
        ],
        materials: materialFacts(),
        after: [
          `Where food is secure (at most ${pct(SETTLE.secureHungry)} of the people there went hungry last year), `
            + `${pct(G.gatherShare)} of a hex's adults gather its deposits. Deposits never run out, but by hand each gatherer brings in only ${HAND.yield.common} a year `
            + `(${HAND.yield.exotic} of an exotic), at most ${HAND.cap.common} a deposit a year (${HAND.cap.exotic} for exotics). `
            + 'An industry building on the deposit (Woodcutter, Quarry, Clay pit, Mine, Deep mine) gathers far faster, so rare materials pile up only where a civ has built for them.',
          'What is gathered stays in that settlement\'s store. Carriers take it along routes over the civ\'s land to where it is needed: '
            + 'to settlements putting up a building, and to the capital, whose store pays for levels, era buildings and wonders.',
          'Each level needs years at the level below, enough hexes (a share of the land per civ: the map\'s land hexes ÷ the civs that started) '
            + `with enough people on them, and materials in the capital's store. A civ that stays below its level's people for ${E.fallBackYears} years in a row falls back a level.`,
          `Every lived-in hex is a settlement: ${andList(TIERS.map((t, k) => `${lower(TIER_NAMES[k])} from ${t.people}`))} people, `
            + `as far as the civ's level allows (a town needs level ${TIERS[2].level}, a megapolis level ${TIERS[5].level}). Bigger places house more people, `
            + `grow more food (up to +${pct(TIERS[5].food)} for a megapolis), store more and send carriers farther. A place shrinks after ${SETTLE.shrinkYears} years too small for its size.`,
          'Each settlement puts up its own buildings, one at a time, paid from its store: huts and houses, fields, docks, granaries and irrigation, '
            + 'industry on its deposits, warehouses and markets, shrines, schools and libraries, palisades and walls. '
            + `Civic buildings make every year at a level count for more, up to +${pct(MAX_PROGRESS_BONUS)}. Hungry places get food from neighbours with food to spare. `
            + `When a hex changes hands, ${pct(SETTLE.looted)} of its store is looted and carried off to the winner's capital.`,
        ],
        levels: levelFacts(),
        buildings: buildingsSection(),
      },
      {
        id: 'end',
        kicker: 'The end',
        title: 'How a world ends',
        paras: ['On the setup screen you tick any mix of end conditions:'],
        points: [
          'Last civ standing: the last civ with people wins.',
          'First to Kingdom: the first civ to reach level 5 wins.',
          `Dominance: a civ holding at least ${pct(D.dominanceShare)} of the land for ${D.dominanceYears} years in a row wins (you can change both).`,
          `Year limit: the world stops at ${orList(YEAR_LIMIT_CHOICES.map(String))} years, or a year you choose. No winner.`,
          'Tick nothing for Sandbox: the world never stops.',
        ],
        after: [
          'If everyone dies, the game ends whatever you ticked. You can also pause and tap End now.',
          'The end screen tells the whole story: the winner, each civ\'s peak and lifespan, population and level charts, '
            + 'how the traits drifted, the oldest person who ever lived, the longest family line, the worst famine, the wars between each pair of civs, and a short history of the turning points.',
        ],
      },
      {
        id: 'controls',
        kicker: 'Playing',
        title: 'At your fingertips',
        points: [
          'Drag to pan, pinch or scroll to zoom, and ⤢ fits the whole map again. On a keyboard, the arrow keys move the map and + and − zoom.',
          'Zoom in to see each settlement drawn by its size, its buildings, and carts on the routes between them.',
          'Tap a hex to fly in and see its terrain, food, deposits, people, its settlement (store, buildings and routes) and any building or wonder there. Tap a person for their age, health, family and traits.',
          'Swipe up the bottom sheet for each civ\'s people, hexes, level, buildings, wonders and capital store, and a guide to every level and settlement.',
          'The ☰ button pauses and goes back to setup. Add the page to your Home Screen for a full-screen app.',
        ],
      },
    ],
  };
}
