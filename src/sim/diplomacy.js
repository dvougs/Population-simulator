// War, truce and peace between civs, and trade between civs at peace. Every
// number here is listed in RULES.md ("Peace and trade").
//
// Every pair of civs that has fought is at war, in a truce, or at peace. A war
// ends in a truce after quiet years or when one side is exhausted; a truce
// forbids fighting for its years, then the pair is at peace until a fight
// breaks it. Civs in a truce or at peace trade: once a year their capitals
// swap what each has spare for what the other's next spend lacks, at fixed
// values, along a road over either civ's land. Nothing here is random, and
// pairs are always visited in civ order.

import { MATERIAL_COUNT, MATERIAL_TIER } from './materials.js';
import { DEEP_WATER } from './terrain.js';

export const NO_RELATION = 0;
export const WAR = 1;
export const TRUCE = 2;
export const PEACE = 3;
export const RELATION_NAMES = Object.freeze(['none', 'war', 'truce', 'peace']);

export const DIPLOMACY = Object.freeze({
  /** A war ends in a truce after this many years in a row without a fight between the two. */
  quietYears: 20,
  /** Exhaustion: war deaths against the other side over the last `span` years reach this % of a civ's people. */
  span: 20,
  exhaustPct: 10,
  /** An Aggressive civ refuses peace when it won at least this share of the pair's fights in the span (whole thirds: 2 of 3). */
  refuseWinThirds: 2,
  /** Years a truce forbids fighting, and when either civ is Aggressive. */
  truceYears: 50,
  truceYearsAggressive: 30,
  /** Share of every material in its capital store the civ that asked for peace pays the other once (tribute). */
  tribute: 0.2,
  /** At peace, the hunger, crowding and numbers triggers need this much more aggression … */
  peaceAggression: 0.15,
  /** … plus this for every tradeCalmYears of open trade, up to tradeCalmMax more. */
  tradeCalm: 0.05,
  tradeCalmYears: 20,
  tradeCalmMax: 0.15,
  /** At peace an Aggressive civ attacks only where its strength in the hex is at least this × the other's. */
  aggressivePeaceRatio: 1.5,
});

export const TRADE = Object.freeze({
  /** Value of one unit of a common, uncommon and exotic material. */
  value: Object.freeze({ common: 1, uncommon: 4, exotic: 15 }),
  /** The buyer pays this × the value of what it buys. */
  price: 1.25,
  /** Value a pair may trade in a year, before the bonuses below; half for each direction. */
  volume: 60,
  /** × this with a Market in either capital, × coop when either civ is Cooperative, × oldRoute after oldRouteYears of open trade. */
  market: 1.5,
  coop: 1.25,
  oldRoute: 1.5,
  oldRouteYears: 50,
  /** A caravan loses this share of its goods for each step between the capitals. */
  lossPerStep: 0.02,
  /** Amounts below this are not worth a caravan. */
  minLoad: 0.01,
});

/** Value of one unit of each material (MATERIAL_IDS order). */
export const MATERIAL_VALUE = Object.freeze(MATERIAL_TIER.map((t) => TRADE.value[t]));
// Exotic first: the scarcest goods are bought before the budget runs out.
const BUY_ORDER = Array.from({ length: MATERIAL_COUNT }, (_, m) => MATERIAL_COUNT - 1 - m);

export class Diplomacy {
  /** types[c]: civ c's type id. */
  constructor(map, types) {
    const civs = types.length;
    this.civs = civs;
    this.map = map;
    this.aggressive = Uint8Array.from(types, (t) => (t === 'aggressive' ? 1 : 0));
    this.cooperative = Uint8Array.from(types, (t) => (t === 'cooperative' ? 1 : 0));
    const P = civs * civs;
    // Per pair, at [lower × civs + higher]: relation, year it began, last fight, the truce's end, years of open trade.
    this.rel = new Uint8Array(P);
    this.since = new Int32Array(P);
    this.lastFight = new Int32Array(P).fill(-1000000);
    this.truceEnd = new Int32Array(P);
    this.tradeYears = new Int32Array(P);
    /** 1 where the pair's capitals were joined by a road last year (trade was open). */
    this.open = new Uint8Array(P);
    /** Steps between the two capitals this year (−1: no road). */
    this.steps = new Int32Array(P).fill(-1);
    /** 1 once a pair has traded any goods (the first is an event). */
    this.traded = new Uint8Array(P);
    const W = DIPLOMACY.span;
    // Per ordered pair [a × civs + b], per year of the span: a's people b killed, and fights a won against b.
    this.killed = new Int32Array(P * W);
    this.won = new Int32Array(P * W);
    // Per civ: value bought and sold in all, and value traded with each other civ.
    this.bought = new Float64Array(civs);
    this.sold = new Float64Array(civs);
    this.withCiv = new Float64Array(P);
    this.truces = 0;
    // Scratch for trade.
    this.need = new Float64Array(civs * MATERIAL_COUNT);
    this.spareOf = new Float64Array(civs * MATERIAL_COUNT);
    this.dist = new Int32Array(map.count).fill(-1);
    this.sea = new Uint8Array(map.count);
    this.queue = new Int32Array(map.count);
  }

