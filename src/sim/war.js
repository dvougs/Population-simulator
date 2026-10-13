// War between civs: declarations, troops, battles that last days, and sieges.
// Every number here is listed in RULES.md ("War").
//
// Once a month each civ may declare war on a civ it borders, and each civ at
// war picks one enemy hex to attack. A battle is fought by real people: a
// levy of fit adults from the hex and the hexes next to it, on both sides.
// Each day some of them meet in duels (one on one, or two or three on one
// when a side outnumbers the other), and the loser of each duel is killed or
// wounded. A side breaks when too many of its warriors are out; the other
// side then holds the hex at once. A walled settlement is besieged first.
//
// Declarations are decided against one snapshot of the month (who is where,
// taken when the step starts) and applied together; battles are worked
// through in the order they began, each drawing from the war stream.

import { DEEP_WATER, DEFENCE_BONUS } from './terrain.js';
import { STRENGTH, AGGRESSION, TRAIT_COUNT } from './traits.js';
import { TYPE_RULES } from './civTypes.js';
import { DEATH_WAR } from './life.js';
import { MAX_LEVEL } from './levels.js';
import { MIGRATION } from './migration.js';
import { NO_RELATION, WAR as AT_WAR, PEACE, DIPLOMACY } from './diplomacy.js';
import { SEASON_DAYS, WINTER } from './calendar.js';

export const WAR = Object.freeze({
  /** Warriors: people aged fitAge to maxAge (inclusive) with health at least fitHealth. */
  fitAge: 16,
  maxAge: 45,
  fitHealth: 50,
  /** Share of a civ's fit adults (in the hex and the hexes next to it) called up for a battle, by type. */
  levy: Object.freeze({ expansionist: 0.25, aggressive: 0.4, cooperative: 0.2, isolationist: 0.25, nomadic: 0.3 }),
  /** Each day, this % of the smaller side's fit warriors (rounded up, at least 1) fight a duel. */
  duelPct: 10,
  /** The larger side sends ⌊its warriors ÷ the other's⌋ fighters to each duel, at most this many. */
  maxGang: 3,
  /** The loser of a duel is killed with this % chance; otherwise wounded, down to woundHealth and out of the battle. */
  killPct: 50,
  woundHealth: 20,
  /** A side breaks once this % of its warriors are killed or wounded (or none is left fit). */
  breakPct: 40,
  /** A battle still going after this many days ends with the attacker pulling back. */
  maxDays: 30,
  /** Weapons by civ level (index 1 … 5): stone, stone, bronze, iron, iron. */
  weapons: Object.freeze([1, 1, 1, 1.25, 1.5, 1.5]),
  /** Morale starts at 1, + kingdomMorale for a Kingdom (against a civ that is not one), − hungryMorale when hungryShare of its warriors went hungry this year. */
  kingdomMorale: 0.25,
  hungryMorale: 0.25,
  hungryShare: 0.25,
  /** A walled settlement is besieged for its walls' defence bonus × this many days before the fighting. */
  siegeDaysPerDefence: 120,
  /** When a besieged hex falls, this % of the loser's people there who did not fight die (the sack). */
  sackPct: 5,
  /** A civ attacks a hex only at odds of at least 1 − its average aggression (0.5 at aggression 0.5), never below minOdds. */
  minOdds: 0.25,
  /** Odds are capped at this when targets are compared, and a hex with a deposit the civ still needs counts × wantBonus. */
  oddsCap: 10,
  wantBonus: 1.5,
  /** Declaring war: the monthly chance is the civ's average aggression ÷ this (about its aggression a year). */
  declareMonths: 12,
  /** Aggression a reason needs: hunger, crowding, numbers (with numbersRatio × the other's people) and materials. */
  hungerAggression: 0.5,
  crowdAggression: 0.4,
  numbersRatio: 3,
  numbersAggression: 0.45,
  wantAggression: 0.45,
  /** Revenge: a civ that lost a battle to another within this many years declares war on it. */
  revengeYears: 20,
});

/** First day of winter: no battle starts in winter, and a siege still going then is lifted. */
const WINTER_DAY = WINTER * SEASON_DAYS;
const NEVER = -1000000000;

