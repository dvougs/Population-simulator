# Population Simulator

Browser population simulation game, mobile-first, deployed as static files to GitHub Pages.

## Hard rules

- **Plain HTML/CSS/JS with ES modules. No build step, no frameworks, no runtime dependencies.** What is in the repo is what ships. `package.json` exists only for scripts and the dev-only Playwright dependency.
- **The sim (`src/sim/`) never touches the DOM, `window`, `document`, timers or `Date`.** It must run unchanged in Node (tests, `tools/headless.js`) and in a Web Worker.
- **All randomness in the sim comes from `Rng` (`src/sim/rng.js`).** Never `Math.random()` in `src/sim/` (the only exceptions are `randomSeedString`/`randomParams`, which are UI helpers for picking a new setup, not used during a run). Each subsystem uses its own `rng.fork(label)` stream so adding draws in one place does not reshuffle another.
- **Determinism:** same params + seed ⇒ identical `stateHash()` on every engine. Use only `+ - * /`, `Math.sqrt`, `Math.floor`/`round`/`min`/`max`/`abs` in sim maths. Avoid `Math.exp/pow/log/sin/cos` etc. (their precision is implementation-defined). Iterate cells in index order; decide-then-apply for anything that moves between cells (see migration in `step.js`) so iteration order never biases outcomes.
- **Fixed timestep:** one sim tick = one year. `src/loop.js` runs whole ticks at `BASE_TPS × speed` regardless of frame rate, with a per-frame time budget. Rendering never drives sim time.
- **Grid state lives in typed arrays** (struct-of-arrays in `src/sim/world.js`, index `i = y * width + x`). No per-cell objects. No allocation inside per-tick hot loops.
- **The UI only talks to the sim through `SimHost`** (`src/host/simHost.js`). Keep that API message-shaped (plain data in, plain data/typed arrays out) so a Worker host can replace `LocalSimHost` without UI changes. Move the sim to a Worker only when measurements show main-thread frame drops.

## Layout

```
index.html, manifest.webmanifest, icons/, styles/main.css   static shell
src/main.js            wiring: setup screen → SimHost → Loop → Renderer/UI
src/loop.js            fixed-timestep driver and speed table
src/sim/               pure simulation (rng, params, civTypes, constants, world, mapgen, placement, step, simulation)
src/host/simHost.js    UI ↔ sim boundary
src/render/            camera (zoom/pan maths), renderer (ImageData blit), palette
src/input/gestures.js  pointer pinch/pan/tap + wheel
src/ui/                setup screen, bottom sheet, controls, inspector, stats panel, dom helper
tests/                 node:test unit, determinism and invariant tests
e2e/                   Playwright smoke tests at phone viewports
tools/                 headless.js (CLI runner), serve.js (static server), make-icons.js
```

## Commands

- `npm test`: unit, determinism and invariant tests (no install needed).
- `node tools/headless.js --seed foo --ticks 2000 [--preset name] [--every 100] [--json]`: run without a browser; prints per-civ results, state hash and ticks/sec.
- `npm run perf`: 100×100, 6 civs, 2000 years, fails below 150 ticks/s.
- `npm start`: static server on port 8080, bound to all interfaces (phone on the same Wi-Fi can open the printed network URL).
- `npm ci && npx playwright test`: browser smoke tests. In environments with a preinstalled Chromium, set `PW_CHROMIUM_PATH` instead of running `playwright install`.
- `node tools/make-icons.js`: regenerate app icons.

## Conventions

- Mobile first: touch targets ≥ 44px, `env(safe-area-inset-*)` padding, inputs ≥ 16px font (stops iOS focus zoom), `touch-action: none` on the map only. Check both portrait and landscape (the e2e suite runs iPhone portrait, landscape and desktop).
- Sim tuning constants live in `src/sim/constants.js` and civ traits/behaviour in `src/sim/civTypes.js`. Traits are the numbers mutation will act on (Phase 2); behaviour is fixed per type.
- New sim features need: a unit or invariant test, determinism preserved (`tests/determinism.test.js` stays green), and a headless run that looks sane.
- Params are plain JSON, normalised by `normalizeParams`; every new setup option gets a default, validation and a place in presets/randomise.
- Comments explain why, not what. Match the existing small-module style.

## Workflow

- One branch and PR per phase or feature; CI (`.github/workflows/ci.yml`) must be green before merging.
- Merging to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`), which needs Settings → Pages → Source = GitHub Actions.

## Roadmap

1. ✅ Map gen, base civ types, growth/ageing/starvation/migration, rendering, speed controls, setup screen, mobile layout.
2. Mutations and trait inheritance (trade-offs enforced; mutation rate 0 must reproduce Phase 1 results).
3. Advancements and unlockable survival options (agriculture, shelter, migration waves, alliances, warfare).
4. Conflict (borders are hard until then), alliances, climate events, balancing via headless batch runs.
5. Population chart and full stats, save/load setups, offline service worker, polish.
