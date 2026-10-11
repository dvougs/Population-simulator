# Population Simulator

A browser game where civilisations grow, age, starve and spread across a generated world. Built for phones first, runs anywhere, no install.

**Play:** https://dvougs.github.io/Population-simulator/

## What's in it (Phase 2 in progress: people)

- A map-generation screen with a live preview: seed, size (10 × 10 up to 50 × 50 hexes), water, mountains, rivers, and plains, forest, desert and tundra shares, with presets and randomise. Every map is reproducible from its seed.
- A hex world with ocean on every edge, coasts, plains, forest, hills, mountain ranges, desert, tundra, lakes, and rivers that run downhill. Each terrain has its own food capacity, movement cost, defence bonus and materials.
- Drawn with PixiJS, with a gentle tide on the sea, lakes and rivers (static if your device asks for reduced motion): drag to pan, pinch or wheel to zoom, fit to screen, tap a hex to inspect it.
- Pause, single step and speeds from 1× to Max, and End now while paused.
- End conditions on the setup screen, in any combination: last civ standing, dominance (one civ holding a share of the land for a run of years), a year limit, or sandbox. The end screen shows the winner, each civ's peak, a population chart, deaths by cause, records (oldest person, longest family line, most descendants, worst famine) and a history log, with Keep watching, Same settings again, New map and Back to setup.
- Civilisations of individual people: choose how many civs and how many people each on the setup screen. Every year people age, eat from their hex, have children, grow old, starve when food runs short, and migrate from hungry or crowded hexes towards spare food within a year's walk. Food regrows each year.
- Each civ has its own colour and shape emblem. Held hexes are tinted in their civs' colours, each civ's territory has a bold outline, and zoomed out every hex with people shows its largest civ's emblem, a head count and a ring split by each civ's share. Tap a hex to fly in to its people: each person is a tiny emblem that idles inside its hex and glides to a new hex when they migrate. Migrants prefer hexes their own civ already holds.
- A live population count and hexes held per civ, a tapped hex lists its people, and tapping a person shows their age, health, hunger, civ, parent and living children.
- Hexes are shaded by height, so ridges, valleys and deep water show on the map.
- Traits, civ types, contact and fighting, materials and levels are next (version 1.0, see [project/ROADMAP.md](project/ROADMAP.md)).
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
