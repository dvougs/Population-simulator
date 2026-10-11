# Population Simulator

A browser game where civilisations grow, age, starve and spread across a generated world. Built for phones first, runs anywhere, no install.

**Play:** https://dvougs.github.io/Population-simulator/

## What's in it (Phase 2 in progress: people)

- A map-generation screen with a live preview: seed, size (10 × 10 up to 50 × 50 hexes), water, mountains, rivers, and plains, forest, desert and tundra shares, with presets and randomise. Every map is reproducible from its seed.
- A hex world with ocean on every edge, coasts, plains, forest, hills, mountain ranges, desert, tundra, lakes, and rivers that run downhill. Each terrain has its own food capacity, movement cost, defence bonus and materials.
- Drawn with PixiJS, with a gentle tide on the sea, lakes and rivers (static if your device asks for reduced motion): drag to pan, pinch or wheel to zoom, fit to screen, tap a hex to inspect it.
- Pause, single step and speeds from 1× to Max, and an optional year limit.
- Civilisations of individual people: choose how many civs and how many people each on the setup screen. Every year people age, eat from their hex, have children, grow old, starve when food runs short, and migrate from hungry or crowded hexes towards spare food within a year's walk. Food regrows each year.
- A live population count and hexes held per civ, and the people per civ in a tapped hex. People are not drawn on the map yet, and traits, civ types, contact and levels come later (see [project/ROADMAP.md](project/ROADMAP.md)).
- Add to Home Screen for a full-screen app.

## Run it locally

```sh
npm start            # serves on http://localhost:8080 and prints a network URL for your phone
npm run test:unit    # unit tests, no install needed
npm run test:e2e     # browser tests at phone sizes (npm ci first)
node tools/headless.js --seed pangaea --ticks 2000 --every 100   # per-civ population, deaths, extinctions
```

Full rules, with every number the game uses: [RULES.md](RULES.md).

## How it is built

The repo runs as a small autonomous studio. A director cycle (`.claude/skills/director-cycle/`) plans work in [project/TASKS.md](project/TASKS.md), has the game-dev and unit-tester agents build and test it (CI runs the browser tests), and opens "Release candidate" pull requests that the owner reviews and merges. Questions for the owner, and the owner's own requests, live in [project/QUESTIONS.md](project/QUESTIONS.md); status is in [project/PROGRESS.md](project/PROGRESS.md) and the design in [project/ROADMAP.md](project/ROADMAP.md).

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and ownership rules.
