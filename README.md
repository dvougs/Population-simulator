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
npm test             # sim tests, no install needed
node tools/headless.js --seed pangaea --ticks 2000
```

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