class Battle {
  constructor(uid, hex, att, def, holder) {
    this.uid = uid;
    this.hex = hex;
    /** Civs: side 0 attacks, side 1 defends; holder is the one holding the hex (−1: neither). */
    this.civ = [att, def];
    this.holder = holder;
    this.siegeDays = 0;
    this.siegeLeft = 0;
    this.day = 0;
    this.started = 0;
    /** Per side: fit warriors (slots, then ids), how many are still fit, how many there were, killed or wounded, killed. */
    this.slots = [null, null];
    this.ids = [null, null];
    this.fit = [0, 0];
    this.start = [0, 0];
    this.out = [0, 0];
    this.dead = [0, 0];
    /** Per side: power multiplier (weapons, buildings, defence) and starting morale. */
    this.mul = [1, 1];
    this.morale = [1, 1];
    this.relieved = false;
    this.savedFood = 0;
  }
}

export class War {
  /** types[c]: civ c's type id (see civTypes.js). */
  constructor(map, types, capacity) {
    const n = map.count;
    const civs = types.length;
    this.civs = civs;
    this.n = n;
    this.levy = Float64Array.from(types, (t) => WAR.levy[t] ?? 0.25);
    this.always = Uint8Array.from(types, (t) => (TYPE_RULES[t]?.alwaysFights ? 1 : 0));
    this.never = Uint8Array.from(types, (t) => (TYPE_RULES[t]?.neverStartsFights ? 1 : 0));
    /** People and fit warriors (not already in a battle) per civ per hex, counted at the start of the month. */
    this.cnt = new Int32Array(n * civs);
    this.fitCnt = new Int32Array(n * civs);
    this.pop = new Int32Array(n);
    /** Bit c set where civ c has people in the hex. */
    this.pres = new Int32Array(n);
    this.civFit = new Int32Array(civs);
    /** Each civ's attack this month (see attack). */
    this.atk = new Float64Array(civs).fill(1);
    this.head = new Int32Array(n * civs).fill(-1);
    /** Hexes where civs meet (see borders), fronts of them. */
    this.front = new Int32Array(n);
    this.fronts = 0;
    this.civPop = new Int32Array(civs);
    /** Per civ, bits of the civs it borders, and of those beside its hungry, crowded or wanted hexes. */
    this.border = new Int32Array(civs);
    this.hungerB = new Int32Array(civs);
    this.crowdB = new Int32Array(civs);
    this.wantB = new Int32Array(civs);
    /** lostTo[a × civs + b]: the last year civ a lost a battle to civ b. */
    this.lostTo = new Int32Array(civs * civs).fill(NEVER);
    /** Active battles, in the order they began; the battle in each hex (index into battles, −1: none). */
    this.battles = [];
    this.byHex = new Int32Array(n).fill(-1);
    this.nextUid = 1;
    /** The battle each civ is attacking in (uid, 0: none). */
    this.attacking = new Int32Array(civs);
    /** 1 where a battle was fought this year (no switching civ there; see contact.js). */
    this.fought = new Uint8Array(n);
    /** Per person slot: the uid of the battle they were called up for, and their id then (a reused slot is not in it). */
    this.inBattle = new Int32Array(capacity);
    this.inBattleId = new Uint32Array(capacity);
    this.list = new Int32Array(capacity);
    this.next = new Int32Array(capacity);
    this.tag = new Int32Array(capacity);
    /** Battles that ended today, and the index of the one in each hex (−1: none). */
    this.ended = [];
    this.endAt = new Int32Array(n).fill(-1);
    /** Battles and sieges this run, and how they ended (for the end screen). */
    this.totals = { battles: 0, sieges: 0, siegesLifted: 0, pulledBack: 0, occupied: 0 };
    /** Set by the Simulation. */
    this.settle = null;
    this.level = null;
    this.eff = null;
    this.diplomacy = null;
    this.civTraits = null;
    this.hungryHex = null;
    this.want = null;
    /** The Kingdom enclosing each hex (−1: none): never a refuge for other civs. */
    this.inside = null;
  }

  grow(capacity) {
    if (this.inBattle.length >= capacity) return;
    const a = new Int32Array(capacity); a.set(this.inBattle); this.inBattle = a;
    const b = new Uint32Array(capacity); b.set(this.inBattleId); this.inBattleId = b;
    this.list = new Int32Array(capacity);
    // The chains built at the end of last year stay valid when the pool grows mid-year.
    const c = new Int32Array(capacity); c.set(this.next); this.next = c;
    this.tag = new Int32Array(capacity);
  }

  /** Warriors civ c calls up from `fit` fit adults: its levy share, rounded, at least 1 when there is anyone. */
  levyOf(c, fit) {
    return fit > 0 ? Math.max(1, Math.round(this.levy[c] * fit)) : 0;
  }