  key(a, b) { return a < b ? a * this.civs + b : b * this.civs + a; }

  relation(a, b) { return a === b ? NO_RELATION : this.rel[this.key(a, b)]; }

  /** Trade is open between a and b (their capitals were joined last year, in a truce or at peace). */
  tradeOpen(a, b) { return a !== b && this.open[this.key(a, b)] === 1; }

  /** Extra aggression a needs to attack b at peace: peaceAggression plus the calm of their trade. */
  calm(a, b) {
    const D = DIPLOMACY;
    const t = this.tradeYears[this.key(a, b)];
    return D.peaceAggression + Math.min(D.tradeCalmMax, D.tradeCalm * Math.floor(t / D.tradeCalmYears));
  }

  /** A fight between winner and loser this year; byWinner: the loser's people killed, byLoser: the winner's. Returns true when it broke a peace. */
  fight(year, winner, loser, byWinner, byLoser, onEvent) {
    const civs = this.civs;
    const k = this.key(winner, loser);
    const slot = year % DIPLOMACY.span;
    const W = DIPLOMACY.span;
    this.killed[(loser * civs + winner) * W + slot] += byWinner;
    this.killed[(winner * civs + loser) * W + slot] += byLoser;
    this.won[(winner * civs + loser) * W + slot]++;
    this.lastFight[k] = year;
    const was = this.rel[k];
    if (was === WAR) return false;
    this.rel[k] = WAR;
    this.since[k] = year;
    this.open[k] = 0;
    this.tradeYears[k] = 0;
    if (was === PEACE || was === TRUCE) onEvent?.('war', Math.min(winner, loser), Math.max(winner, loser), year, 0);
    return was === PEACE || was === TRUCE;
  }

  /** a's people killed by b over the span, and fights a won against b. */
  windowSum(arr, a, b) {
    const W = DIPLOMACY.span;
    const base = (a * this.civs + b) * W;
    let s = 0;
    for (let k = 0; k < W; k++) s += arr[base + k];
    return s;
  }

  /**
   * The year's end, after the fights: wars end in truces, truces turn to peace. civPop: people per civ
   * now. st: the Settlements (capital stores pay tribute). forgive(a, b): wipe their revenge.
   * onEvent(kind, a, b, year, value) reports 'truce' (value: 1 + the civ that paid tribute, 0 for none).
   */
  endYear(year, civPop, st, forgive, onEvent) {
    const civs = this.civs;
    const D = DIPLOMACY;
    for (let a = 0; a < civs; a++) {
      for (let b = a + 1; b < civs; b++) {
        const k = a * civs + b;
        if (civPop[a] === 0 || civPop[b] === 0) continue;
        if (this.rel[k] === TRUCE && year >= this.truceEnd[k]) { this.rel[k] = PEACE; this.since[k] = year; continue; }
        if (this.rel[k] !== WAR) continue;
        const quiet = year - this.lastFight[k] >= D.quietYears;
        let asker = -1;
        if (!quiet) {
          // The side whose war deaths against the other weigh most on it asks, once they reach exhaustPct.
          const lostA = this.windowSum(this.killed, a, b) * 100;
          const lostB = this.windowSum(this.killed, b, a) * 100;
          const tiredA = lostA >= D.exhaustPct * civPop[a];
          const tiredB = lostB >= D.exhaustPct * civPop[b];
          if (tiredA && tiredB) asker = lostA * civPop[b] >= lostB * civPop[a] ? a : b;
          else if (tiredA) asker = a;
          else if (tiredB) asker = b;
          if (asker < 0) continue;
          const other = asker === a ? b : a;
          // A winning Aggressive civ refuses.
          const wins = this.windowSum(this.won, other, asker);
          const fights = wins + this.windowSum(this.won, asker, other);
          if (this.aggressive[other] && wins * 3 >= fights * D.refuseWinThirds) continue;
        }
        this.rel[k] = TRUCE;
        this.since[k] = year;
        this.truceEnd[k] = year + (this.aggressive[a] || this.aggressive[b] ? D.truceYearsAggressive : D.truceYears);
        this.truces++;
        forgive(a, b);
        if (asker >= 0) this.tribute(st, asker, asker === a ? b : a);
        onEvent?.('truce', a, b, year, asker + 1);
      }
    }
    // The span moves on: next year's slot starts empty.
    const W = D.span;
    const slot = (year + 1) % W;
    for (let p = 0; p < civs * civs; p++) { this.killed[p * W + slot] = 0; this.won[p * W + slot] = 0; }
  }

