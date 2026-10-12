// Boot: wires the home page, How to play, the map-generation and setup screens, sim host, renderer, input and controls together.

import { LocalSimHost } from './host/simHost.js';
import { Loop, BASE_TPS, SPEEDS } from './loop.js';
import { DAYS_PER_YEAR, SEASON_DAYS, SEASON_NAMES, seasonOf } from './sim/calendar.js';
import { seasonLook } from './render3d/seasons.js';
import { daylight } from './render3d/dayNight.js';
import { Camera, FLY_MS, flightAt } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { MenuScene } from './render/menuScene.js';
import { HomeScene3D } from './render3d/homeScene3d.js';
import { Renderer3D } from './render3d/renderer3d.js';
import { HexView } from './render3d/hexView.js';
import { TIER_NAMES } from './sim/settlements.js';
import { createFlags } from './flags.js';
import { peopleShown, PEOPLE_ZOOM_PX, PEOPLE_FLY_PX } from './render/peopleLayer.js';
import { hexAtWorld, hexCentre, worldBounds, HEX_SIZE } from './render/layout.js';
import { attachGestures } from './input/gestures.js';
import { attachKeys } from './input/keys.js';
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

/** Feature flags (RULES.md "Feature flags"), kept on this device. */
const flags = createFlags((() => { try { return window.localStorage; } catch { return null; } })(), location.search);

const host = new LocalSimHost();
const camera = new Camera();
// Two map renderers with the same methods: PixiJS (2D, the default) and three.js (3D, behind the
// graphics3d flag). The one in use is chosen when a game starts or is returned to.
const renderer2d = new Renderer(ui.canvas);
const renderer3d = new Renderer3D($('map3d'));
let renderer = renderer2d;
const rendererReady = new Map();
let map = null;
let selected = -1;
/** Person shown in the card: { slot, id, last } (last = latest SimHost.person() data), or null. */
let person = null;
let dirty = true;
let userMovedCamera = false;
let lastPanelUpdate = 0;
let panelsDue = false;
/** Day of the year the 3D map's seasons last showed, -1 to ask again. */
let seasonDay = -1;
/** Day/night clock reading a new game starts at: just after dawn. */
const DAWN_CLOCK_S = 4;
let shownEnd = false;
/** Settings of the game last started, for "Same settings again" (kept in memory only). */
let startParams = null;
/** Tap-to-zoom flight in progress: { from, to, scale0, scale1, sx, sy, t0 }, or null. */
let flight = null;