  /** Slot i is in a battle that is still going (a battle clears its warriors when it ends; a reused slot has another id). */
  busy(people, i) {
    return this.inBattle[i] !== 0 && this.inBattleId[i] === people.id[i];
  }

  /** A civ's attack multiplier: weapons by level, × its buildings' strength bonus. */
  attack(c) {
    return WAR.weapons[this.level ? this.level[c] : 1] * (this.eff ? 1 + this.eff.strength[c] : 1);
  }

  /** Defence of civ c holding hex h: terrain + buildings and wonders + the settlement's walls (when withWalls). */
  defence(map, h, c, withWalls = true) {
    const st = this.settle;
    const walls = withWalls && st && st.holder[h] === c ? st.defence[h] : 0;
    return 1 + DEFENCE_BONUS[map.terrain[h]] + (this.eff ? this.eff.defence[c] : 0) + walls;
  }

  /** Walls of hex h for its holder c (0 when none): what makes a siege. */
  walls(h, c) {
    const st = this.settle;
    return st && st.holder[h] === c ? st.defence[h] : 0;
  }

  /**
   * At the end of each year, from the counts the Simulation just took (people per civ per hex in
   * cnt, and each hex's people aged fitAge − 1 to maxAge chained per civ in head and next, since
   * birthdays come next): who is where, each civ's people and warriors, the borders and the hexes
   * where civs meet. The month's decisions read these; battles update them as hexes change hands.
   */
  endYear(map) {
    const civs = this.civs;
    const { cnt, fitCnt, pop, pres, civFit, civPop } = this;
    pop.fill(0); pres.fill(0); civFit.fill(0); civPop.fill(0);
    for (let h = 0; h < map.count; h++) {
      const b0 = h * civs;
      for (let c = 0; c < civs; c++) {
        const k = cnt[b0 + c];
        if (k === 0) continue;
        pop[h] += k;
        civPop[c] += k;
        civFit[c] += fitCnt[b0 + c];
        pres[h] |= 1 << c;
      }
    }
    this.borders(map);
  }

  /**
   * The first day of each month. Civs declare war, then (outside winter) each civ at war picks
   * one enemy hex to attack, or comes out to break a siege of its own. onEvent(kind, a, b, year,
   * value) reports 'declared' (a declared war on b) and 'war' (a peace or truce broken).
   */
  month(people, map, year, doy, rng, onEvent) {
    this.grow(people.capacity);
    for (let c = 0; c < this.civs; c++) this.atk[c] = this.attack(c);
    this.declare(map, year, rng, onEvent);
    if (Math.floor(doy / SEASON_DAYS) === WINTER) return;
    this.relieve(people, map, year, doy, rng);
    this.targets(people, map, year, doy, rng);
  }

  /**
   * Which civs each civ borders, and beside which of its hungry, crowded or wanted hexes; and the
   * hexes where civs meet (people of one civ with another's in or next to the hex), the only ones
   * a civ can attack.
   */
  borders(map) {
    const civs = this.civs;
    const { pres, border, hungerB, crowdB, wantB, front } = this;
    border.fill(0); hungerB.fill(0); crowdB.fill(0); wantB.fill(0);
    this.fronts = 0;
    const nb = map.neighbours;
    for (let h = 0; h < map.count; h++) {
      const here = pres[h];
      if (here === 0) continue;
      let around = here;
      for (let d = 0; d < 6; d++) {
        const t = nb[h * 6 + d];
        if (t >= 0) around |= pres[t];
      }
      if (around === (around & -around)) continue;
      front[this.fronts++] = h;
      const hungry = this.hungryHex !== null && this.hungryHex[h] > 0;
      const crowded = this.pop[h] > MIGRATION.crowdedShare * map.foodCap[h];
      for (let a = 0; a < civs; a++) {
        if (!(here & (1 << a))) continue;
        const others = around & ~(1 << a);
        border[a] |= others;
        if (hungry) hungerB[a] |= others;
        if (crowded) crowdB[a] |= others;
        // Neighbours (or sharers) sitting on a deposit a still needs.
        const want = this.want ? this.want[a] : 0;
        if (!want) continue;
        if (map.deposits[h] & want) wantB[a] |= here & ~(1 << a);
        for (let d = 0; d < 6; d++) {
          const t = nb[h * 6 + d];
          if (t >= 0 && (map.deposits[t] & want)) wantB[a] |= pres[t] & ~(1 << a);
        }
      }
    }
  }

