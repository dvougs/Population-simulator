// Phase 1 browser tests (T-009): map generation, setup, the hex map, time controls and layout.
// Expected values come from RULES.md. The sim has people, but only the HUD text, the inspector, the setup fields and the year-limit end screen are checked here; people on the map are not covered.

import { test, expect, devices } from '@playwright/test';

// RULES.md "Terrain".
const TERRAIN = {
  coast: { name: 'Coast', food: 50, move: '1', defence: '0%' },
  plains: { name: 'Plains', food: 60, move: '1', defence: '0%' },
  forest: { name: 'Forest', food: 40, move: '2', defence: '+25%' },
  hills: { name: 'Hills', food: 30, move: '2', defence: '+50%' },
  mountain: { name: 'Mountain', food: 10, move: '3', defence: '+100%' },
  desert: { name: 'Desert', food: 10, move: '1.5', defence: '0%' },
  tundra: { name: 'Tundra', food: 15, move: '1.5', defence: '0%' },
};
const RIVER_BONUS = 30;

// RULES.md "Map settings" presets; every preset uses the default lowland weights, and One continent except Archipelago (Islands).
const LOWLAND = { plains: 0.4, forest: 0.3, desert: 0.15, tundra: 0.15 };
const PRESETS = {
  default: { seed: 'pangaea', size: 10, water: 0.25, mountains: 0.12, rivers: 2, ...LOWLAND, landShape: 'continent' },
  continent: { seed: 'continent', size: 30, water: 0.2, mountains: 0.12, rivers: 6, ...LOWLAND, landShape: 'continent' },
  archipelago: { seed: 'islands', size: 30, water: 0.6, mountains: 0.08, rivers: 2, ...LOWLAND, landShape: 'islands' },
  highlands: { seed: 'peaks', size: 20, water: 0.15, mountains: 0.3, rivers: 5, ...LOWLAND, landShape: 'continent' },
  large: { seed: 'vast', size: 50, water: 0.3, mountains: 0.12, rivers: 12, ...LOWLAND, landShape: 'continent' },
};

const shot = (page, testInfo, name) =>
  page.screenshot({ path: `test-artifacts/${testInfo.project.name}-${name}.png` });

const year = (page) => page.evaluate(() => window.popsim.year());
const previewHash = (page) => page.evaluate(() => window.popsim.previewHash());
const previewParams = (page) => page.evaluate(() => window.popsim.previewParams());
const camera = (page) => page.evaluate(() => ({ ...window.popsim.camera }));

async function waitNewPreview(page, old) {
  await expect.poll(() => previewHash(page)).not.toBe(old);
  return previewHash(page);
}

/** Map-gen screen → Continue → setup → Start. */
async function startGame(page, { endTicks } = {}) {
  await page.locator('#btn-continue').click();
  await expect(page.locator('#setup')).toBeVisible();
  if (endTicks) {
    await page.locator('#f-end-year').check();
    await page.locator('#f-end-years').selectOption('custom');
    await page.locator('#f-end-ticks').fill(String(endTicks));
  }
  await page.locator('#btn-start').click();
  await expect(page.locator('#game')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.popsim.mapHash())).not.toBeNull();
}

async function tapMap(page, x, y) {
  const box = await page.locator('#map').boundingBox();
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(box.x + x, box.y + y);
  else await page.mouse.click(box.x + x, box.y + y);
}

/** Wait for a tap-to-zoom flight to land (a tap on a zoomed-out map flies the camera in). */
async function landed(page) {
  await expect.poll(() => page.evaluate(() => window.popsim.flying()), { intervals: [50, 100, 250] }).toBe(false);
}

/** Close the card (if open) and fit the map again, so positions read at the fitted zoom hold. */
async function backToFit(page) {
  if (await page.locator('#inspector').isVisible()) await page.locator('#inspector button[aria-label="Close hex details"]').click();
  await page.locator('#btn-fit').click();
  await expect(page.locator('#inspector')).toBeHidden();
}

/** Pause the sim so the test reads stable values. */
async function pause(page) {
  if (await page.evaluate(() => !window.popsim.loop.paused)) await page.locator('#btn-play').click();
  await expect.poll(() => page.evaluate(() => window.popsim.loop.paused)).toBe(true);
  // Pausing adds the End now button, which makes the controls taller; fit again so positions read after this hold.
  await page.locator('#btn-fit').click();
}

/** For each terrain (and one river hex), a hex whose centre is on screen and not covered by HUD/sheet. */
async function visibleSampleHexes(page, { water = false } = {}) {
  return page.evaluate((water) => {
    const { popsim } = window;
    const size = popsim.mapParams().size;
    const canvas = document.getElementById('map');
    const r = canvas.getBoundingClientRect();
    const out = {};
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const h = popsim.hex(col, row);
        if (h.water !== water) continue;
        const key = h.river ? 'river' : h.terrain;
        if (out[key]) continue;
        const p = popsim.hexToScreen(col, row);
        if (document.elementFromPoint(r.left + p.x, r.top + p.y) !== canvas) continue;
        out[key] = { col, row, x: p.x, y: p.y, hex: h };
      }
    }
    return out;
  }, water);
}

/** True if the selected hex's centre is hidden under some other element (the inspector card). */
async function hexCovered(page, col, row) {
  return page.evaluate(([c, r]) => {
    const map = document.getElementById('map');
    const box = map.getBoundingClientRect();
    const p = window.popsim.hexToScreen(c, r);
    return document.elementFromPoint(box.left + p.x, box.top + p.y) !== map;
  }, [col, row]);
}

/** Inspector card rectangle relative to the map canvas. */
async function cardRect(page) {
  return page.evaluate(() => {
    const m = document.getElementById('map').getBoundingClientRect();
    const r = document.getElementById('inspector').getBoundingClientRect();
    return { left: r.left - m.left, top: r.top - m.top, right: r.right - m.left, bottom: r.bottom - m.top };
  });
}

/** True if a point (canvas px) is on the map canvas itself, not under a card, HUD or sheet. */
async function pointOnMap(page, x, y) {
  return page.evaluate(([px, py]) => {
    const map = document.getElementById('map');
    const box = map.getBoundingClientRect();
    return px > 0 && py > 0 && px < box.width && py < box.height && document.elementFromPoint(box.left + px, box.top + py) === map;
  }, [x, y]);
}

