// Feature flags (RULES.md "Feature flags"): switches for work that ships
// before it is the default, so it can be tried on the live site on demand.
// Each flag is off unless the player turns it on; the choice is kept on the
// device. An address with ?3d=1 (or ?3d=0) sets the 3D flag on opening, so a
// link can show either look. No DOM here beyond the storage and address the
// caller hands in, so the logic is unit-tested in Node.

/** Every flag: its default and the address parameter that sets it. */
export const FLAGS = Object.freeze({
  /** The new three.js 3D graphics engine (for now: the home page's world). */
  graphics3d: Object.freeze({ default: false, param: '3d' }),
});

export const FLAGS_KEY = 'popsim.flags';

const ON = new Set(['1', 'on', 'true', 'yes']);
const OFF = new Set(['0', 'off', 'false', 'no']);

/**
 * Flags read from `storage` (a Storage-like object, or null) and the page
 * address's `search` string. Storage that throws (private mode, blocked site
 * data) is treated as empty: the flags still work for the visit.
 */
export function createFlags(storage = null, search = '') {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(FLAGS_KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  const values = {};
  for (const [name, def] of Object.entries(FLAGS)) values[name] = typeof saved[name] === 'boolean' ? saved[name] : def.default;
  const params = new URLSearchParams(search);
  let fromAddress = false;
  for (const [name, def] of Object.entries(FLAGS)) {
    const v = params.get(def.param)?.toLowerCase();
    if (v === undefined) continue;
    if (ON.has(v)) { values[name] = true; fromAddress = true; } else if (OFF.has(v)) { values[name] = false; fromAddress = true; }
  }
  const listeners = new Set();
  const save = () => {
    try { storage?.setItem(FLAGS_KEY, JSON.stringify(values)); } catch { /* kept for this visit only */ }
  };
  if (fromAddress) save();

  return {
    /** Whether flag `name` is on. */
    get(name) {
      if (!(name in FLAGS)) throw new Error(`unknown flag "${name}"`);
      return values[name];
    },
    /** Turn flag `name` on or off, keep it, and tell the listeners (only when it changes). */
    set(name, on) {
      if (!(name in FLAGS)) throw new Error(`unknown flag "${name}"`);
      if (values[name] === !!on) return;
      values[name] = !!on;
      save();
      for (const fn of listeners) fn(name, values[name]);
    },
    /** Call fn(name, on) on every change; returns a function that stops it. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Every flag's value, as plain data. */
    all() { return { ...values }; },
  };
}