  /** Declarations (RULES.md "War", Declaring war): decided for every pair first, then applied together. */
  declare(map, year, rng, onEvent) {
    const civs = this.civs;
    const dip = this.diplomacy;
    if (!dip || civs < 2) return;
    const W = WAR;
    let decided = 0;
    const pairs = this.list;
    for (let a = 0; a < civs; a++) {
      if (this.never[a] || this.civPop[a] === 0 || this.border[a] === 0) continue;
      const avg = this.civTraits ? this.civTraits[a * TRAIT_COUNT + AGGRESSION] : 0.5;
      for (let b = 0; b < civs; b++) {
        if (b === a || !(this.border[a] & (1 << b)) || this.civPop[b] === 0) continue;
        const rel = dip.relation(a, b);
        if (rel !== NO_RELATION && rel !== PEACE) continue;
        const peace = rel === PEACE;
        let go;
        if (this.always[a]) {
          // At peace an Aggressive civ breaks it only with clearly more warriors.
          go = !peace || this.civFit[a] * this.levy[a] >= DIPLOMACY.aggressivePeaceRatio * this.civFit[b] * this.levy[b];
        } else {
          const calm = peace ? dip.calm(a, b) : 0;
          const bit = 1 << b;
          const reason = ((this.hungerB[a] & bit) && avg > W.hungerAggression + calm)
            || ((this.crowdB[a] & bit) && avg > W.crowdAggression + calm)
            || (this.civPop[a] >= W.numbersRatio * this.civPop[b] && avg > W.numbersAggression + calm)
            || ((this.wantB[a] & bit) && avg > W.wantAggression + calm)
            || (!peace && year - this.lostTo[a * civs + b] <= W.revengeYears);
          go = reason && rng.next() < avg / W.declareMonths;
        }
        if (go) pairs[decided++] = a * civs + b;
      }
    }
    for (let k = 0; k < decided; k++) {
      const a = Math.floor(pairs[k] / civs);
      const b = pairs[k] % civs;
      // Two civs declaring on each other the same month: the first (lower civ number) counts.
      if (dip.relation(a, b) === AT_WAR) continue;
      dip.declare(a, b, year, onEvent);
    }
  }

  /** Sum of civ c's fit warriors in hex h and the land hexes next to it. */
  around(map, h, c) {
    const civs = this.civs;
    let s = this.fitCnt[h * civs + c];
    for (let d = 0; d < 6; d++) {
      const t = map.neighbours[h * 6 + d];
      if (t >= 0) s += this.fitCnt[t * civs + c];
    }
    return s;
  }

  /** A besieged civ comes out to fight when its fresh levy and the warriors inside match the besiegers. */
  relieve(people, map, year, doy, rng) {
    for (const b of this.battles) {
      if (b.siegeLeft <= 0 || b.relieved) continue;
      const c = b.civ[1];
      if (this.attacking[c] !== 0) continue;
      const fresh = this.levyOf(c, this.around(map, b.hex, c));
      const ours = (b.fit[1] + fresh) * this.attack(c);
      const theirs = b.fit[0] * this.attack(b.civ[0]);
      if (fresh === 0 || ours < theirs) continue;
      // No walls out in the field: the battle starts at once, with the new levy joining the defenders.
      b.relieved = true;
      b.siegeLeft = 0;
      b.mul[1] = this.attack(c) * this.defence(map, b.hex, c, false);
      this.attacking[c] = b.uid;
      this.callUp(people, map, b, 1, rng, fresh);
    }
  }