async function expectInspectorMatchesRules(page, sample) {
  const insp = page.locator('#inspector');
  await expect(insp).toBeVisible();
  const h = sample.hex;
  const rule = TERRAIN[h.terrain];
  expect(rule, `unknown terrain ${h.terrain}`).toBeTruthy();
  // RULES.md "What levels do": a civ at level 2 or more raises plains and river hexes by 25% (every hex by 25% more at level 5),
  // so the capacity is the level 1 value, or a raised one once someone has levelled up.
  const base = rule.food + (h.river ? RIVER_BONUS : 0);
  const cap = Math.round(h.foodCap);
  expect([base, base * 1.25, base * 1.5].map(Math.round)).toContain(cap);
  if (h.foodCap !== base) expect(['plains', 'forest', 'coast', 'hills', 'mountain', 'desert', 'tundra']).toContain(h.terrain);
  await expect(insp.locator('h3')).toContainText(rule.name);
  await expect(insp.locator('h3')).toContainText(`(${sample.col}, ${sample.row})`);
  // RULES.md "A year": people eat and food regrows, so food is anywhere from 0 to the capacity.
  // The game is paused when the sample is taken, so the card shows the sampled values.
  await expect(insp.locator('dd[data-field="food"]')).toHaveText(`${Math.round(h.food)} / ${cap}`);
  expect(h.food).toBeGreaterThanOrEqual(0);
  expect(h.food).toBeLessThanOrEqual(cap);
  // RULES.md "Statistics": tapping a hex shows its people per civ.
  const peopleDd = insp.locator('dd[data-field="people"]');
  if (h.people === 0) await expect(peopleDd).toHaveText('None');
  else await expect(peopleDd).toHaveText(new RegExp(`^${h.people} \\(Civ \\d+: \\d+`));
  await expect(insp.locator('dd[data-field="food-capacity"]')).toHaveText(String(cap));
  // RULES.md "Material deposits": the card lists the hex's deposits by name (or None); who gathered there this year is a row of its own.
  const deposits = h.deposits.map((id) => id[0].toUpperCase() + id.slice(1)).join(', ');
  await expect(insp.locator('dd[data-field="deposits"]')).toHaveText(deposits || 'None');
  await expect(insp.locator('dd[data-field="materials"]')).toHaveCount(0);
  const gathering = insp.locator('dd[data-field="gathering"]');
  await expect(gathering).toHaveCount(1);
  if (h.gathering.length === 0) await expect(gathering).toHaveText('Nobody');
  else await expect(gathering).not.toHaveText('Nobody');
  await expect(insp.locator('dd[data-field="movement-cost"]')).toHaveText(rule.move);
  await expect(insp.locator('dd[data-field="defence-bonus"]')).toHaveText(rule.defence);
  if (h.river) await expect(insp.locator('dd[data-field="river"]')).toHaveText('Yes (fertile)');
  else await expect(insp.locator('dd[data-field="river"]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  // The home page is the first screen; #new opens the map-generation screen directly (and a reload keeps it).
  await page.goto('/#new');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#mapgen')).toBeVisible();
  await expect.poll(() => previewHash(page)).not.toBeNull();
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

/** Ids of the screens on show; exactly one should be. */
const shownScreens = (page) => page.evaluate(() => [...document.querySelectorAll('.screen')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.id));

test.describe('home page and How to play', () => {
  // RULES.md "Home page". These click the real buttons and check that the screen actually changes.
  test('the home page is the only screen on show at first', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#btn-new-game')).toBeVisible();
    await expect(page.locator('#btn-how')).toBeVisible();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
    await expect(page.locator('#home-caption')).toContainText('Year');
    await shot(page, testInfo, 'home');
  });

  test('How to play opens from the home page, and its Home button and Back both return', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.locator('#btn-how').click();
    await expect(page.locator('#how')).toBeVisible();
    await expect.poll(() => shownScreens(page)).toEqual(['how']);
    await expect(page).toHaveURL(/#how$/);
    await expect(page.locator('#how-body h2').first()).toBeVisible();
    await shot(page, testInfo, 'how');
    await page.locator('#btn-how-back').click();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
    await expect(page).not.toHaveURL(/#how/);
    // The browser's Back (the phone's back gesture) also returns home.
    await page.locator('#btn-how').click();
    await expect.poll(() => shownScreens(page)).toEqual(['how']);
    await page.goBack();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
  });

  test('New game from How to play opens the map-generation screen', async ({ page }) => {
    // A fresh load of the #how address opens How to play directly.
    await page.goto('/#how');
    await page.reload();
    await expect.poll(() => shownScreens(page)).toEqual(['how']);
    await page.locator('#btn-how-new').click();
    await expect.poll(() => shownScreens(page)).toEqual(['mapgen']);
  });

  test('the Home button on the map-generation screen returns to the home page', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-new-game').click();
    await expect.poll(() => shownScreens(page)).toEqual(['mapgen']);
    await page.locator('#btn-home').click();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
    await expect(page.locator('#btn-home-resume')).toBeHidden();
  });

  test('after a game starts, Home then Back to game returns to it', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-setup').click();
    await expect.poll(() => shownScreens(page)).toEqual(['setup']);
    await page.locator('#btn-change-map').click();
    await expect.poll(() => shownScreens(page)).toEqual(['mapgen']);
    await page.locator('#btn-home').click();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
    await expect(page.locator('#btn-home-resume')).toBeVisible();
    await page.locator('#btn-home-resume').click();
    await expect.poll(() => shownScreens(page)).toEqual(['game']);
  });
});

test.describe('3D graphics flag', () => {
  // RULES.md "Feature flags": off by default, switched on the home page's world, kept on the device.
  const state = (page) => page.evaluate(() => ({ flag: window.popsim.flags.get('graphics3d'), ...window.popsim.home3d() }));

  test('the home page starts in 2D, and the switch rises into 3D and back, kept across reloads', async ({ page }, testInfo) => {
    await page.goto('/');
    const toggle = page.locator('#btn-3d');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect((await state(page)).flag).toBe(false);
    // The 3D code is not even downloaded while the flag is off.
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('three.mjs')))).toBe(false);
    const box = await toggle.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await state(page)).opacity, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await state(page)).progress).toBe(1);
    await expect(page.locator('#home-3d')).toBeVisible();
    await expect(page.locator('#home-caption')).toContainText('Year');
    await shot(page, testInfo, 'home-3d');

    await page.reload();
    await expect(page.locator('#btn-3d')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await state(page)).opacity, { timeout: 15_000 }).toBe(1);

    await page.locator('#btn-3d').click();
    await expect(page.locator('#btn-3d')).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await state(page)).opacity).toBe(0);
    await expect(page.locator('#home-3d')).toBeHidden();
    await page.reload();
    expect((await state(page)).flag).toBe(false);
  });

  test('an address with ?3d=1 turns the flag on, and ?3d=0 off', async ({ page }) => {
    await page.goto('/?3d=1');
    await expect(page.locator('#btn-3d')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await state(page)).opacity, { timeout: 15_000 }).toBe(1);
    await page.goto('/');
    expect((await state(page)).flag).toBe(true);
    await page.goto('/?3d=0');
    await expect(page.locator('#btn-3d')).toHaveAttribute('aria-checked', 'false');
    expect((await state(page)).flag).toBe(false);
  });

  test('with the flag on the game map is 3D, taps pick hexes, and Back to game follows the switch', async ({ page }, testInfo) => {
    await page.goto('/?3d=1#new');
    await startGame(page);
    await expect.poll(() => page.evaluate(() => window.popsim.mapRenderer()), { timeout: 15_000 }).toBe('3d');
    await expect(page.locator('#map3d')).toBeVisible();
    await pause(page);
    // A land hex near the middle, tapped where its tile's top is drawn.
    const hex = await page.evaluate(() => {
      const { size } = window.popsim.mapParams();
      const mid = Math.floor(size / 2);
      for (let d = 0; d < mid; d++) {
        for (const [c, r] of [[mid + d, mid], [mid - d, mid], [mid, mid + d], [mid, mid - d]]) {
          if (window.popsim.terrainAt(c, r) !== 'deepWater') return { c, r, index: r * size + c };
        }
      }
      return null;
    });
    expect(hex).not.toBeNull();
    const p = await page.evaluate(({ c, r }) => window.popsim.hexToScreen(c, r), hex);
    await tapMap(page, p.x, p.y);
    await expect.poll(() => page.evaluate(() => window.popsim.selected())).toBe(hex.index);
    await landed(page);
    await shot(page, testInfo, 'game-3d');

    // Day and night run on their own clock; the map's light follows it, and night shows the lights where people live.
    const day = await page.evaluate(() => window.popsim.light());
    expect(day.look).not.toBeNull();
    await page.evaluate(() => window.popsim.setClock(45));
    await expect.poll(() => page.evaluate(() => window.popsim.light().daylight)).toBe(0);
    await shot(page, testInfo, 'game-3d-night');
    await page.evaluate(() => window.popsim.setClock(13));
    await expect.poll(() => page.evaluate(() => window.popsim.light().daylight)).toBe(1);

    // Step inside: the hex's own world covers the map while the game waits, and Back returns to it.
    await page.locator('#inspector .enter-hex').click();
    await expect(page.locator('#hex-view')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.popsim.insideHex()?.index)).toBe(hex.index);
    await expect(page.locator('#hex-view-time')).toHaveText(/^(spring|summer|autumn|winter) (dawn|day|dusk|night)$/i);
    expect(await page.evaluate(() => window.popsim.loop.paused)).toBe(true);
    // The city view lists every building and wonder in the hex (none: no list).
    const listed = await page.evaluate(({ c, r }) => {
      const h = window.popsim.hex(c, r);
      return (h.buildings?.length ?? 0) + (h.settlement?.buildings?.length ?? 0);
    }, hex);
    if (listed === 0) await expect(page.locator('#hex-buildings')).toBeHidden();
    else await expect(page.locator('#hex-buildings-list button')).toHaveCount(listed);
    await shot(page, testInfo, 'inside-hex');
    await page.locator('#btn-hex-leave').click();
    await expect(page.locator('#hex-view')).toBeHidden();
    expect(await page.evaluate(() => window.popsim.insideHex())).toBeNull();
    expect(page.errors).toEqual([]);

    // Back on the home page the switch turns 3D off; the running game comes back in 2D.
    await page.locator('#btn-setup').click();
    await page.locator('#btn-setup-home').click();
    await page.locator('#btn-3d').click();
    await expect(page.locator('#btn-3d')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#btn-home-resume').click();
    await expect.poll(() => page.evaluate(() => window.popsim.mapRenderer())).toBe('2d');
    await expect(page.locator('#map3d')).toBeHidden();
    // Stepping inside a hex is for the 3D map only.
    await expect(page.locator('#inspector .enter-hex')).toBeHidden();
  });

  test('the game settings screen has a Home button back to the home page', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-setup').click();
    await expect.poll(() => shownScreens(page)).toEqual(['setup']);
    await expect(page.locator('#btn-setup-home')).toBeVisible();
    await page.locator('#btn-setup-home').click();
    await expect.poll(() => shownScreens(page)).toEqual(['home']);
    // The game waits, paused, behind Back to game.
    expect(await page.evaluate(() => window.popsim.loop.paused)).toBe(true);
    await page.locator('#btn-home-resume').click();
    await expect.poll(() => shownScreens(page)).toEqual(['game']);
  });
});