  /** The civ that asked for peace pays tribute: a share of every material in its capital store, to the other's capital (as far as it has room). */
  tribute(st, from, to) {
    const hf = st.capital[from];
    const ht = st.capital[to];
    if (hf < 0 || ht < 0) return;
    for (let m = 0; m < MATERIAL_COUNT; m++) {
      const i = hf * MATERIAL_COUNT + m;
      const j = ht * MATERIAL_COUNT + m;
      const v = Math.min(st.store[i] * DIPLOMACY.tribute, Math.max(0, st.storeCap[ht] - st.store[j]));
      if (v <= 0) continue;
      st.store[i] -= v;
      st.store[j] += v;
    }
  }

  /**
   * Steps along the road between the capitals of a and b: over land either holds, and across water
   * within the larger boat range of the two (boats[c]); −1 when there is none.
   */
  road(st, a, b, boats) {
    const from = st.capital[a];
    const to = st.capital[b];
    if (from < 0 || to < 0) return -1;
    if (from === to) return 0;
    const { neighbours, terrain } = this.map;
    const { dist, sea, queue } = this;
    const range = Math.max(boats ? boats[a] : 0, boats ? boats[b] : 0);
    let head = 0;
    let tail = 0;
    dist[from] = 0;
    queue[tail++] = from;
    let found = -1;
    while (head < tail) {
      const h = queue[head++];
      if (h === to) { found = dist[h]; break; }
      const wet = terrain[h] === DEEP_WATER;
      for (let d = 0; d < 6; d++) {
        const t = neighbours[h * 6 + d];
        if (t < 0 || dist[t] >= 0) continue;
        if (terrain[t] === DEEP_WATER) {
          const run = wet ? sea[h] + 1 : 1;
          if (run > range) continue;
          sea[t] = run;
        } else if (st.holder[t] !== a && st.holder[t] !== b) continue;
        dist[t] = dist[h] + 1;
        queue[tail++] = t;
      }
    }
    for (let i = 0; i < tail; i++) dist[queue[i]] = -1;
    return found;
  }

  /**
   * The year's trade, in step 1 after the supply routes. want[c × M + m]: what civ c's capital is
   * saving for (its committed wonder, next level and era building). For every pair in a truce or
   * at peace whose capitals a road joins, each side buys what it lacks and the other has spare.
   * onEvent(kind, a, b, year, value) reports 'trade' (the first goods between a pair) and 'oldRoute'.
   */
  trade(st, want, boats, hasMarket, year, onEvent) {
    const civs = this.civs;
    const M = MATERIAL_COUNT;
    const { need, spareOf } = this;
    for (let c = 0; c < civs; c++) {
      const h = st.capital[c];
      for (let m = 0; m < M; m++) {
        const have = h >= 0 ? st.store[h * M + m] : 0;
        need[c * M + m] = h >= 0 ? Math.max(0, want[c * M + m] - have) : 0;
        spareOf[c * M + m] = h >= 0 ? Math.max(0, have - want[c * M + m]) : 0;
      }
    }
    for (let a = 0; a < civs; a++) {
      for (let b = a + 1; b < civs; b++) {
        const k = a * civs + b;
        const r = this.rel[k];
        if (r !== TRUCE && r !== PEACE) { this.open[k] = 0; this.steps[k] = -1; continue; }
        const steps = this.road(st, a, b, boats);
        this.steps[k] = steps;
        if (steps < 0) { this.open[k] = 0; continue; }
        this.open[k] = 1;
        this.tradeYears[k]++;
        if (this.tradeYears[k] === TRADE.oldRouteYears) onEvent?.('oldRoute', a, b, year, 0);
        const T = TRADE;
        let volume = T.volume;
        if (hasMarket(st.capital[a]) || hasMarket(st.capital[b])) volume *= T.market;
        if (this.cooperative[a] || this.cooperative[b]) volume *= T.coop;
        if (this.tradeYears[k] >= T.oldRouteYears) volume *= T.oldRoute;
        const keep = Math.max(0, 1 - T.lossPerStep * steps);
        if (keep <= 0) continue;
        const moved = this.exchange(st, a, b, volume / 2, keep) + this.exchange(st, b, a, volume / 2, keep);
        if (moved > 0 && this.traded[k] === 0) { this.traded[k] = 1; onEvent?.('trade', a, b, year, 0); }
      }
    }
  }

