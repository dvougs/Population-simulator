# Population Simulator

A browser game where civilisations grow, age, starve and spread across a generated world. Built for phones first, runs anywhere, no install.

**Play:** https://dvougs.github.io/Population-simulator/

## What's in it (Phase 1)

- Seeded world generation with water, desert, plains, fertile land and mountains, each with its own food yield and movement cost. Food regrows.
- Five civilisation types (expansionist, cooperative, nomadic, isolationist, aggressive) with different traits and behaviour.
- Population growth by age group, starvation, and migration into neighbouring land.
- Pause, single step and speeds from 1× to max, changeable live.
- Pinch to zoom, drag to pan, tap a cell to inspect it.
- Setup screen with presets, a randomise button and the core parameters. Every run is reproducible from its seed.
- Add to Home Screen for a full-screen app.

## Run it locally

```sh
npm start            # serves on http://localhost:8080 and prints a network URL for your phone
npm run test:unit    # unit tests, no install needed
npm run test:e2e     # browser tests at phone sizes (npm ci first)
node tools/headless.js --seed pangaea --ticks 2000
```

Full rules, with every number the game uses: [RULES.md](RULES.md).

## How it is built

The repo runs as a small autonomous studio. A director cycle (`.claude/skills/director-cycle/`) plans work in [project/TASKS.md](project/TASKS.md), has the game-dev, unit-tester and functional-tester agents build and test it, and opens "Release candidate" pull requests that the owner reviews and merges. Questions for the owner, and the owner's own requests, live in [project/QUESTIONS.md](project/QUESTIONS.md); status is in [project/PROGRESS.md](project/PROGRESS.md) and the design in [project/ROADMAP.md](project/ROADMAP.md).

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and ownership rules.
