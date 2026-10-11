# Questions

How to use this file: answer a question by writing after its "Answer:" line (a number, or anything in your own words). Decide a proposal by writing after its "Decision:" line: yes, no, later, or the changes you want. Add your own requests or rule changes under "Requests" at any time, one bullet each. The director picks all of these up on its next cycle, turns them into tasks, and moves them to "Answered".

## Open

### Q-003: What goes into version 1.0?
- Date: 2026-10-11
- Why it matters: The roadmap puts people in Phase 2 and civ types, traits and mutation in Phase 3. You call Phase 2 "version 1.0, with civilizations in it", so 1.0 needs a clear line. Tasks T-013 to T-017 (people, migration, people on screen, stats) are already planned for Phase 2.
- Options:
  1. 1.0 = Phases 2 and 3 together: people, births, deaths, migration, plus 5 civ types (expansionist, cooperative, nomadic, isolationist, aggressive) biasing behaviour and inherited traits with mutation. Contact, war and levels stay for later. Bigger release, several cycles before it ships.
  2. 1.0 = Phase 2 plus civs as named, coloured groups with a type, but no traits or mutation yet (those come in 1.1). Ships sooner; civs differ only by type.
  3. Keep the roadmap: 1.0 = people only (Phase 2); civ types, traits and mutation are 1.1.
- Recommendation: 1, because civs without traits all behave alike and a population sim feels empty without visible differences between groups; we can still ship it in reviewed steps (one release candidate per step) before calling it 1.0.
- Answer:

### Q-004: How should traits and mutation work?
- Date: 2026-10-11
- Why it matters: Traits drive births, deaths and migration, and mutation decides whether civs drift apart over centuries. The roadmap lists 8 traits (fertility, life expectancy, strength, aggression, cooperation, metabolism, heat tolerance, cold tolerance).
- Options:
  1. All 8 traits, each 0 to 1 around a civ-type starting value; a child copies its parent with a small random nudge (mutation rate a setup option, default about ±3% a trait). Rich drift; terrain picks winners (cold tolerance thrives in tundra).
  2. 4 traits only (fertility, life expectancy, aggression, metabolism), same mutation. Easier to read in the inspector and on the end screen.
  3. All 8 traits but no mutation: children copy parents exactly. Civs never change, only their mix of people does.
- Recommendation: 1, it is what the roadmap describes and gives the long-run story (civs adapting to their land); the inspector can show the 8 as small bars.
- Answer:

### Q-005: How should civs and people look on the map?
- Date: 2026-10-11
- Why it matters: People are drawn as sprites from one texture only when zoomed in (CLAUDE.md), so zoomed out the map needs another way to show who lives where.
- Options:
  1. Each civ gets a colour; zoomed out, hexes get a tinted border or corner flag in the colour of their largest civ and a small population number; zoomed in, people are dots in civ colour that walk between hexes.
  2. Each civ gets a colour and a simple emblem (shape: circle, square, triangle…); zoomed out, emblem plus number per hex; zoomed in, people are tiny emblems. Readable for colour-blind players.
  3. Zoomed out, hexes are shaded by population density (no civ colours); civ colours only when zoomed in.
- Recommendation: 2, the shape keeps civs apart for colour-blind players and on small phone screens, at the same cost as option 1 (one texture atlas).
- Answer:

## Proposals

Ideas the director draws from headless simulation runs and the code. At most 6 wait here at a time.

### P-003: Make the water slider's dead zone visible
- Date: 2026-10-11
- Category: UI
- What: Since water counts against the whole map, the low end of the Water slider does nothing on small maps: on 10 × 10 every setting from 0% to 36% gives the same map (just the ocean ring). Either start the slider at the edge ring's share for the current size, or show "ocean ring only" next to the value while it is in that range, so moving the slider always means something.
- Evidence: Headless runs of seeds review-20261011-1 to -3 on claude/cycle-20261011-0006 at 442a0e6, default setup, 400 years: deep water is exactly 36 on every seed (the 4 × 10 − 4 ring), so the default 25% is already inside the dead zone. RULES.md "How the map is made" step 2; slider range from LIMITS.water in src/ui/mapgenScreen.js:106. On 50 × 50 the ring is 196 hexes (7.8%).
- Effort: S
- Phone performance risk: low: a label or a slider bound recalculated when the size changes.
- Decision:

### P-004: Shade each hex slightly by its height
- Date: 2026-10-11
- Category: visuals
- What: Every hex of one terrain is drawn in exactly the same flat colour, so plains or forest read as a single block. Lightening or darkening each land hex by a few percent from its elevation (and sea hexes by depth) would show the shape of the land, ridges and valleys, without changing any rule.
- Evidence: src/render/palette.js:4-13 has one colour per terrain and hexRgb (src/render/palette.js:24-26) returns it unchanged; src/render/renderer.js setMap fills each hex with that colour. On the three review seeds the 64 land hexes use only 7 colours (e.g. seed review-20261011-1: 17 coast, 12 plains, 9 forest hexes, each block one flat tone). Elevation is already computed in src/sim/mapgen.js but not kept on the map.
- Effort: S
- Phone performance risk: low: colours are baked once when the map is built; no per-frame cost.
- Decision:

## Requests

## Answered

### Q-001: Should coast be walkable land or shallow water?
- Date: 2026-10-10
- Why it matters: The Phase 1 build makes coast a walkable land terrain (land next to the sea, food 50, move 1). Shallow water instead would shrink usable land and make boats (level 4) matter more.
- Options:
  1. Keep coast as land: no change; coasts are good early land.
  2. Make coast shallow water, impassable until boats: smaller islands, sea travel matters more.
  3. Make coast shallow water that is walkable at a high movement cost: wading across narrow straits.
- Recommendation: 1, because it matches the roadmap (only seas and lakes are impassable) and gives the first civs fertile starting land.
- Answer: yes (reading: option 1, keep coast as walkable land, as recommended)
- Moved: 2026-10-11, tasks none (coast stays walkable land; no change needed)

### Q-002: Should the terrain mix be adjustable at map generation?
- Date: 2026-10-10
- Why it matters: Hills (15% of land), tundra (15%), desert (15%) and forest (30%) are fixed numbers today; only water, mountains and rivers are settings.
- Options:
  1. Keep the fixed shares: simpler map screen.
  2. Add a "climate" slider (cold/dry ↔ wet/warm) that shifts tundra, desert and forest together: one more control.
  3. Add separate sliders for forest, desert and tundra: full control, busier screen on a phone.
- Recommendation: 2, one slider gives varied worlds without crowding the phone screen.
- Answer: 3 (reading: separate sliders for forest, desert and tundra, not the recommended single climate slider)
- Moved: 2026-10-11, tasks T-010, T-011

### P-001: Count the default water share against the whole map
- Date: 2026-10-10
- Category: scale
- What: On the default 10 × 10 map, more than half the hexes are sea, leaving about 48 land hexes. Counting "water 25%" against all hexes (edge ring included), or making the default size larger, would give the first civs room to spread in Phase 2.
- Evidence: Headless runs of seeds review-20261010-1 to -3 at commit 7216673 (cycle branch), default setup, 400 years: deep water 52 of 100 on every seed. That is 36 forced edge hexes (src/sim/mapgen.js:80-86) plus 25% of the 64 inner hexes. Desert and tundra are only 2–3 hexes each.
- Effort: S
- Phone performance risk: low: map generation only; a larger default size adds hexes to draw, still far below 50 × 50.
- Decision: add slider for the water coverage as well against the whole map, like we said before about the tundra, desert, fertile etc. (reading: yes, option 1. The existing water slider counts against all hexes, edge ring included, which changes the RULES.md rule "water amount = 25% of the non-edge hexes". Default stays 25% and size stays 10. A setting below the edge ring's share gives just the edge ring. It works like the separate terrain sliders from Q-002.)
- Moved: 2026-10-11, tasks T-010, T-011

### P-002: Gentle water animation so the map is not frozen
- Date: 2026-10-10
- Category: animation
- What: A slow shimmer or tide tint on sea and river hexes so the map visibly lives while time runs, even before people exist.
- Evidence: The map is built once into static Graphics (src/render/renderer.js:1, 44-58). In 400-year headless runs of all three review seeds, the state hash changes only with the year and every hex keeps full food, so nothing on screen changes except the HUD year.
- Effort: M
- Phone performance risk: medium: an animated layer redraws every frame; it needs a single shader or tinted overlay, not per-hex Graphics updates.
- Decision: yes (reading: build the water shimmer as proposed, as one shader or tinted overlay)
- Moved: 2026-10-11, tasks T-012, T-011

### R-001: Add a plains (fertile land) share slider next to the forest, desert and tundra sliders from Q-002
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-010, T-011

### R-002: Start planning Phase 2 ("version 1.0") with civilizations: civ types, traits, mutations, their concepts and visuals
- Date: 2026-10-11 00:29 UTC
- Moved: 2026-10-11, planned as questions Q-003 (what 1.0 contains), Q-004 (traits and mutation) and Q-005 (how civs and people look); Phase 2 tasks T-013 to T-017 already seeded and get extended once these are answered
