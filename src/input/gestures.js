// Pointer gestures for the map: one-finger pan, two-finger pinch zoom, tap,
// plus mouse wheel zoom on desktop. Coordinates are CSS pixels relative to el.

const TAP_SLOP = 8;
const TAP_MAX_MS = 500;

export function attachGestures(el, { onPan, onZoom, onTap }) {
  const pointers = new Map();
  let start = null;
  let moved = false;
  let multi = false;
  let lastDist = 0;
  let lastMid = null;

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      start = { ...p, t: performance.now() };
      moved = false;
      multi = false;
    } else if (pointers.size === 2) {
      multi = true;
      const s = pinchState();
      lastDist = s.dist;
      lastMid = s.mid;
    }
  });

  el.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) moved = true;
      if (moved) onPan(p.x - prev.x, p.y - prev.y);
    } else if (pointers.size === 2) {
      const s = pinchState();
      if (lastDist > 0) onZoom(s.dist / lastDist, s.mid.x, s.mid.y);
      onPan(s.mid.x - lastMid.x, s.mid.y - lastMid.y);
      lastDist = s.dist;
      lastMid = s.mid;
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (e.type === 'pointerup' && !moved && !multi && start && performance.now() - start.t < TAP_MAX_MS) onTap(p.x, p.y);
      start = null;
    } else if (pointers.size === 1) {
      // Finished a pinch: continue as a pan from the remaining finger without a jump.
      moved = true;
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    onZoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  // Stop iOS Safari from zooming the whole page on pinch.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
}
