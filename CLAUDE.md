# Population Simulator

A mobile-first browser population simulator, run as a small autonomous studio: a director (the `director-cycle` skill) plans and delegates to two agents (`game-dev`, `unit-tester`) and opens release-candidate pull requests that the owner merges. Static files, served by GitHub Pages from `main`.

The game design and phases are in [project/ROADMAP.md](project/ROADMAP.md). The rules as implemented are in [RULES.md](RULES.md).

## Tech rules

- **Plain HTML/CSS/JS with ES modules. No build step, no frameworks.** What is in the repo is what ships. `package.json` exists only for scripts and dev dependencies.
- **Rendering uses PixiJS v8, vendored.** `pixi.js@^8` is a dev dependency; `npm run vendor:pixi` copies `node_modules/pixi.js/dist/pixi.min.mjs` to `vendor/pixi.mjs`, and that copied file is committed. Import it as `../vendor/pixi.mjs` (relative path), never from a CDN, so tests in the cloud and the Pages site load the same file.
- **The 3D graphics engine is three.js, vendored the same way, behind a feature flag.** `three@0.170.0` (the last release with a single-file `three.module.min.js`) is a dev dependency; `npm run vendor:three` copies it to `vendor/three.mjs`, committed. It is imported only with a dynamic `import()` from `src/render3d/`, once the 3D graphics flag (`src/flags.js`) is on, so the default 2D game never downloads it. The 2D PixiJS look stays the default until the owner switches it. No other runtime libraries: pan and pinch-zoom are implemented directly with pointer events.
- **The sim (`src/sim/`) is pure.** It never touches the DOM, `window`, `document`, PixiJS, timers or `Date`. It must run unchanged in Node (unit tests, `tools/headless.js`) and in a Web Worker.
- **All randomness in the sim comes from `Rng` (`src/sim/rng.js`).** Never `Math.random()` in `src/sim/`, except UI helpers that pick a new setup (`randomSeedString`, `randomParams`), which are never used during a run. Each subsystem uses its own `rng.fork(label)` stream so adding draws in one place does not reshuffle another.
- **Determinism:** same params + seed give the same state hash on every engine. Sim maths uses only `+ - * /`, `Math.sqrt`, `Math.floor`/`round`/`min`/`max`/`abs`; no `Math.exp/pow/log/sin/cos` (their precision is implementation-defined; noise uses smoothstep, not trigonometry). Iterate in index order; decide-then-apply for anything that moves between hexes so iteration order never biases outcomes.
- **Fixed timestep:** one tick is one day (a year is 360 days, `src/sim/calendar.js`; `Simulation.tick(n)` still runs whole years for tests and `tools/headless.js`, `days(n)` runs days). `src/loop.js` runs whole ticks at `BASE_TPS × speed` regardless of frame rate, with a per-frame time budget. Rendering never drives sim time.
- **Performance:** smooth on a mid-range iPhone with a few thousand people. Hex and people state live in typed arrays (struct of arrays, people in a pool with free-list reuse), no per-person objects, no allocation inside per-tick loops. Draw people as sprites from one texture, only when zoomed in far enough to see them.
- **Record stats as you go:** yearly per-civ stats (population, level, hexes held, deaths by cause, lifespans) are appended during the run, so the end screen costs nothing.
- **The UI talks to the sim only through `SimHost`** (`src/host/simHost.js`). Keep that API message-shaped (plain data in, plain data and typed arrays out) so a Worker host can replace it without UI changes.
- **Params are plain JSON**, normalised by `normalizeParams`; every setup option gets a default, validation, and a place in presets and randomise.

## Mobile conventions

- Touch first: pinch-zoom, pan, tap to inspect, bottom-sheet controls. Touch targets at least 44px; inputs at least 16px font (stops iOS focus zoom); `touch-action: none` on the map only.
- Portrait and landscape both work; pad with `env(safe-area-inset-*)`; web app manifest kept current.

## Layout

