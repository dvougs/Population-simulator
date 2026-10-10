// Seeded PRNG (sfc32) with string seeds hashed by cyrb128.
// All randomness in the sim must come from here so runs are reproducible.

export function hashSeed(str) {
  str = String(str);
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  constructor(seed) {
    const [a, b, c, d] = hashSeed(seed);
    this.a = a; this.b = b; this.c = c; this.d = d;
    // Discard the first outputs; sfc32 needs a few rounds to mix.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next() {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n) {
    return Math.floor(this.next() * n);
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** Independent child stream, so adding draws in one system doesn't shift another. */
  fork(label) {
    return new Rng(`${this.nextU32()}:${label}`);
  }
}

/** Random human-friendly seed string. Uses Math.random: only for UI "randomise". */
export function randomSeedString() {
  const syllables = ['ka', 'lo', 'mi', 'ra', 'tu', 'ne', 'so', 'vi', 'da', 'ze', 'po', 'shi', 'an', 'el', 'or'];
  let s = '';
  for (let i = 0; i < 3; i++) s += syllables[Math.floor(Math.random() * syllables.length)];
  return s + Math.floor(Math.random() * 100);
}
