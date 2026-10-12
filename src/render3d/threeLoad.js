// Getting three.js going, shared by the 3D scenes: the vendored module is
// fetched only on first use, so the 2D game never downloads it.

import { isSoftwareGl } from '../render/gpu.js';

let threeLoad = null;
/** The vendored three.js module, fetched on first use. */
export const loadThree = () => (threeLoad ??= import('../../vendor/three.mjs'));

/** Whether this browser draws WebGL in software (true), on a GPU (false), or not at all (null). */
export function probeGl() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const soft = isSoftwareGl(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return soft;
  } catch {
    return null;
  }
}

/** Sky light and a sun casting shadows (when `shadows`); returns the sun, already added to `scene`. */
export function addLights(T, scene, shadows, mapSize = 1024) {
  scene.add(new T.HemisphereLight(0xe4f0ff, 0x30384a, 1.9));
  const sun = new T.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  return sun;
}

/** Aim the sun at board `b` from the north-west, its shadow box covering `span` hex radii round (cx, cz). */
export function aimSun(sun, b, cx = b.cx, cz = b.cz, span = Math.max(b.w, b.d)) {
  const full = Math.max(b.w, b.d);
  sun.position.set(cx - full * 0.55, full * 1.1, cz - full * 0.7);
  sun.target.position.set(cx, 0, cz);
  sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera;
  const r = span * 0.75;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
  sc.near = 0.5; sc.far = full * 3;
  sc.updateProjectionMatrix();
}
