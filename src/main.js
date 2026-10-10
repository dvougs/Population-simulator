// Boot: wires the setup screen, sim host, renderer, input and controls together.

import { LocalSimHost } from './host/simHost.js';
import { Loop } from './loop.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { attachGestures } from './input/gestures.js';
import { SetupScreen } from './ui/setupScreen.js';
import { initBottomSheet } from './ui/bottomSheet.js';
import { initControls } from './ui/controls.js';
import { renderInspector } from './ui/inspector.js';
import { renderStats } from './ui/statsPanel.js';
import { formatNumber } from './ui/dom.js';

const $ = (id) => document.getElementById(id);
const ui = {
  setup: $('setup'), game: $('game'), form: $('setup-form'), resume: $('btn-resume'),
  canvas: $('map'), year: $('hud-year'), pop: $('hud-pop'), inspector: $('inspector'), toast: $('toast'),
  sheet: $('sheet'), handle: $('sheet-handle'), stats: $('stats'),
};

const host = new LocalSimHost();
const camera = new Camera();
const renderer = new Renderer(ui.canvas);
let selected = null;
let dirty = true;
let imageDirty = false;
let userMovedCamera = false;
let lastPanelUpdate = 0;
let shownEnd = false;

const loop = new Loop({
  tick: (n) => host.tick(n),
  frame: (ran, now) => {
    if (ran > 0) imageDirty = true;
    if (imageDirty) { renderer.updateImage(); imageDirty = false; dirty = true; }
    if (dirty) { renderer.draw(camera, selected); dirty = false; }
    if (ran > 0 || now - lastPanelUpdate > 1000) {
      if (now - lastPanelUpdate > 250) { updatePanels(); lastPanelUpdate = now; }
    }
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
const sheet = initBottomSheet(ui.sheet, ui.handle);

const setup = new SetupScreen(ui.form, { onStart: startGame });

function startGame(params) {
  host.start(params);
  renderer.setWorld(host.world, host.civs);
  camera.setMap(host.world.width, host.world.height);
  selected = null;
  shownEnd = false;
  userMovedCamera = false;
  renderInspector(ui.inspector, null);
  ui.toast.hidden = true;
  showScreen('game');
  resize();
  fitCamera();
  loop.setPaused(false);
  loop.setSpeed(loop.speedIndex);
  controls.sync();
  updatePanels();
  loop.start();
  try { localStorage.setItem('popsim:lastParams', JSON.stringify(params)); } catch { /* storage unavailable */ }
}

function showScreen(name) {
  ui.setup.hidden = name !== 'setup';
  ui.game.hidden = name !== 'game';
  ui.resume.hidden = !(name === 'setup' && host.sim);
}

function updatePanels() {
  const stats = host.stats();
  if (!stats) return;
  ui.year.textContent = `Year ${stats.tick}${stats.finished ? ' (ended)' : ''}`;
  ui.pop.textContent = `${formatNumber(stats.totalPop)} people · ${stats.civs.filter((c) => c.alive).length}/${stats.civs.length} civs`;
  renderStats(ui.stats, stats);
  if (selected) renderInspector(ui.inspector, host.inspect(selected.x, selected.y), clearSelection);
}

function clearSelection() {
  selected = null;
  renderInspector(ui.inspector, null);
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
  if (!userMovedCamera && host.world) fitCamera();
  else camera.clamp();
  dirty = true;
}

new ResizeObserver(() => { if (!ui.game.hidden) resize(); }).observe(ui.canvas);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

attachGestures(ui.canvas, {
  onPan: (dx, dy) => { camera.pan(dx, dy); userMovedCamera = true; dirty = true; },
  onZoom: (f, x, y) => { camera.zoomAt(f, x, y); userMovedCamera = true; dirty = true; },
  onTap: (x, y) => {
    const c = camera.screenToCell(x, y);
    const cell = host.inspect(c.x, c.y);
    if (!cell || (selected && selected.x === c.x && selected.y === c.y)) { clearSelection(); return; }
    selected = c;
    renderInspector(ui.inspector, cell, clearSelection);
    dirty = true;
  },
});

$('btn-fit').addEventListener('click', () => { userMovedCamera = false; fitCamera(); });
$('btn-setup').addEventListener('click', () => {
  controls.setPaused(true);
  setup.setParams(host.sim.params, 'custom');
  showScreen('setup');
});
ui.resume.addEventListener('click', () => { showScreen('game'); resize(); });

try {
  const saved = JSON.parse(localStorage.getItem('popsim:lastParams') || 'null');
  if (saved) setup.setParams(saved, 'custom');
} catch { /* ignore bad saved params */ }
showScreen('setup');

// Exposed for the browser smoke test and for poking at the sim from devtools.
window.popsim = { host, loop, camera, startGame };
