// Boot: wires the home page, How to play, the map-generation and setup screens, sim host, renderer, input and controls together.

import { LocalSimHost } from './host/simHost.js';
import { Loop } from './loop.js';
import { Camera, FLY_MS, flightAt } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { peopleShown, PEOPLE_ZOOM_PX, PEOPLE_FLY_PX } from './render/peopleLayer.js';
import { hexAtWorld, hexCentre, worldBounds, HEX_SIZE } from './render/layout.js';
import { attachGestures } from './input/gestures.js';
import { HomeScreen } from './ui/homeScreen.js';
import { HowScreen } from './ui/howScreen.js';
import { MapgenScreen } from './ui/mapgenScreen.js';
import { SetupScreen } from './ui/setupScreen.js';
import { initBottomSheet } from './ui/bottomSheet.js';
import { initControls } from './ui/controls.js';
import { renderInspector, renderPersonCard } from './ui/inspector.js';
import { formatNumber } from './ui/dom.js';
import { renderStats, renderCivStats, renderHudCivs } from './ui/statsPanel.js';
import { renderEndScreen } from './ui/endScreen.js';
import { renderLevels, renderLevelGuide } from './ui/levelsPanel.js';
import { mapParams } from './sim/params.js';
import { randomSeedString } from './sim/rng.js';
import { DEEP_WATER } from './sim/terrain.js';

const $ = (id) => document.getElementById(id);
const ui = {
  home: $('home'), how: $('how'), homeResume: $('btn-home-resume'),
  mapgen: $('mapgen'), setup: $('setup'), game: $('game'), end: $('end'), endBody: $('end-body'), resume: $('btn-resume'),
  endNow: $('btn-end-now'),
  canvas: $('map'), year: $('hud-year'), pop: $('hud-pop'), hudCivs: $('hud-civs'), inspector: $('inspector'), toast: $('toast'),
  sheet: $('sheet'), handle: $('sheet-handle'), stats: $('stats'), civStats: $('civ-stats'),
  civLevels: $('civ-levels'), levelGuide: $('level-guide-body'),
};

const host = new LocalSimHost();
const camera = new Camera();
const renderer = new Renderer(ui.canvas);
let rendererReady = null;
let map = null;
let selected = -1;
/** Person shown in the card: { slot, id, last } (last = latest SimHost.person() data), or null. */
let person = null;
let dirty = true;
let userMovedCamera = false;
let lastPanelUpdate = 0;
let shownEnd = false;
/** Settings of the game last started, for "Same settings again" (kept in memory only). */
let startParams = null;
/** Tap-to-zoom flight in progress: { from, to, scale0, scale1, sx, sy, t0 }, or null. */
let flight = null;

const loop = new Loop({
  tick: (n) => host.tick(n),
  frame: (ran, now) => {
    renderer.setMoving(!loop.paused);
    if (flight) stepFlight(now);
    // New head counts are drawn on the renderer's throttled clock, not every tick frame.
    if (ran > 0) renderer.setPopulation(host.population(), now);
    // The water shimmer keeps redrawing on its own clock; the sim never sees it.
    if (dirty || (!ui.game.hidden && renderer.needsFrame(now))) { renderer.draw(camera, outlinedHex(), now); dirty = false; }
    if (ran > 0 && now - lastPanelUpdate > 100) { updatePanels(); lastPanelUpdate = now; }
    if (host.finished && !shownEnd) showEnd();
  },
});

const controls = initControls({
  playBtn: $('btn-play'), stepBtn: $('btn-step'), speedEl: $('speed'), loop,
  // "End now" belongs to the paused game.
  onChange: () => { ui.endNow.hidden = !loop.paused; },
});
initBottomSheet(ui.sheet, ui.handle);