test.describe('map generation screen', () => {
  test('the home page is the first screen; New game opens this one with the RULES.md defaults', async ({ page }, testInfo) => {
    // RULES.md "Home page": the game opens on the home page; #new (used by every test here) skips it.
    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#mapgen')).toBeHidden();
    await expect(page.locator('#how')).toBeHidden();
    await expect(page.locator('#btn-home-resume')).toBeHidden();
    await page.locator('#btn-new-game').click();
    await expect(page.locator('#mapgen')).toBeVisible();
    await expect(page.locator('#home')).toBeHidden();
    await expect.poll(() => previewHash(page)).not.toBeNull();
    await expect(page.locator('#setup')).toBeHidden();
    await expect(page.locator('#game')).toBeHidden();
    await expect(page.locator('#m-preset')).toHaveValue('default');
    await expect(page.locator('#m-seed')).toHaveValue('pangaea');
    await expect(page.locator('#m-size')).toHaveValue('10');
    await expect(page.locator('#m-water')).toHaveValue('25');
    await expect(page.locator('#m-mountains')).toHaveValue('12');
    await expect(page.locator('#m-rivers')).toHaveValue('2');
    expect(await previewParams(page)).toEqual(PRESETS.default);
    // RULES.md ranges.
    for (const [id, min, max] of [['m-size', 10, 50], ['m-water', 0, 70], ['m-mountains', 0, 40], ['m-rivers', 0, 20]]) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('min', String(min));
      await expect(page.locator(`#${id}`)).toHaveAttribute('max', String(max));
    }
    await expect(page.locator('#m-seed')).toHaveAttribute('maxlength', '64');
    await expect(page.locator('#preview')).toHaveAttribute('data-hash', /.+/);
    await expect(page.locator('#preview-info')).toContainText('10 × 10 hexes');
    await shot(page, testInfo, 'mapgen');
  });

  test('every input changes the preview and marks the preset custom', async ({ page }) => {
    let hash = await previewHash(page);
    const changes = [
      ['m-size', '20', { size: 20 }],
      ['m-water', '50', { water: 0.5 }],
      ['m-mountains', '30', { mountains: 0.3 }],
      ['m-rivers', '8', { rivers: 8 }],
    ];
    for (const [id, value, expected] of changes) {
      await page.locator(`#${id}`).fill(value);
      hash = await waitNewPreview(page, hash);
      expect(await previewParams(page)).toMatchObject(expected);
      await expect(page.locator('#m-preset')).toHaveValue('custom');
      await expect(page.locator('#preview')).toHaveAttribute('data-hash', hash);
    }
    await expect(page.locator('#m-size-out')).toHaveText('20 × 20');
    await expect(page.locator('#m-water-out')).toHaveText('50%');
    await expect(page.locator('#preview-info')).toContainText('20 × 20 hexes');
    await page.locator('#m-seed').fill('another seed');
    await waitNewPreview(page, hash);
    expect((await previewParams(page)).seed).toBe('another seed');
  });

  test('regenerate picks a new seed, keeps the other settings and changes the map', async ({ page }) => {
    const h0 = await previewHash(page);
    await page.locator('#m-size').fill('16');
    let hash = await waitNewPreview(page, h0);
    const before = await previewParams(page);
    for (let i = 0; i < 2; i++) {
      await page.locator('#btn-regenerate').click();
      hash = await waitNewPreview(page, hash);
      const after = await previewParams(page);
      expect(after.seed).not.toBe(before.seed);
      expect(after).toMatchObject({ size: 16, water: before.water, mountains: before.mountains, rivers: before.rivers });
      await expect(page.locator('#m-seed')).toHaveValue(after.seed);
    }
  });

  test('the same seed and settings give the same map', async ({ page }) => {
    const h0 = await previewHash(page);
    await page.locator('#m-seed').fill('repeatable');
    const first = await waitNewPreview(page, h0);
    await page.locator('#m-seed').fill('something else');
    await waitNewPreview(page, first);
    await page.locator('#m-seed').fill('repeatable');
    await expect.poll(() => previewHash(page)).toBe(first);
    // And after a reload, starting from scratch.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect.poll(() => previewHash(page)).not.toBeNull();
    await page.locator('#m-seed').fill('repeatable');
    await expect.poll(() => previewHash(page)).toBe(first);
  });

  test('presets set the RULES.md values', async ({ page }, testInfo) => {
    const seen = new Set();
    for (const [key, values] of Object.entries(PRESETS)) {
      // Leave and come back so selecting the same preset still fires a change.
      await page.locator('#m-preset').selectOption(key === 'default' ? 'continent' : 'default');
      await page.locator('#m-preset').selectOption(key);
      await expect.poll(() => previewParams(page)).toEqual(values);
      await expect(page.locator('#m-seed')).toHaveValue(values.seed);
      await expect(page.locator('#m-size')).toHaveValue(String(values.size));
      await expect(page.locator('#m-water')).toHaveValue(String(Math.round(values.water * 100)));
      await expect(page.locator('#m-mountains')).toHaveValue(String(Math.round(values.mountains * 100)));
      await expect(page.locator('#m-rivers')).toHaveValue(String(values.rivers));
      await expect(page.locator('#preview-info')).toContainText(`${values.size} × ${values.size} hexes`);
      seen.add(await previewHash(page));
      if (key === 'large') await shot(page, testInfo, 'mapgen-large');
    }
    expect(seen.size).toBe(Object.keys(PRESETS).length);
  });

  test('randomise stays inside the RULES.md ranges', async ({ page }) => {
    let hash = await previewHash(page);
    for (let i = 0; i < 5; i++) {
      await page.locator('#btn-map-randomise').click();
      await expect(page.locator('#m-preset')).toHaveValue('custom');
      await expect.poll(async () => (await previewHash(page)) !== hash || (await previewParams(page)).seed !== 'pangaea').toBe(true);
      hash = await previewHash(page);
      const p = await previewParams(page);
      expect(p.size).toBeGreaterThanOrEqual(10);
      expect(p.size).toBeLessThanOrEqual(50);
      expect(p.water).toBeGreaterThanOrEqual(0.1);
      expect(p.water).toBeLessThanOrEqual(0.6);
      expect(p.mountains).toBeGreaterThanOrEqual(0.05);
      expect(p.mountains).toBeLessThanOrEqual(0.3);
      expect(p.rivers).toBeGreaterThanOrEqual(0);
      expect(p.rivers).toBeLessThanOrEqual(Math.floor(p.size / 4));
      await expect(page.locator('#m-size')).toHaveValue(String(p.size));
    }
  });
});