const loop = new Loop({
  tick: (n) => host.days(n),
  frame: (ran, now) => {
    renderer.setMoving(!loop.paused);
    if (flight) stepFlight(now);
    // New head counts are drawn on the renderer's throttled clock, not every tick frame.
    if (ran > 0) renderer.setPopulation(host.population(), now);
    if (renderer === renderer3d && (ran > 0 || seasonDay < 0)) {
      seasonDay = host.dayOfYear();
      renderer3d.setDay(seasonDay, loop.paused ? 0 : (BASE_TPS * SPEEDS[loop.speedIndex].mult) / DAYS_PER_YEAR);
    }
    // The water shimmer keeps redrawing on its own clock; the sim never sees it.
    if (dirty || (!ui.game.hidden && renderer.needsFrame(now))) { renderer.draw(camera, outlinedHex(), now); dirty = false; }
    // Panels catch up at most every 100 ms, and at once when the game stops, so a paused game never shows a stale day.
    if (ran > 0) panelsDue = true;
    if (panelsDue && (now - lastPanelUpdate > 100 || loop.paused)) { updatePanels(); lastPanelUpdate = now; panelsDue = false; }
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
// The menu screens' animated backdrop: the page's second (and last) WebGL context, made on first use.
const menu = new MenuScene($('menu-bg'));
const heroFigure = document.querySelector('.home-world');
const home3d = new HomeScene3D($('home-3d'));
const home = new HomeScreen(
  { canvas: $('home-canvas'), caption: $('home-caption'), points: $('home-points'), figure: heroFigure, toggle: $('btn-3d') },
  menu, { scene3d: home3d, flags },
);
menu.trackHero(heroFigure, ui.home);
const how = new HowScreen($('how-body'), { onNewGame: () => newGame(), nav: $('how-nav'), progress: $('how-progress') });

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
  preview: (params) => host.preview(params),
  starts: (params) => host.starts(params),
  onStart: (params) => startGame(params),
  onChangeMap: (params) => {
    mapgen.setParams(params, 'custom');
    showScreen('mapgen');
  },
});

async function startGame(params) {
  showScreen('game');
  try {
    await pickRenderer();
  } catch (err) {
    showToast('This browser cannot draw the map (WebGL is unavailable).');
    console.warn(err);
    return;
  }
  host.start(params);
  startParams = host.params;
  map = host.map();
  renderLevelGuide(ui.levelGuide, map, startParams.civCount);
  renderer.setMap(map, host.stats().civs.map((c) => c.type));
  seasonDay = -1;
  renderer3d.setClock(DAWN_CLOCK_S); // a new game starts in the morning
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
  if (name !== 'game' && inside) leaveHex();
  const first = screen === null;
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
  // The backdrop runs behind the menu screens only; the game and end screens stop it.
  menu.setMode(name === 'home' ? 'home' : MENU_PAGES.includes(name) ? 'page' : null);
  // Entrances mark moving between screens; a visit's first screen just appears, except the home page's welcome.
  if (!first || name === 'home') markEntering(name);
}

const MENU_PAGES = ['how', 'mapgen', 'setup'];
let enterTimer = 0;
/** Play the screen's entrance (styles/main.css .entering) once per show, not on every form rebuild. */
function markEntering(name) {
  for (const el of [ui.home, ui.how, ui.mapgen, ui.setup]) el.classList.remove('entering');
  clearTimeout(enterTimer);
  const el = ui[name];
  if (name === 'game' || name === 'end' || !el) return;
  el.classList.add('entering');
  enterTimer = setTimeout(() => el.classList.remove('entering'), 1200);
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

/**
 * Use the renderer the 3D flag asks for, made ready; returns true if it changed. Without
 * WebGL for three.js the game falls back to the 2D map.
 */
async function pickRenderer() {
  let next = flags.get('graphics3d') ? renderer3d : renderer2d;
  const ready = (r) => {
    if (!rendererReady.has(r)) rendererReady.set(r, r.init());
    return rendererReady.get(r);
  };
  try {
    await ready(next);
  } catch (err) {
    if (next !== renderer3d) throw err;
    console.warn('3D graphics unavailable; the game shows the 2D map.', err);
    showToast('3D graphics are unavailable in this browser, so the map is 2D.');
    next = renderer2d;
    await ready(next);
  }
  const changed = next !== renderer;
  renderer = next;
  const in3d = renderer === renderer3d;
  // The 2D canvas stays on top in 3D, unseen, to take the gestures.
  ui.canvas.classList.toggle('over-3d', in3d);
  $('map3d').hidden = !in3d;
  camera.setKy(renderer.ky ?? 1);
  return changed;
}

/** Hand the running game to the renderer in use (after the 3D flag changed while away from it). */
function reloadRenderer() {
  renderer.setMap(map, host.stats().civs.map((c) => c.type));
  seasonDay = -1;
  renderer.setPopulation(host.population(), performance.now());
  renderer.setBuildings(host.buildings());
  renderer.setSettlements(host.settlements(), performance.now(), true);
  person = null;
  renderer.selectPerson(-1);
  camera.setBounds(worldBounds(map.cols, map.rows));
  // The card's Step inside button belongs to the 3D map only.
  if (selected >= 0) showHexCard();
  dirty = true;
}

// Inside a hex (3D map only): the hex as a small living world over the map while the game waits.
const hexView = new HexView($('hex-canvas'));
/** While inside a hex: { index, wasPaused }, else null. */
let inside = null;
let leaveTimer = 0;

async function enterHex(index) {
  if (inside || index < 0 || !map) return;
  const col = index % map.cols; const row = Math.floor(index / map.cols);
  const hex = host.inspect(col, row);
  if (!hex || hex.water) return;
  inside = { index, wasPaused: loop.paused };
  controls.setPaused(true);
  document.body.classList.add('in-hex');
  clearTimeout(leaveTimer);
  const s = hex.settlement;
  $('hex-view-name').textContent = s ? s.name : hex.name;
  const owner = s ? s.holder : hex.peopleByCiv.indexOf(Math.max(...hex.peopleByCiv));
  // The holder's level decides how its homes look inside (huts and a bonfire at level 1).
  hex.level = owner >= 0 ? host.stats()?.civs[owner]?.level ?? 1 : 1;
  const bits = [s ? `${s.tierName ?? TIER_NAMES[s.tier]} on ${hex.name.toLowerCase()}` : hex.name];
  if (hex.people > 0 && owner >= 0) bits.push(`Civ ${owner + 1}`);
  bits.push(`${formatNumber(hex.people)} ${hex.people === 1 ? 'person' : 'people'}`);
  if (hex.peopleByCiv.filter((n) => n > 0).length >= 2) bits.push('at war');
  $('hex-view-info').textContent = bits.join(' · ');
  const el = $('hex-view');
  el.hidden = false;
  const doy = host.dayOfYear();
  const season = doy >= 0 ? `${SEASON_NAMES[seasonOf(doy)].toLowerCase()} ` : '';
  hexView.onPart = (part) => { $('hex-view-time').textContent = `${season}${part}`; };
  fillHexBuildings(hex);
  const ok = await hexView.enter(hex, host.hexPeople(col, row, 48)?.people ?? [], renderer3d.clock(), seasonLook(host.dayOfYear()));
  if (!ok) { showToast('This browser cannot draw the inside of a hex.'); leaveHex(); return; }
  requestAnimationFrame(() => el.classList.add('shown'));
  $('btn-hex-leave').focus({ preventScroll: true });
}


const KIND_NAMES = { housing: 'Housing', food: 'Food', industry: 'Industry', trade: 'Trade', civic: 'Civic', defence: 'Defence' };

/** The city view's list of every building and wonder in the hex; tapping one turns the view to it. */
function fillHexBuildings(hex) {
  const box = $('hex-buildings'); const list = $('hex-buildings-list');
  const items = [
    ...(hex.buildings ?? []).map((b) => ({ ...b, note: `${b.kind === 'wonder' ? 'Wonder' : `Civ ${b.civ + 1}'s building`}, era ${b.era}` })),
    ...(hex.settlement?.buildings ?? []).map((b) => ({ ...b, note: KIND_NAMES[b.kind] ?? b.kind })),
  ];
  list.replaceChildren();
  box.hidden = items.length === 0;
  box.open = items.length > 0 && items.length <= 4;
  $('hex-buildings-title').textContent = `Buildings (${items.length})`;
  for (const b of items) {
    const status = b.status === 'building' ? `being built, ${Math.floor((100 * (b.work ?? 0)) / Math.max(1, b.years ?? 1))}%`
      : b.status === 'planned' ? 'planned' : b.status === 'abandoned' ? 'abandoned' : '';
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<span class="b-name"></span><span class="b-note"></span>';
    btn.firstChild.textContent = b.name;
    btn.lastChild.textContent = status ? `${b.note} · ${status}` : b.note;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') === 'true';
      for (const other of list.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
      if (!on && hexView.focus(b.id, b.kind)) btn.setAttribute('aria-pressed', 'true');
      else hexView.focus(null);
    });
    li.append(btn);
    list.append(li);
  }
}

function leaveHex() {
  if (!inside) return;
  const el = $('hex-view');
  el.classList.remove('shown');
  // Let the fade finish before the world goes.
  leaveTimer = setTimeout(() => { el.hidden = true; hexView.leave(); }, 500);
  document.body.classList.remove('in-hex');
  if (!inside.wasPaused) controls.setPaused(false);
  inside = null;
  dirty = true;
}

$('btn-hex-leave').addEventListener('click', leaveHex);
window.addEventListener('keydown', (e) => { if (inside && e.key === 'Escape') leaveHex(); });
new ResizeObserver(() => { if (inside) hexView.resize(); }).observe($('hex-canvas'));

/** Back to the running game, on the renderer the 3D flag asks for. */
async function resumeGame() {
  showScreen('game');
  try {
    if (await pickRenderer() && map) reloadRenderer();
  } catch (err) {
    console.warn(err);
  }
  resize();
}

function updatePanels() {
  const stats = host.stats();
  if (!stats) return;
  ui.year.textContent = `${stats.season ? `${stats.season} day ${(stats.day % SEASON_DAYS) + 1}, year` : 'Year'} ${stats.tick}${stats.finished ? ' (ended)' : ''}`;
  const alive = stats.civs.filter((c) => c.pop > 0).length;
  ui.pop.textContent = `${formatNumber(stats.totalPop)} people · ${alive} of ${stats.civs.length} civs · ${map.cols} × ${map.rows} hexes`;
  renderCivStats(ui.civStats, stats);
  renderLevels(ui.civLevels, stats);
  renderHudCivs(ui.hudCivs, stats);
  renderStats(ui.stats, stats);
  if (renderer.setBuildings(host.buildings())) dirty = true;
  if (renderer.setLevels?.(stats.civs.map((c) => c.level))) dirty = true;
  // Running, the renderer takes new settlements with its next redraw; paused (a step), at once.
  if (renderer.setSettlements(host.settlements(), performance.now(), loop.paused)) dirty = true;
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
    onEnter: renderer === renderer3d ? () => enterHex(selected) : null,
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
    // A building or wonder is drawn over the people, so a tap on it opens its hex's card.
    const built = renderer.buildingAt(x, y, camera);
    if (built >= 0) {
      if (built === selected) select(-1);
      else if (!peopleShown(camera.scale)) { select(built, false); flyTo(built); }
      else select(built);
      return;
    }
    // Zoomed in, a tap on a person opens their card (tapping them again closes it).
    const who = renderer.personAt(x, y, camera);
    if (who) {
      if (person && person.slot === who.slot && person.id === who.id) select(-1);
      else selectPerson(who.slot, who.id);
      return;
    }
    const hex = hexUnder(x, y);
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

/** The hex under screen point (x, y) as { index }, or null; the 3D map follows the line of sight. */
function hexUnder(x, y) {
  if (renderer.hexAt) {
    const index = renderer.hexAt(x, y, camera);
    return index >= 0 ? { index } : null;
  }
  const w = camera.screenToWorld(x, y);
  return hexAtWorld(map.cols, map.rows, w.x, w.y);
}

// Arrow keys pan and + / − zoom about the open map's middle, like a drag and a pinch.
attachKeys(window, {
  active: () => screen === 'game' && !!map && !inside,
  onPan: (dx, dy) => { flight = null; camera.pan(dx, dy); userMovedCamera = true; dirty = true; placeInspector(); },
  onZoom: (f) => {
    const c = mapCentre();
    flight = null; camera.zoomAt(f, c.x, c.y); userMovedCamera = true; dirty = true; placeInspector();
  },
});

$('btn-fit').addEventListener('click', () => { flight = null; userMovedCamera = false; fitCamera(); placeInspector(); });
$('btn-setup').addEventListener('click', () => {
  controls.setPaused(true);
  setup.setParams(host.params);
  showScreen('setup');
});
ui.resume.addEventListener('click', resumeGame);
ui.endNow.addEventListener('click', () => {
  host.endNow();
  showEnd();
});

$('btn-new-game').addEventListener('click', newGame);
$('btn-how').addEventListener('click', openHow);
$('btn-how-new').addEventListener('click', newGame);
$('btn-how-back').addEventListener('click', goHome);
$('btn-home').addEventListener('click', goHome);
$('btn-setup-home').addEventListener('click', goHome);
ui.homeResume.addEventListener('click', resumeGame);

showScreen(routeFromHash());
// Run How to play's world while nothing else is happening, so the page opens at once.
(window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(() => how.prepare());

// Exposed for the browser tests and for poking at the sim from devtools.
window.popsim = {
  host, loop, camera, startGame,
  /** Feature flags: get(name), set(name, on), all(). */
  flags: { get: (name) => flags.get(name), set: (name, on) => flags.set(name, on), all: () => flags.all() },
  /** The home page's 3D world: whether it draws, on a software renderer, and its transition progress (0 flat to 1 risen). */
  /** Inside a hex: { index, part } (part of the day), or null. */
  insideHex: () => (inside ? { index: inside.index, part: $('hex-view-time').textContent } : null),
  /** The 3D map's light: the day/night clock in seconds, its daylight (0 night to 1 day) and the seasons' look on show; setClock(s) moves the clock. */
  light: () => ({ clock: renderer3d.clock(), daylight: daylight(renderer3d.clock()), look: renderer3d.lookShown }),
  setClock: (s) => { renderer3d.setClock(s); dirty = true; },
  /** Which map renderer the game uses: '2d' or '3d'. */
  mapRenderer: () => (renderer === renderer3d ? '3d' : '2d'),
  home3d: () => ({ live: home3d.live, failed: home3d.failed, lite: home3d.lite, progress: home3d.u, target: home3d.target, opacity: home3d.blend }),
  /** The screen on show: 'home', 'how', 'mapgen', 'setup', 'game' or 'end'. */
  screen: () => screen,
  /** Current year of the running game (0 before a game starts). */
  year: () => host.tickCount,
  /** Days run in the running game (one tick is one day). */
  days: () => host.stats()?.days ?? 0,
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
    const index = row * map.cols + col;
    if (renderer.hexToScreen) return renderer.hexToScreen(index, camera);
    const c = hexCentre(map.cols, index);
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
  /** Every building and wonder on the map (SimHost.buildings()). */
  buildings: () => host.buildings(),
  /** Every settlement and this year's supply routes (SimHost.settlements()). */
  settlements: () => host.settlements(),
  /** Whether the camera is flying to a tapped hex. */
  flying: () => flight !== null,
};