```
index.html, manifest.webmanifest, icons/, styles/   static shell
vendor/                 vendored PixiJS and three.js ES modules (committed, not edited by hand)
src/main.js             wiring: screens → SimHost → Loop → renderer and UI
src/loop.js             fixed-timestep driver and speed table
src/sim/                pure simulation
src/host/simHost.js     UI ↔ sim boundary
src/render/             PixiJS renderer, camera maths, palette
src/render3d/           three.js 3D graphics (behind the 3D flag) and their pure diorama maths
src/flags.js            feature flags (kept on the device, off by default)
src/input/              pointer pan, pinch and tap
src/ui/                 screens (home, How to play, map generation, setup, end), bottom sheet, inspector, stats, levels
tests/unit/             node:test unit tests (pure logic only)
tests/e2e/              Playwright specs at phone viewports (run by CI, not by an agent)
tools/                  headless.js (CLI runner), serve.js (static server), make-icons.js
project/                ROADMAP, TASKS, QUESTIONS, PROGRESS (director-owned)
.claude/                agents, director-cycle skill, settings and hook
RULES.md                the player rulebook; always matches the code
```

## Commands

- `npm run test:unit`: unit tests (`node --test "tests/unit/**/*.test.js"`; Node 22 does not accept a bare directory), no install needed. `npm test` is the same.
- `npm run test:e2e`: Playwright smoke tests at iPhone portrait, iPhone landscape and desktop. Needs `npm ci` and a Chromium: set `PW_CHROMIUM_PATH` to a preinstalled one (in cloud sessions, under `/opt/pw-browsers`), otherwise `npx playwright install chromium`. Screenshots and results go to `test-artifacts/` (git-ignored).
- `node tools/headless.js --seed foo --ticks 2000 [--preset name] [--every 100] [--json]`: run without a browser; prints per-civ results, state hash and ticks per second.
- `npm run perf`: headless throughput check used by CI.
- `npm start`: static server on port 8080, bound to all interfaces (a phone on the same Wi-Fi can open the printed URL).

## Ownership

| Who | May change | Must not change |
|---|---|---|
| game-dev | `src/`, `index.html`, `styles/`, `icons/`, `manifest.webmanifest`, `vendor/`, `tools/`, `package.json`, `RULES.md`, and `.github/workflows/` when a code change needs it | `tests/`, `project/` |
| unit-tester | `tests/unit/`; existing specs in `tests/e2e/` and `playwright.config.js` (paths only) when CI's e2e job fails | `src/`, `RULES.md`, `project/` |
| director | `project/`, task and question bookkeeping; studio files (`CLAUDE.md`, `.claude/`, workflows) only through a pull request | game code and tests (delegates them) |

- **RULES.md must always match the code.** Every rule and every number the game uses (rates, thresholds, capacities, ranges, defaults) appears in RULES.md with its value. A change to a rule or number updates RULES.md in the same commit. Tests treat RULES.md as the specification: code that contradicts it is a bug.
- **Code reaches `main` only through pull requests the owner merges.** Only `project/` files are pushed to `main` directly. The PreToolUse hook in `.claude/settings.json` (`.claude/hooks/guard-main.mjs`) blocks any push to `main` that changes other files, and blocks merging pull requests.
- Cycle branches are named `claude/cycle-<YYYYMMDD>-<HHMM>` and never edit `project/` themselves: the director pushes `project/` to `main` and merges `main` into the cycle branch, so the pull request carries the latest project files.

## Workflow

- Every question, request, approved proposal and task carries a priority; the director always writes a suggested one, which stands unless the owner changes it. Each build contains every ready P1 task; P2 tasks join when they share context with a P1 or while the build has fewer than 5 tasks; P3 tasks only when P1 and P2 together come to fewer than 5 (details in the director-cycle skill, step 5).
- Each cycle produces at most one "Release candidate: …" pull request. CI (`.github/workflows/ci.yml`) must be green before the owner merges it.
- No agent plays the game in a browser during a cycle, to save time and credits. The Playwright specs in `tests/e2e/` run in CI on every pull request instead.
- unit-tester runs only in cycles that change game logic (src/sim, src/host, src/loop.js, other unit-tested modules, or RULES.md); in screen-only cycles the director runs `npm run test:unit` itself.
- Merging to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).
- The owner answers questions and adds requests in `project/QUESTIONS.md`; the director turns them into tasks in `project/TASKS.md`.
- New sim features need a unit test, determinism preserved, and a headless run that looks sane.
- Comments explain why, not what. Match the existing small-module style.
