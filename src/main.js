// Boot: wires the map-generation and setup screens, sim host, renderer, input and controls together.

import { LocalSimHost } from './host/simHost.js';
import { Loop } from './loop.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { hexAtWorld, hexCentre, worldBounds } from './render/layout.js';
import { attachGestures } from './input/gestures.js';
import { MapgenScreen } from './ui/mapgenScreen.js';
import { SetupScreen } from './ui/setupScreen.js';
import { initBottomSheet } from './ui/bottomSheet.js';
import { initControls } from './ui/controls.js';
import { renderInspector } from './ui/inspector.js';
import { renderStats } from './ui/statsPanel.js';
import { mapParams } from './sim/params.js';
import { DEEP_WATER } from './sim/terrain.js';

const $ = (id) => document.getElementById(id);
const ui = {
  mapgen: $('mapgen'), setup: $('setup'), game: $('game'), resume: $('btn-resume'),
  canvas: $('map'), year: $('hud-year'), pop: $('hud-pop'), inspector: $('inspector'), toast: $('toast'),
  sheet: $('sheet'), handle: $('sheet-handle'), stats: $('stats'),
};

const host = new LocalSimHost();
const camera = new Camera();
const renderer = new Renderer(ui.canvas);
let rendererReady = null;
let map = null;
let selected = -1;
let dirty = true;
let userMovedCamera = false;
let lastPanelUpdate = 0;
let shownEnd = false;

const loop = new Loop({
  tick: (n) => host.tick(n),
  frame: (ran, now) => {
    if (dirty) { renderer.draw(camera, selected); dirty = false; }
    if (ran > 0 && now - lastPanelUpdate > 100) { updatePanels(); lastPanelUpdate = now; }
    if (host.finished && !shownEnd) {
      shownEnd = true;
      updatePanels();
      controls.setPaused(true);
      showToast(host.stats().endReason);
    }
  },
});

const controls = initControls({
  playBtn: $('btn-play'), stepBtn: $('btn-step'), speedEl: $('speed'), loop,
});
initBottomSheet(ui.sheet, ui.handle);

const mapgen = new MapgenScreen(
  { form: $('mapgen-form'), canvas: $('preview'), info: $('preview-info') },
  {
    preview: (params) => host.preview(params),
    onContinue: (params) => {
      setup.setParams(params);
      showScreen('setup');
    },
  },
);
const setup = new SetupScreen($('setup-form'), {
  onStart: (params) => startGame(params),
  onChangeMap: (params) => {
    mapgen.setParams(params, 'custom');
    showScreen('mapgen');
  },
});

async function startGame(params) {
  showScreen('game');
  try {
    rendererReady ??= renderer.init();
    await rendererReady;
  } catch (err) {
    showToast('This browser cannot draw the map (WebGL is unavailable).');
    console.warn(err);
    return;
  }
  host.start(params);
  map = host.map();
  renderer.setMap(map);
  camera.setBounds(worldBounds(map.cols, map.rows));
  selected = -1;
  shownEnd = false;
  userMovedCamera = false;
  renderInspector(ui.inspector, null);
  ui.toast.hidden = true;
  resize();
  fitCamera();
  loop.setPaused(false);
  loop.setSpeed(loop.speedIndex);
  controls.sync();
  updatePanels();
  loop.start();
  try { localStorage.setItem('popsim:lastParams', JSON.stringify(host.params)); } catch { /* storage unavailable */ }
}

function showScreen(name) {
  ui.mapgen.hidden = name !== 'mapgen';
  ui.setup.hidden = name !== 'setup';
  ui.game.hidden = name !== 'game';
  ui.resume.hidden = !(name === 'setup' && host.sim);
}

function updatePanels() {
  const stats = host.stats();
  if (!stats) return;
  ui.year.textContent = `Year ${stats.tick}${stats.finished ? ' (ended)' : ''}`;
  const land = map.cols * map.rows - stats.terrainCounts[DEEP_WATER];
  ui.pop.textContent = `${map.cols} × ${map.rows} hexes · ${land} land · no people yet`;
  renderStats(ui.stats, stats);
}

function select(index) {
  selected = index;
  if (index < 0) renderInspector(ui.inspector, null);
  else renderInspector(ui.inspector, host.inspect(index % map.cols, Math.floor(index / map.cols)), () => select(-1));
  dirty = true;
}

let toastTimer = 0;
function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 5000);
}

/** Space the collapsed sheet takes: along the bottom in portrait, down the right side as a corner panel. */
function sheetInsets() {
  const r = ui.sheet.getBoundingClientRect();
  const cornerPanel = r.left > 20;
  return cornerPanel ? { right: camera.viewW - r.left + 8 } : { bottom: r.height };
}

function fitCamera() {
  camera.fit({ top: 64, ...sheetInsets() });
  dirty = true;
}

function resize() {
  const r = ui.canvas.getBoundingClientRect();
  renderer.resize(r.width, r.height, Math.min(3, window.devicePixelRatio || 1));
  camera.setView(r.width, r.height);
  if (!userMovedCamera && map) fitCamera();
  else camera.clamp();
  dirty = true;
}

new ResizeObserver(() => { if (!ui.game.hidden) resize(); }).observe(ui.canvas);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

attachGestures(ui.canvas, {
  onPan: (dx, dy) => { camera.pan(dx, dy); userMovedCamera = true; dirty = true; },
  onZoom: (f, x, y) => { camera.zoomAt(f, x, y); userMovedCamera = true; dirty = true; },
  onTap: (x, y) => {
    if (!map) return;
    const w = camera.screenToWorld(x, y);
    const hex = hexAtWorld(map.cols, map.rows, w.x, w.y);
    // Water, off the map, or the selected hex again: close the inspector.
    if (!hex || map.terrain[hex.index] === DEEP_WATER || hex.index === selected) { select(-1); return; }
    select(hex.index);
  },
});

$('btn-fit').addEventListener('click', () => { userMovedCamera = false; fitCamera(); });
$('btn-setup').addEventListener('click', () => {
  controls.setPaused(true);
  setup.setParams(host.params);
  showScreen('setup');
});
ui.resume.addEventListener('click', () => { showScreen('game'); resize(); });

try {
  const saved = JSON.parse(localStorage.getItem('popsim:lastParams') || 'null');
  if (saved) mapgen.setParams(saved, 'custom');
} catch { /* ignore bad saved params */ }
showScreen('mapgen');

// Exposed for the browser tests and for poking at the sim from devtools.
window.popsim = {
  host, loop, camera, startGame,
  /** Current year of the running game (0 before a game starts). */
  year: () => host.tickCount,
  /** Map settings of the running game, or null. */
  mapParams: () => (host.params ? mapParams(host.params) : null),
  /** Hash of the running game's map, or null. */
  mapHash: () => host.mapHash(),
  /** Settings and map hash shown on the map-generation screen. */
  previewParams: () => mapParams(mapgen.getParams()),
  previewHash: () => mapgen.map?.hash ?? null,
  /** Description of hex (col, row) in the running game (terrain id, values shown in the inspector), or null. */
  hex: (col, row) => host.inspect(col, row),
  terrainAt: (col, row) => host.inspect(col, row)?.terrain ?? null,
  /** Screen position (CSS px, relative to the map canvas) of the centre of hex (col, row). */
  hexToScreen: (col, row) => {
    const c = hexCentre(map.cols, row * map.cols + col);
    return camera.worldToScreen(c.x, c.y);
  },
  /** Index of the hex shown in the inspector, or -1. */
  selected: () => selected,
};
