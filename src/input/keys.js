// Keyboard control of the map (RULES.md "How civs and people look", Moving
// the map): the arrow keys move the view the way they point for as long as
// they are held, + and − zoom about the middle of the view. The movement runs
// on its own animation frames while a key is down, at a speed in screen pixels
// a second, so it is the same at any frame rate and at any zoom.

/** View speed while an arrow is held (CSS px a second), and how much faster with Shift. */
export const KEY_PAN_PX_S = 600;
export const KEY_FAST = 2.5;
/** Zoom while + or − is held: this factor a second. */
export const KEY_ZOOM_PER_S = 2.5;

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const ZOOM_IN = new Set(['+', '=']);
const ZOOM_OUT = new Set(['-', '_']);

/**
 * How far to move the map's contents for the held arrows over dtMs: the view
 * goes the way the arrows point, so the contents move the other way. Two
 * arrows together move diagonally at the same speed.
 */
export function keyPanStep(held, dtMs, fast = false) {
  let x = 0; let y = 0;
  for (const key of held) {
    const d = ARROWS[key];
    if (d) { x += d[0]; y += d[1]; }
  }
  const len = Math.hypot(x, y);
  if (len === 0) return { dx: 0, dy: 0 };
  const dist = (KEY_PAN_PX_S * (fast ? KEY_FAST : 1) * dtMs) / 1000;
  return { dx: (-x / len) * dist, dy: (-y / len) * dist };
}

/** Zoom factor for the held + and − keys over dtMs (1: no zoom). */
export function keyZoomStep(held, dtMs) {
  let dir = 0;
  for (const key of held) {
    if (ZOOM_IN.has(key)) dir += 1;
    else if (ZOOM_OUT.has(key)) dir -= 1;
  }
  if (dir === 0) return 1;
  return KEY_ZOOM_PER_S ** ((Math.sign(dir) * dtMs) / 1000);
}

const handled = (key) => key in ARROWS || ZOOM_IN.has(key) || ZOOM_OUT.has(key);

/**
 * Listen on `target` (the window) while `active()` says the map is on show.
 * onPan(dx, dy) and onZoom(factor) take the same values as the gestures.
 * Keys typed into a form field are left alone.
 */
export function attachKeys(target, { active, onPan, onZoom }) {
  const held = new Set();
  let fast = false;
  let raf = 0;
  let last = 0;

  const frame = (now) => {
    raf = 0;
    if (held.size === 0 || !active()) { held.clear(); return; }
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    const { dx, dy } = keyPanStep(held, dt, fast);
    if (dx || dy) onPan(dx, dy);
    const f = keyZoomStep(held, dt);
    if (f !== 1) onZoom(f);
    raf = requestAnimationFrame(frame);
  };

  target.addEventListener('keydown', (e) => {
    fast = e.shiftKey;
    if (!handled(e.key) || e.ctrlKey || e.metaKey || e.altKey || !active()) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName ?? ''))) return;
    e.preventDefault(); // no page scroll or browser zoom
    held.add(e.key);
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  });
  target.addEventListener('keyup', (e) => {
    fast = e.shiftKey;
    held.delete(e.key);
    // A shifted + can come up as =, so lift both spellings.
    if (ZOOM_IN.has(e.key)) for (const k of ZOOM_IN) held.delete(k);
    if (ZOOM_OUT.has(e.key)) for (const k of ZOOM_OUT) held.delete(k);
  });
  // Keys released while the page was in the background never send keyup.
  target.addEventListener('blur', () => held.clear());
}