  /** Each civ at war, not attacking yet, picks the enemy hex with the best odds and attacks it. */
  targets(people, map, year, doy, rng) {
    const civs = this.civs;
    const dip = this.diplomacy;
    const st = this.settle;
    const W = WAR;
    for (let a = 0; a < civs; a++) {
      if (this.attacking[a] !== 0 || this.civFit[a] === 0) continue;
      let enemies = 0;
      for (let b = 0; b < civs; b++) if (b !== a && this.civPop[b] > 0 && dip.relation(a, b) === AT_WAR) enemies |= 1 << b;
      if (enemies === 0) continue;
      const need = Math.max(W.minOdds, 1 - (this.civTraits ? this.civTraits[a * TRAIT_COUNT + AGGRESSION] : 0.5));
      const want = this.want ? this.want[a] : 0;
      let best = -1;
      let bestDef = -1;
      let bestScore = 0;
      for (let f = 0; f < this.fronts; f++) {
        const h = this.front[f];
        const foes = this.pres[h] & enemies;
        if (foes === 0 || this.byHex[h] >= 0 || map.terrain[h] === DEEP_WATER) continue;
        const holder = st ? st.holder[h] : -1;
        // A Cooperative civ never attacks first: it only clears enemies out of hexes it holds.
        if (this.never[a] && holder !== a) continue;
        const mine = this.around(map, h, a);
        if (mine === 0) continue;
        // The defender: the holder if it is an enemy here, otherwise the enemy with the most people here.
        let b = -1;
        if (holder >= 0 && (foes & (1 << holder))) b = holder;
        else for (let c = 0; c < civs; c++) if ((foes & (1 << c)) && (b < 0 || this.cnt[h * civs + c] > this.cnt[h * civs + b])) b = c;
        const theirs = this.around(map, h, b);
        const def = holder === b ? this.defence(map, h, b) : 1;
        const odds = theirs === 0 ? W.oddsCap
          : Math.min(W.oddsCap, (mine * this.levy[a] * this.atk[a]) / (theirs * this.levy[b] * this.atk[b] * def));
        if (odds < need) continue;
        // A siege must be over before winter.
        const walls = holder === b ? this.walls(h, b) : 0;
        if (walls > 0 && doy + Math.round(walls * W.siegeDaysPerDefence) >= WINTER_DAY) continue;
        const score = odds * ((map.deposits[h] & want) ? W.wantBonus : 1);
        if (score > bestScore) { best = h; bestDef = b; bestScore = score; }
      }
      if (best >= 0) this.begin(people, map, best, a, bestDef, year, rng);
    }
  }

  /** Battle for hex h: attacker a against defender b; both call up their levy from h and the hexes next to it. */
  begin(people, map, h, a, b, year, rng) {
    const st = this.settle;
    const holder = st ? st.holder[h] : -1;
    const bt = new Battle(this.nextUid++, h, a, b, holder === a || holder === b ? holder : -1);
    bt.started = year;
    for (let s = 0; s < 2; s++) {
      const c = bt.civ[s];
      const other = bt.civ[1 - s];
      bt.mul[s] = this.attack(c) * (holder === c ? this.defence(map, h, c) : 1);
      const k = this.level !== null && this.level[c] === MAX_LEVEL && this.level[other] !== MAX_LEVEL;
      bt.morale[s] = 1 + (k ? WAR.kingdomMorale : 0);
      this.callUp(people, map, bt, s, rng, this.levyOf(c, this.around(map, h, c)));
    }
    const walls = holder === b ? this.walls(h, b) : 0;
    if (walls > 0) {
      bt.siegeDays = Math.round(walls * WAR.siegeDaysPerDefence);
      bt.siegeLeft = bt.siegeDays;
      this.totals.sieges++;
    }
    this.attacking[a] = bt.uid;
    this.byHex[h] = this.battles.length;
    this.battles.push(bt);
    this.totals.battles++;
  }

  /**
   * Call up k of civ c's fit warriors not yet in a battle, from hex h and the hexes next to it,
   * picked at random (each as likely), onto side s of battle bt. A side that is hungry fights at
   * lower morale (set here, from everyone it called up).
   */
  callUp(people, map, bt, s, rng, k) {
    const c = bt.civ[s];
    const h = bt.hex;
    const civs = this.civs;
    const { alive, civ, age, health, hex, hunger, id } = people;
    const W = WAR;
    // Everyone eligible: the hex, then its neighbours in direction order; then pick k (selection sampling).
    let m = 0;
    const list = this.list;
    for (let d = -1; d < 6; d++) {
      const x = d < 0 ? h : map.neighbours[h * 6 + d];
      if (x < 0) continue;
      for (let i = this.head[x * civs + c]; i >= 0; i = this.next[i]) {
        // Chained at the end of last year: still alive, of this civ, here or next door, fit and free.
        if (!alive[i] || civ[i] !== c || age[i] < W.fitAge || age[i] > W.maxAge || health[i] < W.fitHealth || this.busy(people, i)) continue;
        const y = hex[i];
        let near = y === h;
        for (let e = 0; e < 6 && !near; e++) near = map.neighbours[h * 6 + e] === y;
        if (near) list[m++] = i;
      }
    }
    if (k > m) k = m;
    const old = bt.fit[s];
    const slots = new Int32Array(old + k);
    const ids = new Uint32Array(old + k);
    if (old > 0) { slots.set(bt.slots[s].subarray(0, old)); ids.set(bt.ids[s].subarray(0, old)); }
    let taken = 0;
    let hungry = 0;
    for (let j = 0; j < m && taken < k; j++) {
      if (rng.next() * (m - j) >= k - taken) continue;
      const i = list[j];
      slots[old + taken] = i;
      ids[old + taken] = id[i];
      this.inBattle[i] = bt.uid;
      this.inBattleId[i] = id[i];
      if (hunger[i] > 0) hungry++;
      taken++;
    }
    bt.slots[s] = slots;
    bt.ids[s] = ids;
    bt.fit[s] = old + taken;
    bt.start[s] += taken;
    if (taken > 0 && hungry >= W.hungryShare * taken) bt.morale[s] -= W.hungryMorale;
  }