test.describe('setup screen', () => {
  test('continue shows the chosen map, change map goes back with it kept', async ({ page }, testInfo) => {
    await page.locator('#m-preset').selectOption('highlands');
    await expect.poll(() => previewParams(page)).toEqual(PRESETS.highlands);
    await page.locator('#btn-continue').click();
    await expect(page.locator('#setup')).toBeVisible();
    await expect(page.locator('#mapgen')).toBeHidden();
    await expect(page.locator('#setup-map-summary')).toHaveText('20 × 20 hexes, seed “peaks”, water 15%, mountains 30%, 5 rivers');
    // RULES.md "Game settings" defaults.
    await expect(page.locator('#f-civs')).toHaveValue('3');
    await expect(page.locator('#f-start-pop')).toHaveValue('20');
    await expect(page.locator('#f-civs')).toHaveAttribute('min', '1');
    await expect(page.locator('#f-civs')).toHaveAttribute('max', '8');
    await expect(page.locator('#f-start-pop')).toHaveAttribute('min', '2');
    await expect(page.locator('#f-start-pop')).toHaveAttribute('max', '200');
    // RULES.md "Game settings": End conditions default to none ticked (Sandbox); year limit 2500.
    // This screen was reached with the Highlands preset, whose end condition is Year limit 2500.
    await expect(page.locator('#f-end-sandbox')).not.toBeChecked();
    await expect(page.locator('#f-end-year')).toBeChecked();
    for (const id of ['f-end-last', 'f-end-dominance']) await expect(page.locator(`#${id}`)).not.toBeChecked();
    await expect(page.locator('#f-end-ticks')).toBeHidden();
    await page.locator('#f-end-year').uncheck();
    await expect(page.locator('#f-end-sandbox')).toBeChecked();
    await expect(page.locator('#f-end-years')).toBeHidden();
    await page.locator('#f-end-year').check();
    await expect(page.locator('#f-end-years')).toBeVisible();
    await expect(page.locator('#f-end-years')).toHaveValue('2500');
    await page.locator('#f-end-years').selectOption('custom');
    await expect(page.locator('#f-end-ticks')).toBeVisible();
    await expect(page.locator('#f-end-ticks')).toHaveValue('2500');
    await expect(page.locator('#f-end-ticks')).toHaveAttribute('min', '10');
    await expect(page.locator('#f-end-ticks')).toHaveAttribute('max', '100000');
    await page.locator('#f-end-dominance').check();
    await expect(page.locator('#f-dom-share')).toBeVisible();
    await expect(page.locator('#f-dom-years')).toHaveValue('300');
    await shot(page, testInfo, 'setup');
    await page.locator('#btn-change-map').click();
    await expect(page.locator('#mapgen')).toBeVisible();
    expect(await previewParams(page)).toEqual(PRESETS.highlands);
  });

  test('start runs the game on the previewed map', async ({ page }, testInfo) => {
    await page.locator('#m-seed').fill('start-me');
    await page.locator('#m-size').fill('14');
    await expect.poll(() => previewParams(page)).toMatchObject({ seed: 'start-me', size: 14 });
    // The preview redraws on the next frame; its caption changes in the same redraw as its hash.
    await expect(page.locator('#preview-info')).toContainText('14 × 14 hexes');
    const hash = await previewHash(page);
    const params = await previewParams(page);
    await startGame(page);
    expect(await page.evaluate(() => window.popsim.mapHash())).toBe(hash);
    expect(await page.evaluate(() => window.popsim.mapParams())).toEqual(params);
    await expect.poll(() => year(page), { timeout: 10_000 }).toBeGreaterThan(3);
    await expect(page.locator('#hud-year')).toHaveText(/^(Spring|Summer|Autumn|Winter), year [1-9]\d*$/);
    await expect(page.locator('#hud-pop')).toContainText('14 × 14 hexes');
    // RULES.md "Statistics": total population and civs still alive; Small world has 3 civs of 20.
    await expect(page.locator('#hud-pop')).toHaveText(/^[\d,.]+[kM]? people · [1-3] of 3 civs · 14 × 14 hexes$/);
    await shot(page, testInfo, 'game');
  });
});