/** The screen on show: 'home', 'how', 'mapgen', 'setup', 'game' or 'end'. */
let screen = null;
const home = new HomeScreen({ canvas: $('home-canvas'), caption: $('home-caption'), points: $('home-points') });
const how = new HowScreen($('how-body'), { onNewGame: () => newGame() });

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
  startParams = host.params;
  map = host.map();
  renderLevelGuide(ui.levelGuide, map.cols, map.rows);
  renderer.setMap(map);
  renderer.setPopulation(host.population(), performance.now());
  camera.setBounds(worldBounds(map.cols, map.rows));
  selected = -1;
  person = null;
  flight = null;
  renderer.selectPerson(-1);
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
}

function showScreen(name) {
  screen = name;
  ui.home.hidden = name !== 'home';
  ui.how.hidden = name !== 'how';
  ui.mapgen.hidden = name !== 'mapgen';
  ui.setup.hidden = name !== 'setup';
  ui.game.hidden = name !== 'game';
  ui.end.hidden = name !== 'end';
  ui.resume.hidden = !(name === 'setup' && host.sim);
  ui.homeResume.hidden = !(name === 'home' && host.sim);
  home.setActive(name === 'home');
  if (name === 'how') how.show();
}

/*
 * Addresses (RULES.md "Home page"): the page opens on the home page; "#how"
 * opens How to play and "#new" the map-generation screen. Opening How to play
 * from the home page adds a history entry, so the phone's back gesture returns
 * home; the Home and New game buttons clear the address.
 */
const routeFromHash = () => ({ '#how': 'how', '#new': 'mapgen' })[location.hash] ?? 'home';
const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); };
/** Whether How to play was opened from the home page with its own history entry (so Back can pop it). */
let howPushed = false;

function openHow() {
  if (location.hash !== '#how') { history.pushState(null, '', '#how'); howPushed = true; }
  showScreen('how');
  ui.how.scrollTop = 0;
}

function goHome() {
  if (screen === 'how' && howPushed) { howPushed = false; history.back(); return; } // popstate shows home
  clearHash();
  showScreen('home');
}

function newGame() {
  howPushed = false;
  clearHash();
  showScreen('mapgen');
}

window.addEventListener('popstate', () => {
  // Only the home page and How to play follow the address; a game in progress is never pulled away.
  if (screen !== 'home' && screen !== 'how') return;
  howPushed = false;
  showScreen(routeFromHash() === 'how' ? 'how' : 'home');
});

/** Pause and open the end screen for the finished run. */
function showEnd() {
  shownEnd = true;
  controls.setPaused(true);
  updatePanels();
  renderEndScreen(ui.endBody, host.report(), {
    onKeepWatching: () => {
      host.keepWatching();
      shownEnd = false;
      showScreen('game');
      resize();
      updatePanels();
      controls.setPaused(false);
    },
    onSameAgain: () => startGame(startParams),
    onNewMap: () => {
      mapgen.setParams({ ...startParams, seed: randomSeedString() }, 'custom');
      showScreen('mapgen');
    },
    onSetup: () => {
      setup.setParams(startParams);
      showScreen('setup');
    },
  });
  showScreen('end');
  ui.end.scrollTop = 0;
}

function updatePanels() {
  const stats = host.stats();
  if (!stats) return;
  ui.year.textContent = `Year ${stats.tick}${stats.finished ? ' (ended)' : ''}`;
  const alive = stats.civs.filter((c) => c.pop > 0).length;
  ui.pop.textContent = `${formatNumber(stats.totalPop)} people · ${alive} of ${stats.civs.length} civs · ${map.cols} × ${map.rows} hexes`;
  renderCivStats(ui.civStats, stats);
  renderLevels(ui.civLevels, stats);
  renderHudCivs(ui.hudCivs, stats);
  renderStats(ui.stats, stats);
  // Keep the open card's values current.
  if (selected >= 0) showHexCard();
  else if (person) showPersonCard();
}

/** The hex outlined on the map: the selected hex, or the hex of the person shown. */
function outlinedHex() {
  if (selected >= 0) return selected;
  return person ? person.last.hex : -1;
}