  /** Food of each besieged hex, kept before the season's regrowth (nothing grows outside the walls) … */
  holdFood(map) {
    for (const b of this.battles) if (b.siegeLeft > 0) b.savedFood = map.food[b.hex];
  }

  /** … and put back after it. */
  restoreFood(map) {
    for (const b of this.battles) if (b.siegeLeft > 0) map.food[b.hex] = b.savedFood;
  }

  /**
   * One day of every battle under way. onDeath(slot, cause) before a war death is removed;
   * onBattle(hex, attacker, defender, holder, winner, killedByWinner, killedByLoser) when one
   * ends with a winner; onSettle is passed to the settlement capture.
   */
  day(people, map, year, doy, rng, onDeath, onBattle, onSettle) {
    if (this.battles.length === 0) return;
    const ended = this.ended;
    ended.length = 0;
    for (let k = 0; k < this.battles.length; k++) {
      const bt = this.battles[k];
      if (bt.siegeLeft > 0) {
        // Winter lifts a siege: the attackers go home.
        if (doy === WINTER_DAY) { this.totals.siegesLifted++; this.finish(bt); continue; }
        bt.siegeLeft--;
        continue;
      }
      const r = this.fightDay(people, bt, rng, onDeath);
      if (r < 0) continue;
      bt.won = r;
      ended.push(bt);
    }
    if (ended.length > 0) this.resolveAll(people, map, year, rng, onDeath, onBattle, onSettle);
    if (ended.length > 0 || this.battles.some((b) => b.uid === 0)) {
      this.battles = this.battles.filter((b) => b.uid !== 0);
      this.byHex.fill(-1);
      this.battles.forEach((b, i) => { this.byHex[b.hex] = i; });
    }
  }