test.describe('game', () => {
  test('pause, step exactly one month, and every speed', async ({ page }) => {
    // RULES.md "Time": one tick is one day; Step runs 30 days.
    const days = (p) => p.evaluate(() => window.popsim.days());
    await startGame(page);
    await pause(page);
    const d0 = await days(page);
    await page.waitForTimeout(400);
    expect(await days(page)).toBe(d0);
    await page.locator('#btn-step').click();
    await expect.poll(() => days(page)).toBe(d0 + 30);
    await page.waitForTimeout(300);
    expect(await days(page)).toBe(d0 + 30);
    await expect(page.locator('#hud-year')).toHaveText(/^(Spring|Summer|Autumn|Winter), year \d+$/);
    // Step while running pauses and advances exactly a month.
    await page.locator('#btn-play').click();
    await expect.poll(() => days(page)).toBeGreaterThan(d0 + 30);
    await page.locator('#btn-step').click();
    await expect.poll(() => page.evaluate(() => window.popsim.loop.paused)).toBe(true);
    await page.waitForTimeout(200);
    const afterStep = await days(page);
    await page.waitForTimeout(300);
    expect(await days(page)).toBe(afterStep);

    const labels = ['1×', '3×', '10×', '30×', 'Max'];
    await expect(page.locator('#speed button')).toHaveText(labels);
    for (let i = 0; i < labels.length; i++) {
      const btn = page.locator('#speed button', { hasText: labels[i] }).first();
      await btn.click();
      await expect(btn).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate(() => window.popsim.loop.speedIndex)).toBe(i);
      expect(await page.evaluate(() => window.popsim.loop.paused)).toBe(false);
      const before = await days(page);
      await expect.poll(() => days(page), { timeout: 5_000 }).toBeGreaterThan(before);
    }
    // RULES.md: 1× runs 120 days per second (a year in 3 seconds), 10× runs 1,200.
    await page.locator('#speed button', { hasText: '1×' }).click();
    let a = await days(page);
    await page.waitForTimeout(1000);
    let rate = (await days(page)) - a;
    expect(rate).toBeGreaterThanOrEqual(60);
    expect(rate).toBeLessThanOrEqual(180);
    await page.locator('#speed button', { hasText: '10×' }).click();
    a = await days(page);
    await page.waitForTimeout(1000);
    rate = (await days(page)) - a;
    expect(rate).toBeGreaterThanOrEqual(600);
    expect(rate).toBeLessThanOrEqual(1800);
  });

  test('the sim is still running after 60 years at Max speed and food stays in range', async ({ page }) => {
    await startGame(page);
    await page.locator('#speed button', { hasText: 'Max' }).click();
    await expect.poll(() => year(page), { timeout: 30_000 }).toBeGreaterThan(60);
    const y = await year(page);
    await expect.poll(() => year(page)).toBeGreaterThan(y);
    // RULES.md "A year": food is eaten and regrows, never below 0 or above capacity.
    const notFull = await page.evaluate(() => {
      const size = window.popsim.mapParams().size;
      const bad = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const h = window.popsim.hex(c, r);
        if (h.food < 0 || h.food > h.foodCap) bad.push(h);
      }
      return bad;
    });
    expect(notFull).toEqual([]);
  });

  test('a year limit of 10 stops at year 10 and opens the end screen', async ({ page }, testInfo) => {
    await startGame(page, { endTicks: 10 });
    // A year is 3 s at 1×, so run at 30× to reach year 10 quickly.
    await page.locator('#speed button', { hasText: '30×' }).click();
    await expect.poll(() => page.evaluate(() => window.popsim.host.finished), { timeout: 20_000 }).toBe(true);
    expect(await year(page)).toBe(10);
    await expect(page.locator('#end')).toBeVisible();
    await expect(page.locator('#end-reason')).toHaveText('Reached year 10');
    await expect(page.locator('#end-winner')).toContainText('No winner');
    await shot(page, testInfo, 'year-limit');
    await page.locator('#btn-keep-watching').click();
    await expect(page.locator('#game')).toBeVisible();
    // Keep watching carries on as a sandbox: no end applies any more.
    await expect.poll(() => year(page)).toBeGreaterThan(10);
    expect(await page.evaluate(() => window.popsim.host.finished)).toBe(false);
  });

  test('tapping hexes shows RULES.md terrain values', async ({ page }, testInfo) => {
    test.setTimeout(90_000); // each tap now flies the camera in and back out again
    for (const preset of ['default', 'continent']) {
      if (preset !== 'default') {
        await page.locator('#btn-setup').click();
        await page.locator('#btn-change-map').click();
        await page.locator('#m-preset').selectOption(preset);
        await expect.poll(() => previewParams(page)).toEqual(PRESETS[preset]);
      }
      await startGame(page);
      await pause(page);
      const samples = await visibleSampleHexes(page);
      expect(Object.keys(samples).length).toBeGreaterThan(2);
      for (const [key, s] of Object.entries(samples)) {
        await tapMap(page, s.x, s.y);
        await expect.poll(() => page.evaluate(() => window.popsim.selected())).toBe(s.row * PRESETS[preset].size + s.col);
        await expectInspectorMatchesRules(page, s);
        // A tap on the zoomed-out map flies the camera in; the card then finds its corner.
        await landed(page);
        if (key === 'river' || key === 'forest') await shot(page, testInfo, `inspector-${preset}-${key}`);
        // The card never covers the tapped hex.
        expect(await hexCovered(page, s.col, s.row), `card covers hex (${s.col}, ${s.row})`).toBe(false);
        await backToFit(page);
      }
      if (preset === 'default') expect(samples.river, 'default map should show a river hex').toBeTruthy();
    }
    expect(page.errors).toEqual([]);
  });

  test('tapping water or the close button closes the inspector', async ({ page }) => {
    await startGame(page);
    await pause(page);
    const samples = await visibleSampleHexes(page);
    const land = Object.values(samples)[0];
    // RULES.md: every edge hex is deep water.
    expect(await page.evaluate(() => window.popsim.terrainAt(0, 0))).toBe('deepWater');
    const water = Object.values(await visibleSampleHexes(page, { water: true }))[0];
    expect(water, 'a visible water hex').toBeTruthy();
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
    await landed(page);
    await page.locator('#btn-fit').click();
    await tapMap(page, water.x, water.y);
    await expect(page.locator('#inspector')).toBeHidden();
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
    await landed(page);
    await page.locator('#inspector button[aria-label="Close hex details"]').click();
    await expect(page.locator('#inspector')).toBeHidden();
    expect(await page.evaluate(() => window.popsim.selected())).toBe(-1);
  });

  test('drag pans, wheel zooms, fit restores', async ({ page }, testInfo) => {
    await startGame(page);
    await pause(page);
    const fitted = await camera(page);
    const box = await page.locator('#map').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + Math.min(box.height / 2, 200);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 30, cy - 20, { steps: 5 });
    await page.mouse.move(cx - 60, cy - 40, { steps: 5 });
    await page.mouse.up();
    const panned = await camera(page);
    expect(panned.scale).toBeCloseTo(fitted.scale, 5);
    expect(Math.abs(panned.x - fitted.x) + Math.abs(panned.y - fitted.y)).toBeGreaterThan(30);
    // A drag is not a tap.
    await expect(page.locator('#inspector')).toBeHidden();

    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await camera(page)).scale).toBeGreaterThan(fitted.scale * 1.2);
    await shot(page, testInfo, 'zoomed-in');
    await page.mouse.wheel(0, 2000);
    // RULES of the camera: never zooms out past 0.6 × the fitted scale.
    await expect.poll(async () => (await camera(page)).scale).toBeLessThan(fitted.scale);
    expect((await camera(page)).scale).toBeGreaterThanOrEqual(fitted.scale * 0.6 - 1e-9);

    await page.locator('#btn-fit').click();
    const refit = await camera(page);
    expect(refit.scale).toBeCloseTo(fitted.scale, 5);
    expect(refit.x).toBeCloseTo(fitted.x, 3);
    expect(refit.y).toBeCloseTo(fitted.y, 3);
  });

  test('arrow keys move the view the way they point, and + and − zoom', async ({ page }) => {
    // RULES.md "How civs and people look", Moving the map.
    await startGame(page);
    await page.evaluate(() => window.popsim.loop.setPaused(true));
    // Zoom in first so the map has room to move in every direction.
    const fit = await camera(page);
    await page.keyboard.down('+');
    await expect.poll(async () => (await camera(page)).scale).toBeGreaterThan(fit.scale * 1.5);
    await page.keyboard.up('+');
    const c0 = await camera(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    const c1 = await camera(page);
    expect(c1.x).toBeLessThan(c0.x - 20); // the view went right: the map moved left
    expect(Math.abs(c1.y - c0.y)).toBeLessThan(1);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
    const c2 = await camera(page);
    expect(c2.y).toBeGreaterThan(c1.y + 20);
    // Released keys stop the map.
    await page.waitForTimeout(200);
    expect(await camera(page)).toEqual(await camera(page));
    const c3 = await camera(page);
    await page.waitForTimeout(200);
    expect((await camera(page)).x).toBe(c3.x);
    await page.keyboard.down('-');
    await expect.poll(async () => (await camera(page)).scale).toBeLessThan(c3.scale / 1.5);
    await page.keyboard.up('-');
  });

  test('arrow keys do nothing outside the map, and leave the setup fields alone', async ({ page }) => {
    await page.locator('#m-seed').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#mapgen')).toBeVisible();
    await startGame(page);
    const before = await camera(page);
    await page.locator('#btn-setup').click();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowRight');
    await page.locator('#btn-resume').click();
    expect((await camera(page)).x).toBe(before.x);
  });

  test('two-finger pinch zooms and one-finger touch drag pans', async ({ page }, testInfo) => {
    await startGame(page);
    await pause(page);
    const client = await page.context().newCDPSession(page);
    if (!testInfo.project.use.hasTouch) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const box = await page.locator('#map').boundingBox();
    const cx = Math.round(box.x + box.width / 2);
    // Paused, the controls (with End now) reach up in landscape, so use a point well clear of the sheet.
    const cy = Math.round(box.y + Math.min(box.height * 0.3, 200));
    const touch = (type, pts) => client.send('Input.dispatchTouchEvent', {
      type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 })),
    });

    const before = await camera(page);
    await touch('touchStart', [[cx - 20, cy], [cx + 20, cy]]);
    for (let d = 30; d <= 100; d += 10) await touch('touchMove', [[cx - d, cy], [cx + d, cy]]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await camera(page)).scale).toBeGreaterThan(before.scale * 1.5);
    await shot(page, testInfo, 'pinched');

    const zoomed = await camera(page);
    await touch('touchStart', [[cx, cy]]);
    for (let d = 10; d <= 80; d += 10) await touch('touchMove', [[cx - d, cy - d / 2]]);
    await touch('touchEnd', []);
    const panned = await camera(page);
    expect(panned.scale).toBeCloseTo(zoomed.scale, 5);
    expect(Math.abs(panned.x - zoomed.x) + Math.abs(panned.y - zoomed.y)).toBeGreaterThan(30);
    await expect(page.locator('#inspector')).toBeHidden();

    // Pinch in zooms back out.
    await touch('touchStart', [[cx - 100, cy], [cx + 100, cy]]);
    for (let d = 90; d >= 30; d -= 10) await touch('touchMove', [[cx - d, cy], [cx + d, cy]]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await camera(page)).scale).toBeLessThan(panned.scale);
  });

  test('bottom sheet opens and lists hexes per terrain', async ({ page }, testInfo) => {
    await startGame(page);
    const sheet = page.locator('#sheet');
    await expect(sheet).toHaveAttribute('data-open', 'false');
    await page.locator('#sheet-handle').click();
    await expect(sheet).toHaveAttribute('data-open', 'true');
    await expect(page.locator('#sheet-handle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#stats')).toBeVisible();
    const listed = await page.locator('#stats li').evaluateAll((lis) => lis.map((li) => ({
      t: Number(li.dataset.terrain), name: li.querySelector('.name').textContent,
      n: Number(li.querySelector('.num').firstChild.textContent.replace(/\D/g, '')),
    })));
    const counts = await page.evaluate(() => window.popsim.host.stats().terrainCounts);
    const names = ['Deep water', 'Coast', 'Plains', 'Forest', 'Hills', 'Mountain', 'Desert', 'Tundra'];
    expect(listed.length).toBe(counts.filter((n) => n > 0).length);
    for (const row of listed) {
      expect(row.name).toBe(names[row.t]);
      expect(row.n).toBe(counts[row.t]);
    }
    expect(listed.reduce((s, r) => s + r.n, 0)).toBe(100);
    await shot(page, testInfo, 'sheet-open');
    await page.locator('#sheet-handle').click();
    await expect(sheet).toHaveAttribute('data-open', 'false');
  });

  test('back to setup pauses, and the game can be resumed', async ({ page }) => {
    await startGame(page);
    await expect.poll(() => year(page)).toBeGreaterThan(1);
    await page.locator('#btn-setup').click();
    await expect(page.locator('#setup')).toBeVisible();
    await expect(page.locator('#btn-resume')).toBeVisible();
    const y = await year(page);
    await page.waitForTimeout(300);
    expect(await year(page)).toBe(y);
    await page.locator('#btn-resume').click();
    await expect(page.locator('#game')).toBeVisible();
  });
});