function showHexCard() {
  const col = selected % map.cols;
  const row = Math.floor(selected / map.cols);
  const listOpen = ui.inspector.dataset.list === 'open';
  renderInspector(ui.inspector, host.inspect(col, row), () => select(-1), {
    people: listOpen ? host.hexPeople(col, row, 100) : null,
    onToggleList: () => { showHexCard(); placeInspector(true); },
    onPerson: (slot, id) => selectPerson(slot, id),
  });
}

function showPersonCard() {
  const now = host.person(person.slot, person.id);
  if (now) person.last = now;
  renderPersonCard(ui.inspector, person.last, {
    dead: !now,
    onClose: () => select(-1),
    onShowHex: () => select(person.last.hex),
  });
}

function select(index, panIfCovered = true) {
  selected = index;
  person = null;
  renderer.selectPerson(-1);
  if (index < 0) renderInspector(ui.inspector, null);
  else {
    showHexCard();
    placeInspector(panIfCovered);
  }
  dirty = true;
}

/** Centre of the open map area (CSS px): below the top bar, clear of the collapsed sheet. */
function mapCentre() {
  const inset = sheetInsets();
  const top = 64;
  return {
    x: (camera.viewW - (inset.right ?? 0)) / 2,
    y: top + (camera.viewH - top - (inset.bottom ?? 0)) / 2,
  };
}

/** Fly the camera to hex `index`, zoomed in far enough to see its people (RULES.md "How civs and people look"). */
function flyTo(index, now = performance.now()) {
  const c = mapCentre();
  let scale1 = Math.max(camera.scale, Math.min(camera.maxScale, PEOPLE_FLY_PX / (2 * HEX_SIZE)));
  if (!peopleShown(scale1)) {
    scale1 = PEOPLE_ZOOM_PX / (2 * HEX_SIZE);
    camera.maxScale = Math.max(camera.maxScale, scale1);
  }
  flight = {
    from: camera.screenToWorld(c.x, c.y), to: hexCentre(map.cols, index),
    scale0: camera.scale, scale1, sx: c.x, sy: c.y, t0: now,
  };
  userMovedCamera = true;
}

function stepFlight(now) {
  const t = Math.min(1, (now - flight.t0) / FLY_MS);
  const v = flightAt(flight.from, flight.to, flight.scale0, flight.scale1, t);
  camera.viewAt(v.wx, v.wy, v.scale, flight.sx, flight.sy);
  camera.clamp();
  dirty = true;
  if (t >= 1) {
    flight = null;
    placeInspector(true);
  } else placeInspector();
}

function selectPerson(slot, id) {
  const p = host.person(slot, id);
  if (!p) return;
  selected = -1;
  person = { slot, id, last: p };
  renderer.selectPerson(slot, id);
  showPersonCard();
  placeInspector(true);
  dirty = true;
}

/** Screen box around the selected hex or person (CSS px, relative to the map canvas). */
function selectedBox() {
  if (selected < 0 && person) {
    const w = renderer.personPosition(person.slot, person.id) ?? hexCentre(map.cols, person.last.hex);
    const p = camera.worldToScreen(w.x, w.y);
    const r = 22;
    return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r };
  }
  const c = hexCentre(map.cols, selected);
  const p = camera.worldToScreen(c.x, c.y);
  const r = HEX_SIZE * camera.scale;
  return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r };
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Keep the inspector card off the selected hex so it stays visible and can be
 * tapped again. The card tries its corners in turn (top-left, bottom-left,
 * top-right, then bottom-right if the sheet leaves room) and takes the first that
 * does not cover the hex. Only if every corner covers it (a tiny view) does a new
 * selection pan the map, so the map does not jump in the usual case.
 */