  /** Buyer buys from seller up to `budget` value; goods arrive × keep both ways. Returns the value bought. */
  exchange(st, buyer, seller, budget, keep) {
    const M = MATERIAL_COUNT;
    const T = TRADE;
    const { need, spareOf } = this;
    const hb = st.capital[buyer];
    const hs = st.capital[seller];
    const nb = buyer * M;
    const ns = seller * M;
    let total = 0;
    for (const m of BUY_ORDER) {
      if (budget <= T.minLoad) break;
      if (need[nb + m] <= 0 || spareOf[ns + m] <= 0) continue;
      const val = MATERIAL_VALUE[m];
      // What the buyer can pay with: everything it has spare, except this material.
      let payable = 0;
      for (let x = 0; x < M; x++) if (x !== m) payable += spareOf[nb + x] * MATERIAL_VALUE[x];
      let q = Math.min(need[nb + m] / keep, spareOf[ns + m], budget / val, payable / (T.price * val));
      if (q < T.minLoad) continue;
      st.store[hs * M + m] -= q;
      st.store[hb * M + m] += q * keep;
      spareOf[ns + m] -= q;
      need[nb + m] -= q * keep;
      budget -= q * val;
      total += q * val;
      // Payment: first what the seller lacks, then what the buyer has most of (by value), in material order on ties.
      let owe = q * val * T.price;
      for (let pass = 0; pass < 2 && owe > T.minLoad; pass++) {
        while (owe > T.minLoad) {
          let x = -1;
          for (let y = 0; y < M; y++) {
            if (y === m || spareOf[nb + y] <= 0) continue;
            if (pass === 0 && need[ns + y] <= 0) continue;
            if (x < 0 || spareOf[nb + y] * MATERIAL_VALUE[y] > spareOf[nb + x] * MATERIAL_VALUE[x]) x = y;
          }
          if (x < 0) break;
          const vx = MATERIAL_VALUE[x];
          let amt = Math.min(spareOf[nb + x], owe / vx);
          if (pass === 0) amt = Math.min(amt, need[ns + x] / keep);
          if (amt <= 0) break;
          st.store[hb * M + x] -= amt;
          st.store[hs * M + x] += amt * keep;
          spareOf[nb + x] -= amt;
          need[ns + x] = Math.max(0, need[ns + x] - amt * keep);
          owe -= amt * vx;
        }
      }
      this.bought[buyer] += q * val;
      this.sold[seller] += q * val;
      this.withCiv[buyer * this.civs + seller] += q * val;
      this.withCiv[seller * this.civs + buyer] += q * val;
    }
    return total;
  }

  /** Plain data: every pair that has met in war, and each civ's trade. */
  summary(year) {
    const civs = this.civs;
    const pairs = [];
    for (let a = 0; a < civs; a++) {
      for (let b = a + 1; b < civs; b++) {
        const k = a * civs + b;
        if (this.rel[k] === NO_RELATION) continue;
        pairs.push({ civs: [a, b], relation: RELATION_NAMES[this.rel[k]], since: this.since[k],
          truceEnds: this.rel[k] === TRUCE ? this.truceEnd[k] : null, tradeOpen: this.open[k] === 1, tradeYears: this.tradeYears[k],
          roadSteps: this.steps[k] });
      }
    }
    const trade = [];
    for (let c = 0; c < civs; c++) {
      let partner = -1;
      for (let o = 0; o < civs; o++) if (o !== c && this.withCiv[c * civs + o] > 0 && (partner < 0 || this.withCiv[c * civs + o] > this.withCiv[c * civs + partner])) partner = o;
      trade.push({ bought: this.bought[c], sold: this.sold[c], partner });
    }
    return { year, pairs, trade, truces: this.truces };
  }
}