test.describe('inspector placement', () => {
  /**
   * Tap a visible land hex (the camera flies in, see RULES.md "Tap a hex") and return it with its position and
   * the card's rectangle once the flight has landed, trying hexes until accept() likes one. Positions are
   * re-read after the flight; between tries the camera is fitted again.
   */
  async function selectHex(page, accept) {
    const samples = Object.values(await visibleSampleHexes(page));
    const all = await page.evaluate(() => {
      const size = window.popsim.mapParams().size;
      const out = [];
      for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
        if (!window.popsim.hex(col, row).water) out.push({ col, row });
      }
      return out;
    });
    let tries = 0;
    for (const { col, row } of [...samples, ...all]) {
      const p = await page.evaluate(([c, r]) => window.popsim.hexToScreen(c, r), [col, row]);
      if (!(await pointOnMap(page, p.x, p.y))) continue;
      if (++tries > 12) break;
      await tapMap(page, p.x, p.y);
      await expect(page.locator('#inspector')).toBeVisible();
      await landed(page);
      const at = await page.evaluate(([c, r]) => window.popsim.hexToScreen(c, r), [col, row]);
      const card = await cardRect(page);
      const extra = await accept({ col, row, ...at }, card);
      if (extra) return { col, row, ...at, card, ...extra };
      await backToFit(page);
    }
    return null;
  }

  test('panning the selected hex under the card moves the card to another corner', async ({ page }, testInfo) => {
    await startGame(page);
    await pause(page);
    const sel = await selectHex(page, async () => ({}));
    expect(sel).toBeTruthy();
    const target = { x: (sel.card.left + sel.card.right) / 2, y: (sel.card.top + sel.card.bottom) / 2 };
    const box = await page.locator('#map').boundingBox();
    await page.mouse.move(box.x + sel.x, box.y + sel.y);
    await page.mouse.down();
    await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#inspector')).toBeVisible();
    expect(await page.evaluate(() => window.popsim.selected())).toBe(sel.row * 10 + sel.col);
    const moved = await page.evaluate(([c, r]) => window.popsim.hexToScreen(c, r), [sel.col, sel.row]);
    // The hex really went where the card was.
    expect(moved.x).toBeGreaterThan(sel.card.left);
    expect(moved.x).toBeLessThan(sel.card.right);
    expect(moved.y).toBeGreaterThan(sel.card.top);
    expect(moved.y).toBeLessThan(sel.card.bottom);
    expect(await cardRect(page)).not.toEqual(sel.card);
    expect(await hexCovered(page, sel.col, sel.row)).toBe(false);
    await shot(page, testInfo, 'inspector-after-pan');
    // Zoomed in, a tap at the hex could land on a person, so close the card with its button.
    await page.locator('#inspector button[aria-label="Close hex details"]').click();
    await expect(page.locator('#inspector')).toBeHidden();
  });

  test('zooming the selected hex under the card moves the card to another corner', async ({ page }, testInfo) => {
    await startGame(page);
    await pause(page);
    // The tap flew the camera in, centring the hex. Wheel zoom by k keeps the anchor A fixed: P' = A + (P − A)·k.
    // Zooming out (k < 1) with A = P + (C − P) ÷ (1 − k) lands the hex P on the card centre C; take the
    // gentlest k whose anchor is still inside the canvas and whose zoom the camera allows.
    const sel = await selectHex(page, async (p, card) => {
      const c = { x: (card.left + card.right) / 2, y: (card.top + card.bottom) / 2 };
      const cam = await camera(page);
      const box = await page.locator('#map').boundingBox();
      for (const k of [0.6, 0.5, 0.4, 0.3, 0.25]) {
        if (cam.scale * k < cam.minScale * 1.01) continue;
        const a = { x: p.x + (c.x - p.x) / (1 - k), y: p.y + (c.y - p.y) / (1 - k) };
        if (a.x > 1 && a.y > 1 && a.x < box.width - 1 && a.y < box.height - 1) return { anchor: a, k };
      }
      return null;
    });
    test.skip(!sel, 'no hex where the zoom anchor falls inside the map at this viewport');
    const scale0 = (await camera(page)).scale;
    // One wheel event with an exact delta (emulated phones rescale page.mouse.wheel deltas).
    await page.locator('#map').evaluate((el, { x, y, deltaY }) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + x, clientY: r.top + y, deltaY, bubbles: true, cancelable: true }));
    }, { ...sel.anchor, deltaY: -Math.log(sel.k) / 0.0015 });
    await expect.poll(async () => (await camera(page)).scale).toBeLessThan(scale0 * 0.65);
    await expect(page.locator('#inspector')).toBeVisible();
    const moved = await page.evaluate(([c, r]) => window.popsim.hexToScreen(c, r), [sel.col, sel.row]);
    expect(moved.x).toBeGreaterThan(sel.card.left);
    expect(moved.x).toBeLessThan(sel.card.right);
    expect(moved.y).toBeGreaterThan(sel.card.top);
    expect(moved.y).toBeLessThan(sel.card.bottom);
    expect(await cardRect(page)).not.toEqual(sel.card);
    expect(await hexCovered(page, sel.col, sel.row)).toBe(false);
    await shot(page, testInfo, 'inspector-after-zoom');
    await page.locator('#inspector button[aria-label="Close hex details"]').click();
    await expect(page.locator('#inspector')).toBeHidden();
  });
});

