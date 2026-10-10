# Questions

How to use this file: answer a question by writing after its "Answer:" line (a number, or anything in your own words). Decide a proposal by writing after its "Decision:" line: yes, no, later, or the changes you want. Add your own requests or rule changes under "Requests" at any time, one bullet each. The director picks all of these up on its next cycle, turns them into tasks, and moves them to "Answered".

## Open

### Q-001: Should coast be walkable land or shallow water?
- Date: 2026-10-10
- Why it matters: The Phase 1 build makes coast a walkable land terrain (land next to the sea, food 50, move 1). Shallow water instead would shrink usable land and make boats (level 4) matter more.
- Options:
  1. Keep coast as land: no change; coasts are good early land.
  2. Make coast shallow water, impassable until boats: smaller islands, sea travel matters more.
  3. Make coast shallow water that is walkable at a high movement cost: wading across narrow straits.
- Recommendation: 1, because it matches the roadmap (only seas and lakes are impassable) and gives the first civs fertile starting land.
- Answer: yes (reading: option 1, keep coast as walkable land, as recommended)

### Q-002: Should the terrain mix be adjustable at map generation?
- Date: 2026-10-10
- Why it matters: Hills (15% of land), tundra (15%), desert (15%) and forest (30%) are fixed numbers today; only water, mountains and rivers are settings.
- Options:
  1. Keep the fixed shares: simpler map screen.
  2. Add a "climate" slider (cold/dry ↔ wet/warm) that shifts tundra, desert and forest together: one more control.
  3. Add separate sliders for forest, desert and tundra: full control, busier screen on a phone.
- Recommendation: 2, one slider gives varied worlds without crowding the phone screen.
- Answer:

## Proposals

Ideas the director draws from headless simulation runs and the code. At most 6 wait here at a time.

### P-001: Count the default water share against the whole map
- Date: 2026-10-10
- Category: scale
- What: On the default 10 × 10 map, more than half the hexes are sea, leaving about 48 land hexes. Counting "water 25%" against all hexes (edge ring included), or making the default size larger, would give the first civs room to spread in Phase 2.
- Evidence: Headless runs of seeds review-20261010-1 to -3 at commit 7216673 (cycle branch), default setup, 400 years: deep water 52 of 100 on every seed. That is 36 forced edge hexes (src/sim/mapgen.js:80-86) plus 25% of the 64 inner hexes. Desert and tundra are only 2–3 hexes each.
- Effort: S
- Phone performance risk: low: map generation only; a larger default size adds hexes to draw, still far below 50 × 50.
- Decision:

### P-002: Gentle water animation so the map is not frozen
- Date: 2026-10-10
- Category: animation
- What: A slow shimmer or tide tint on sea and river hexes so the map visibly lives while time runs, even before people exist.
- Evidence: The map is built once into static Graphics (src/render/renderer.js:1, 44-58). In 400-year headless runs of all three review seeds, the state hash changes only with the year and every hex keeps full food, so nothing on screen changes except the HUD year.
- Effort: M
- Phone performance risk: medium: an animated layer redraws every frame; it needs a single shader or tinted overlay, not per-hex Graphics updates.
- Decision:

## Requests

## Answered