function placeInspector(panIfCovered = false) {
  if ((selected < 0 && !person) || ui.inspector.hidden) return;
  const el = ui.inspector;
  const canvasRect = ui.canvas.getBoundingClientRect();
  const cardRect = () => {
    const r = el.getBoundingClientRect();
    return { left: r.left - canvasRect.left, right: r.right - canvasRect.left, top: r.top - canvasRect.top, bottom: r.bottom - canvasRect.top };
  };
  const hex = selectedBox();
  if (!overlaps(cardRect(), hex)) return;
  const inset = sheetInsets();
  const bottom = `${(inset.bottom ?? 0) + 10}px`;
  const corners = [
    { side: 'left', bottom: null },
    { side: 'left', bottom },
    { side: 'right', bottom: null },
  ];
  if (inset.right === undefined) corners.push({ side: 'right', bottom });
  for (const c of corners) {
    el.classList.toggle('at-bottom', c.bottom !== null);
    el.classList.toggle('at-right', c.side === 'right');
    el.style.bottom = c.bottom ?? '';
    if (!overlaps(cardRect(), hex)) return;
  }
  el.classList.remove('at-bottom', 'at-right');
  el.style.bottom = '';
  if (!panIfCovered) return;
  const card = cardRect();
  camera.pan(0, card.bottom + 8 - hex.top);
  userMovedCamera = true;
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
  placeInspector();
}

new ResizeObserver(() => { if (!ui.game.hidden) resize(); }).observe(ui.canvas);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

attachGestures(ui.canvas, {
  onPan: (dx, dy) => { flight = null; camera.pan(dx, dy); userMovedCamera = true; dirty = true; placeInspector(); },
  onZoom: (f, x, y) => { flight = null; camera.zoomAt(f, x, y); userMovedCamera = true; dirty = true; placeInspector(); },
  onTap: (x, y) => {
    if (!map) return;
    // Zoomed in, a tap on a person opens their card (tapping them again closes it).
    const who = renderer.personAt(x, y, camera);
    if (who) {
      if (person && person.slot === who.slot && person.id === who.id) select(-1);
      else selectPerson(who.slot, who.id);
      return;
    }
    const w = camera.screenToWorld(x, y);
    const hex = hexAtWorld(map.cols, map.rows, w.x, w.y);
    // Water, off the map, or the selected hex again: close the inspector.
    if (!hex || map.terrain[hex.index] === DEEP_WATER || hex.index === selected) { select(-1); return; }
    // Zoomed out, a hex also flies the camera in to its people; the card finds its corner on landing.
    if (!peopleShown(camera.scale)) {
      select(hex.index, false);
      flyTo(hex.index);
      return;
    }
    select(hex.index);
  },
});

$('btn-fit').addEventListener('click', () => { flight = null; userMovedCamera = false; fitCamera(); placeInspector(); });
$('btn-setup').addEventListener('click', () => {
  controls.setPaused(true);
  setup.setParams(host.params);
  showScreen('setup');
});
ui.resume.addEventListener('click', () => { showScreen('game'); resize(); });
ui.endNow.addEventListener('click', () => {
  host.endNow();
  showEnd();
});

$('btn-new-game').addEventListener('click', newGame);
$('btn-how').addEventListener('click', openHow);
$('btn-how-new').addEventListener('click', newGame);
$('btn-how-back').addEventListener('click', goHome);
$('btn-home').addEventListener('click', goHome);
ui.homeResume.addEventListener('click', () => { showScreen('game'); resize(); });

showScreen(routeFromHash());
// Run How to play's world while nothing else is happening, so the page opens at once.
(window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(() => how.prepare());

// Exposed for the browser tests and for poking at the sim from devtools.
window.popsim = {
  host, loop, camera, startGame,
  /** The screen on show: 'home', 'how', 'mapgen', 'setup', 'game' or 'end'. */
  screen: () => screen,
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
  /** Person shown in the inspector as { slot, id }, or null. */
  selectedPerson: () => (person ? { slot: person.slot, id: person.id } : null),
  /** End-screen data of the running game (SimHost.report()), or null. */
  report: () => host.report(),
  /** Whether people are drawn one by one at the current zoom. */
  peopleShown: () => renderer.people?.shown ?? false,
  /** Whether the camera is flying to a tapped hex. */
  flying: () => flight !== null,
};