test.describe('narrow phones', () => {
  const controlRects = (page) => page.evaluate(() => ['#btn-play', '#btn-step', ...[...document.querySelectorAll('#speed button')].map((_, i) => `#speed button:nth-child(${i + 1})`)]
    .map((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { id: el.id || el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }));

  test('342 × 750: all five speed buttons fit on one row', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 342, height: 750 });
    await startGame(page);
    const rects = await controlRects(page);
    const speeds = rects.slice(2);
    expect(speeds.map((r) => r.id)).toEqual(['1×', '3×', '10×', '30×', 'Max']);
    for (const r of rects) {
      expect(r.left, r.id).toBeGreaterThanOrEqual(0);
      expect(r.right, r.id).toBeLessThanOrEqual(342);
      expect(r.bottom, r.id).toBeLessThanOrEqual(750);
      expect(r.width, r.id).toBeGreaterThanOrEqual(44);
      expect(r.height, r.id).toBeGreaterThanOrEqual(44);
    }
    for (const r of speeds) expect(r.top, r.id).toBeCloseTo(speeds[0].top, 0);
    await shot(page, testInfo, 'controls-342');
    await page.locator('#speed button', { hasText: 'Max' }).click();
    await expect(page.locator('#speed button', { hasText: 'Max' })).toHaveAttribute('aria-checked', 'true');
  });

  test('320 × 568: the speed buttons wrap, Max is fully visible, every button is at least 44 × 44', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await startGame(page);
    const rects = await controlRects(page);
    const [play, , ...speeds] = rects;
    expect(speeds[0].top).toBeGreaterThanOrEqual(play.bottom - 1);
    for (const r of rects) {
      expect(r.left, r.id).toBeGreaterThanOrEqual(0);
      expect(r.right, r.id).toBeLessThanOrEqual(320);
      expect(r.top, r.id).toBeGreaterThanOrEqual(0);
      expect(r.bottom, r.id).toBeLessThanOrEqual(568);
      expect(r.width, r.id).toBeGreaterThanOrEqual(44);
      expect(r.height, r.id).toBeGreaterThanOrEqual(44);
    }
    const max = page.locator('#speed button', { hasText: 'Max' });
    const hit = await max.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === el || el.contains(top);
    });
    expect(hit).toBe(true);
    await shot(page, testInfo, 'controls-320');
    await max.click();
    await expect(max).toHaveAttribute('aria-checked', 'true');
    const handle = await page.locator('#sheet-handle').boundingBox();
    expect(handle.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('layout', () => {
  test('touch targets are at least 44px and inputs at least 16px', async ({ page }) => {
    const check = () => page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, select, input, [role="radio"]')) {
        if (el.offsetParent === null || el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect();
        // PixiJS parks an off-screen accessibility button at (-1000, -1000) on touch devices.
        if (r.right <= 0 || r.bottom <= 0) continue;
        const id = el.id || el.getAttribute('aria-label') || el.textContent.trim();
        // A checkbox is tapped through its label, which fills the row and is at least 44px tall.
        const t = el.type === 'checkbox' ? document.querySelector(`label[for="${el.id}"]`).getBoundingClientRect() : r;
        if (el.type !== 'range' && (t.width < 44 || t.height < 44)) out.push(`${id}: ${Math.round(t.width)}×${Math.round(t.height)}`);
        if (el.matches('input, select') && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${id}: font ${getComputedStyle(el).fontSize}`);
      }
      return out;
    });
    const problems = { mapgen: await check() };
    await page.locator('#btn-continue').click();
    await page.locator('#f-end-year').check();
    await page.locator('#f-end-years').selectOption('custom');
    problems.setup = await check();
    await page.locator('#btn-start').click();
    await expect(page.locator('#game')).toBeVisible();
    await pause(page);
    const s = (await visibleSampleHexes(page));
    const land = Object.values(s)[0];
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
    // The sheet handle is a full-width swipe strip; it is checked separately below.
    problems.game = await check();
    const handle = await page.locator('#sheet-handle').boundingBox();
    expect(handle.height).toBeGreaterThanOrEqual(44);
    expect(handle.width).toBeGreaterThanOrEqual(44);
    expect(problems).toEqual({ mapgen: [], setup: [], game: [] });
  });

  test('rotation keeps every control on screen', async ({ page }, testInfo) => {
    const onScreen = (ids) => page.evaluate((sel) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      return sel.flatMap((s) => [...document.querySelectorAll(s)]).filter((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const hit = getComputedStyle(el).pointerEvents === 'none' || top === el || el.contains(top);
        return !(r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5 && hit);
      }).map((el) => el.id || el.textContent.trim());
    }, ids);
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    // Phones rotate between the device's own portrait and landscape viewports; desktop swaps its sides.
    const vp = page.viewportSize();
    const pair = { 'phone-portrait': devices['iPhone 13 landscape'], 'phone-landscape': devices['iPhone 13'] }[testInfo.project.name];
    const rotated = pair ? { ...pair.viewport } : { width: vp.height, height: vp.width };
    const views = [vp, rotated, vp];

    for (const [i, v] of views.entries()) {
      await page.setViewportSize(v);
      await page.locator('#btn-continue').scrollIntoViewIfNeeded();
      expect(await onScreen(['#btn-continue'])).toEqual([]);
      expect(await noHScroll()).toBe(true);
      if (i === 1) await shot(page, testInfo, 'mapgen-rotated');
    }
    await startGame(page);
    await pause(page);
    const gameControls = ['#btn-setup', '#btn-fit', '#btn-play', '#btn-step', '#speed button', '#hud-year'];
    for (const [i, v] of views.entries()) {
      await page.setViewportSize(v);
      await page.waitForTimeout(300);
      expect(await onScreen(gameControls), `viewport ${v.width}×${v.height}`).toEqual([]);
      expect(await noHScroll()).toBe(true);
      // The map refits to the new shape: its centre hex is on the canvas.
      const size = (await page.evaluate(() => window.popsim.mapParams())).size;
      const c = await page.evaluate((n) => window.popsim.hexToScreen(n, n), Math.floor(size / 2));
      const box = await page.locator('#map').boundingBox();
      expect(c.x).toBeGreaterThan(0);
      expect(c.y).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(box.width);
      expect(c.y).toBeLessThan(box.height);
      if (i === 1) await shot(page, testInfo, 'game-rotated');
    }
  });

  test('manifest is served and valid', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.display).toBe('standalone');
    for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
  });
});