  /**
   * The battles that ended today, in the order they began: one pass finds everyone in their hexes
   * (before anyone flees, so one battle's refugees never join another's), then each is resolved.
   */
  resolveAll(people, map, year, rng, onDeath, onBattle, onSettle) {
    const ended = this.ended;
    const at = this.endAt;
    for (let e = 0; e < ended.length; e++) at[ended[e].hex] = e;
    const { alive, hex } = people;
    const list = this.list;
    const tag = this.tag;
    let m = 0;
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const e = at[hex[i]];
      if (e < 0) continue;
      list[m] = i;
      tag[m++] = e;
    }
    for (let e = 0; e < ended.length; e++) at[ended[e].hex] = -1;
    for (let e = 0; e < ended.length; e++) this.resolve(people, map, ended[e], e, m, year, rng, onDeath, onBattle, onSettle);
  }

  /**
   * A battle won by side bt.won: the loser's people in the hex flee (after a sack if it was
   * besieged), an attacker that won moves its fit warriors in, and the winner takes the hex if it
   * has people there. Its people are the entries of list (0 … m − 1) tagged e.
   */
  resolve(people, map, bt, e, m, year, rng, onDeath, onBattle, onSettle) {
    const civs = this.civs;
    const h = bt.hex;
    const win = bt.won;
    const w = bt.civ[win];
    const l = bt.civ[1 - win];
    const { alive, hex, civ } = people;
    const { list, tag } = this;
    this.fought[h] = 1;
    // The loser's people in the hex, and (for a sack) those of them who did not fight.
    let losers = 0;
    let civilians = 0;
    // Whether the winner has people here already (then it takes the hex even if no attacker moves in).
    let here = false;
    for (let j = 0; j < m; j++) {
      if (tag[j] !== e) continue;
      const i = list[j];
      if (!alive[i]) continue;
      if (civ[i] === w) { here = true; continue; }
      if (civ[i] !== l) continue;
      losers++;
      if (this.inBattle[i] !== bt.uid || this.inBattleId[i] !== people.id[i]) civilians++;
    }
    let sacked = 0;
    if (bt.siegeDays > 0 && !bt.relieved && win === 0) {
      let k = Math.floor((civilians * WAR.sackPct) / 100);
      let seen = 0;
      for (let j = 0; j < m && k > 0; j++) {
        if (tag[j] !== e) continue;
        const i = list[j];
        if (!alive[i] || civ[i] !== l || (this.inBattle[i] === bt.uid && this.inBattleId[i] === people.id[i])) continue;
        if (rng.next() * (civilians - seen++) < k) {
          k--; sacked++;
          onDeath(i, DEATH_WAR);
          people.remove(i);
        }
      }
    }
    const to = fleeHex(map, h, this.pop, this.cnt, civs, w, l, this.inside);
    if (to >= 0 && losers > 0) {
      for (let j = 0; j < m; j++) if (tag[j] === e && alive[list[j]] && civ[list[j]] === l) hex[list[j]] = to;
      // Who is where, as the month's decisions read it: the loser has gone next door.
      this.pres[h] &= ~(1 << l);
      this.pres[to] |= 1 << l;
      const moved = this.cnt[h * civs + l];
      this.cnt[to * civs + l] += moved;
      this.cnt[h * civs + l] = 0;
      this.pop[to] += moved;
      this.pop[h] -= moved;
    }
    // The winning attackers move in.
    if (win === 0 && bt.fit[0] > 0) {
      for (let j = 0; j < bt.fit[0]; j++) hex[bt.slots[0][j]] = h;
      here = true;
      this.pres[h] |= 1 << w;
      this.cnt[h * civs + w] += bt.fit[0];
      this.pop[h] += bt.fit[0];
    }
    if (here && this.settle && this.settle.holder[h] !== w) this.settle.capture(h, w, this.level, year, onSettle);
    // Nobody came to defend an open hex: the attacker walked in. No fight, so it keeps no war going
    // (quiet years, revenge, Aggressive wins) and stays out of the battle counts.
    if (bt.start[1] === 0 && bt.siegeDays === 0) {
      this.totals.battles--;
      this.totals.occupied++;
    } else {
      this.lostTo[l * civs + w] = year;
      onBattle(h, bt.civ[0], bt.civ[1], bt.holder, w, bt.dead[1 - win] + sacked, bt.dead[win]);
    }
    this.finish(bt);
  }

  /** Drop warriors who died of something else or whose slot was reused. */
  sweep(people, bt, s) {
    const { alive, id } = people;
    for (let j = bt.fit[s] - 1; j >= 0; j--) {
      const i = bt.slots[s][j];
      if (!alive[i] || id[i] !== bt.ids[s][j]) this.drop(bt, s, j);
    }
  }

  /** Take warrior j of side s out of the fight (swap with the last fit one, so the list still holds everyone called up). */
  drop(bt, s, j) {
    const last = --bt.fit[s];
    const a = bt.slots[s];
    const b = bt.ids[s];
    const ts = a[j]; a[j] = a[last]; a[last] = ts;
    const ti = b[j]; b[j] = b[last]; b[last] = ti;
  }

  /** Current morale of side s: its starting morale less the share of its warriors out. */
  moraleOf(bt, s) {
    return bt.morale[s] - (bt.start[s] > 0 ? bt.out[s] / bt.start[s] : 0);
  }

  /** The day's duels. Returns the side that won the battle today (0 or 1), or −1 while it goes on. */
  fightDay(people, bt, rng, onDeath) {
    const W = WAR;
    this.sweep(people, bt, 0);
    this.sweep(people, bt, 1);
    bt.day++;
    const strength = people.traits[STRENGTH];
    if (bt.fit[0] > 0 && bt.fit[1] > 0) {
      const small = Math.min(bt.fit[0], bt.fit[1]);
      const duels = Math.max(1, Math.ceil((small * W.duelPct) / 100));
      for (let d = 0; d < duels; d++) {
        if (bt.fit[0] === 0 || bt.fit[1] === 0) break;
        const big = bt.fit[0] > bt.fit[1] ? 0 : 1;
        const one = 1 - big;
        const g = Math.min(W.maxGang, Math.floor(bt.fit[big] / bt.fit[one]));
        const j = Math.floor(rng.next() * bt.fit[one]);
        // Pick g distinct fighters of the larger side: the first g after a partial shuffle.
        const bs = bt.slots[big];
        const bi = bt.ids[big];
        let pg = 0;
        for (let x = 0; x < g; x++) {
          const y = x + Math.floor(rng.next() * (bt.fit[big] - x));
          const ts = bs[x]; bs[x] = bs[y]; bs[y] = ts;
          const ti = bi[x]; bi[x] = bi[y]; bi[y] = ti;
          pg += strength[bs[x]];
        }
        const p1 = strength[bt.slots[one][j]] * bt.mul[one] * this.moraleOf(bt, one);
        pg *= bt.mul[big] * this.moraleOf(bt, big);
        const oneWins = p1 + pg > 0 ? rng.next() * (p1 + pg) < p1 : rng.next() < 0.5;
        const side = oneWins ? big : one;
        const at = oneWins ? Math.floor(rng.next() * g) : j;
        const slot = bt.slots[side][at];
        // A war-loss bonus (War Totem, Barracks) wounds instead of kills that share of the time.
        const spared = this.eff ? this.eff.warLoss[bt.civ[side]] : 0;
        if (rng.next() * 100 < W.killPct * (1 - spared)) {
          onDeath(slot, DEATH_WAR);
          people.remove(slot);
          bt.dead[side]++;
        } else if (people.health[slot] > W.woundHealth) people.health[slot] = W.woundHealth;
        bt.out[side]++;
        this.drop(bt, side, at);
      }
    }
    const broke = (s) => bt.fit[s] === 0 || bt.out[s] * 100 >= W.breakPct * bt.start[s];
    const b0 = broke(0);
    const b1 = broke(1);
    if (b0 && b1) {
      // Both break: the one with the larger share out (the attacker on a tie) loses.
      return bt.out[0] * bt.start[1] >= bt.out[1] * bt.start[0] ? 1 : 0;
    }
    if (b0) return 1;
    if (b1) return 0;
    if (bt.day >= W.maxDays) { this.totals.pulledBack++; return 1; }
    return -1;
  }

  /** The battle is over: free its warriors and its attacker, and mark it finished. */
  finish(bt) {
    for (let s = 0; s < 2; s++) {
      const slots = bt.slots[s];
      if (!slots) continue;
      for (let j = 0; j < slots.length; j++) if (this.inBattle[slots[j]] === bt.uid) this.inBattle[slots[j]] = 0;
    }
    if (this.attacking[bt.civ[0]] === bt.uid) this.attacking[bt.civ[0]] = 0;
    if (this.attacking[bt.civ[1]] === bt.uid) this.attacking[bt.civ[1]] = 0;
    bt.uid = 0;
  }

  /** A new year: no battles fought yet this year. */
  newYear() { this.fought.fill(0); }

  /** Plain data for drawing and the inspector: every battle and siege under way. */
  summary(cols) {
    return this.battles.map((b) => ({
      hex: b.hex, col: b.hex % cols, row: Math.floor(b.hex / cols),
      attacker: b.civ[0], defender: b.civ[1], holder: b.holder,
      siege: b.siegeLeft > 0, siegeDays: b.siegeDays, siegeLeft: b.siegeLeft, day: b.day,
      warriors: [b.fit[0], b.fit[1]], start: [b.start[0], b.start[1]], dead: [b.dead[0], b.dead[1]],
      morale: [Math.round(100 * this.moraleOf(b, 0)), Math.round(100 * this.moraleOf(b, 1))],
      attack: [Math.round(100 * b.mul[0]) / 100, Math.round(100 * b.mul[1]) / 100],
    }));
  }
}

/**
 * Where a battle's losers flee: a neighbouring land hex where the winner had no
 * people at the start of the month, the one with the most food left over for its
 * people (food − people), lowest index on ties; if the winner is in every land
 * neighbour, the best of those; −1 if there is no land neighbour. A hex enclosed
 * by a Kingdom other than the loser (inside) is never a refuge.
 */
export function fleeHex(map, h, pop, cnt, civs, win, lose, inside) {
  let best = -1;
  let bestSpare = 0;
  let bestFree = false;
  for (let d = 0; d < 6; d++) {
    const t = map.neighbours[h * 6 + d];
    if (t < 0 || map.terrain[t] === DEEP_WATER) continue;
    if (inside && inside[t] >= 0 && inside[t] !== lose) continue;
    const free = cnt[t * civs + win] === 0;
    if (bestFree && !free) continue;
    const s = map.food[t] - pop[t];
    if (best < 0 || (free && !bestFree) || s > bestSpare || (s === bestSpare && t < best)) {
      best = t; bestSpare = s; bestFree = free;
    }
  }
  return best;
}
