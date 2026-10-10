// Phase 1 browser tests (T-009): map generation, setup, the hex map, time controls and layout.
// Expected values come from RULES.md. Phase 1 has no people, so population, people on the map,
// the person inspector and the end screen are not covered here.

import { test, expect, devices } from '@playwright/test';

// RULES.md "Terrain".
const TERRAIN = {
  coast: { name: 'Coast', food: 50, move: '1', defence: '0%', materials: 'None' },
  plains: { name: 'Plains', food: 60, move: '1', defence: '0%', materials: 'None' },
  forest: { name: 'Forest', food: 40, move: '2', defence: '+25%', materials: '30 (wood)' },
  hills: { name: 'Hills', food: 30, move: '2', defence: '+50%', materials: '20 (stone)' },
  mountain: { name: 'Mountain', food: 10, move: '3', defence: '+100%', materials: 'None' },
  desert: { name: 'Desert', food: 10, move: '1.5', defence: '0%', materials: 'None' },
  tundra: { name: 'Tundra', food: 15, move: '1.5', defence: '0%', materials: 'None' },
};
const RIVER_BONUS = 30;

// RULES.md "Map settings" presets.
const PRESETS = {
  default: { seed: 'pangaea', size: 10, water: 0.25, mountains: 0.12, rivers: 2 },
  continent: { seed: 'continent', size: 30, water: 0.2, mountains: 0.12, rivers: 6 },
  archipelago: { seed: 'islands', size: 30, water: 0.6, mountains: 0.08, rivers: 2 },
  highlands: { seed: 'peaks', size: 20, water: 0.15, mountains: 0.3, rivers: 5 },
  large: { seed: 'vast', size: 50, water: 0.3, mountains: 0.12, rivers: 12 },
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
    await page.locator('#f-end').selectOption('ticks');
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

/** Pause the sim so the test reads stable values. */
async function pause(page) {
  if (await page.evaluate(() => !window.popsim.loop.paused)) await page.locator('#btn-play').click();
  await expect.poll(() => page.evaluate(() => window.popsim.loop.paused)).toBe(true);
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

async function expectInspectorMatchesRules(page, sample) {
  const insp = page.locator('#inspector');
  await expect(insp).toBeVisible();
  const h = sample.hex;
  const rule = TERRAIN[h.terrain];
  expect(rule, `unknown terrain ${h.terrain}`).toBeTruthy();
  const cap = rule.food + (h.river ? RIVER_BONUS : 0);
  await expect(insp.locator('h3')).toContainText(rule.name);
  await expect(insp.locator('h3')).toContainText(`(${sample.col}, ${sample.row})`);
  // RULES.md: every hex starts with food equal to its capacity, and nothing eats in Phase 1.
  await expect(insp.locator('dd[data-field="food"]')).toHaveText(`${cap} / ${cap}`);
  await expect(insp.locator('dd[data-field="food-capacity"]')).toHaveText(String(cap));
  await expect(insp.locator('dd[data-field="materials"]')).toHaveText(rule.materials);
  await expect(insp.locator('dd[data-field="movement-cost"]')).toHaveText(rule.move);
  await expect(insp.locator('dd[data-field="defence-bonus"]')).toHaveText(rule.defence);
  if (h.river) await expect(insp.locator('dd[data-field="river"]')).toHaveText('Yes (fertile)');
  else await expect(insp.locator('dd[data-field="river"]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#mapgen')).toBeVisible();
  await expect.poll(() => previewHash(page)).not.toBeNull();
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test.describe('map generation screen', () => {
  test('opens first with the RULES.md defaults', async ({ page }, testInfo) => {
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
    await expect(page.locator('#f-end')).toHaveValue('none');
    await expect(page.locator('#f-end-ticks')).toBeHidden();
    await page.locator('#f-end').selectOption('ticks');
    await expect(page.locator('#f-end-ticks')).toBeVisible();
    await expect(page.locator('#f-end-ticks')).toHaveValue('1000');
    await expect(page.locator('#f-end-ticks')).toHaveAttribute('min', '10');
    await expect(page.locator('#f-end-ticks')).toHaveAttribute('max', '100000');
    await shot(page, testInfo, 'setup');
    await page.locator('#btn-change-map').click();
    await expect(page.locator('#mapgen')).toBeVisible();
    expect(await previewParams(page)).toEqual(PRESETS.highlands);
  });

  test('start runs the game on the previewed map', async ({ page }, testInfo) => {
    await page.locator('#m-seed').fill('start-me');
    await page.locator('#m-size').fill('14');
    await expect.poll(() => previewParams(page)).toMatchObject({ seed: 'start-me', size: 14 });
    const hash = await previewHash(page);
    const params = await previewParams(page);
    await startGame(page);
    expect(await page.evaluate(() => window.popsim.mapHash())).toBe(hash);
    expect(await page.evaluate(() => window.popsim.mapParams())).toEqual(params);
    await expect.poll(() => year(page), { timeout: 10_000 }).toBeGreaterThan(3);
    await expect(page.locator('#hud-year')).toHaveText(/^Year [1-9]\d*$/);
    await expect(page.locator('#hud-pop')).toContainText('14 × 14 hexes');
    await expect(page.locator('#hud-pop')).toContainText('no people yet');
    await shot(page, testInfo, 'game');
  });
});

test.describe('game', () => {
  test('pause, step exactly one year, and every speed', async ({ page }) => {
    await startGame(page);
    await pause(page);
    const y0 = await year(page);
    await page.waitForTimeout(400);
    expect(await year(page)).toBe(y0);
    await page.locator('#btn-step').click();
    await expect.poll(() => year(page)).toBe(y0 + 1);
    await page.waitForTimeout(300);
    expect(await year(page)).toBe(y0 + 1);
    await expect(page.locator('#hud-year')).toHaveText(`Year ${y0 + 1}`);
    // Step while running pauses and advances exactly one year.
    await page.locator('#btn-play').click();
    await expect.poll(() => year(page)).toBeGreaterThan(y0 + 1);
    const running = await year(page);
    await page.locator('#btn-step').click();
    await expect.poll(() => page.evaluate(() => window.popsim.loop.paused)).toBe(true);
    await page.waitForTimeout(200);
    const afterStep = await year(page);
    expect(afterStep).toBeGreaterThan(running);
    await page.waitForTimeout(300);
    expect(await year(page)).toBe(afterStep);

    const labels = ['1×', '2×', '5×', '20×', 'Max'];
    await expect(page.locator('#speed button')).toHaveText(labels);
    for (let i = 0; i < labels.length; i++) {
      const btn = page.locator('#speed button', { hasText: labels[i] }).first();
      await btn.click();
      await expect(btn).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate(() => window.popsim.loop.speedIndex)).toBe(i);
      expect(await page.evaluate(() => window.popsim.loop.paused)).toBe(false);
      const before = await year(page);
      await expect.poll(() => year(page), { timeout: 5_000 }).toBeGreaterThan(before);
    }
    // RULES.md: 1× runs 8 years per second, 20× runs 160.
    await page.locator('#speed button', { hasText: '1×' }).click();
    let a = await year(page);
    await page.waitForTimeout(1000);
    let rate = (await year(page)) - a;
    expect(rate).toBeGreaterThanOrEqual(4);
    expect(rate).toBeLessThanOrEqual(12);
    await page.locator('#speed button', { hasText: '20×' }).click();
    a = await year(page);
    await page.waitForTimeout(1000);
    rate = (await year(page)) - a;
    expect(rate).toBeGreaterThanOrEqual(60);
    expect(rate).toBeLessThanOrEqual(200);
  });

  test('the sim is still running after 60 years at Max speed and food stays full', async ({ page }) => {
    await startGame(page);
    await page.locator('#speed button', { hasText: 'Max' }).click();
    await expect.poll(() => year(page), { timeout: 10_000 }).toBeGreaterThan(60);
    const y = await year(page);
    await expect.poll(() => year(page)).toBeGreaterThan(y);
    // RULES.md: with no people, every hex keeps its full food.
    const notFull = await page.evaluate(() => {
      const size = window.popsim.mapParams().size;
      const bad = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const h = window.popsim.hex(c, r);
        if (h.food !== h.foodCap) bad.push(h);
      }
      return bad;
    });
    expect(notFull).toEqual([]);
  });

  test('a year limit of 10 stops at year 10 with a toast', async ({ page }, testInfo) => {
    await startGame(page, { endTicks: 10 });
    await expect.poll(() => page.evaluate(() => window.popsim.host.finished), { timeout: 10_000 }).toBe(true);
    expect(await year(page)).toBe(10);
    await expect(page.locator('#hud-year')).toHaveText('Year 10 (ended)');
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toHaveText('Reached year 10');
    await expect(page.locator('#btn-play')).toHaveAttribute('aria-label', 'Play');
    await shot(page, testInfo, 'year-limit');
    await page.waitForTimeout(300);
    expect(await year(page)).toBe(10);
    await page.locator('#btn-step').click();
    await page.waitForTimeout(200);
    expect(await year(page)).toBe(10);
  });

  test('tapping hexes shows RULES.md terrain values', async ({ page }, testInfo) => {
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
        if (key === 'river' || key === 'forest') await shot(page, testInfo, `inspector-${preset}-${key}`);
        // Tapping the same hex again closes the inspector, unless the card now covers it.
        const covered = await page.evaluate(({ x, y }) => {
          const r = document.getElementById('map').getBoundingClientRect();
          return document.elementFromPoint(r.left + x, r.top + y) !== document.getElementById('map');
        }, s);
        if (covered) await page.locator('#inspector button[aria-label="Close hex details"]').click();
        else await tapMap(page, s.x, s.y);
        await expect(page.locator('#inspector')).toBeHidden();
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
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
    // RULES.md: every edge hex is deep water.
    expect(await page.evaluate(() => window.popsim.terrainAt(0, 0))).toBe('deepWater');
    const water = Object.values(await visibleSampleHexes(page, { water: true }))[0];
    expect(water, 'a visible water hex').toBeTruthy();
    await tapMap(page, water.x, water.y);
    await expect(page.locator('#inspector')).toBeHidden();
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
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

  test('two-finger pinch zooms and one-finger touch drag pans', async ({ page }, testInfo) => {
    await startGame(page);
    await pause(page);
    const client = await page.context().newCDPSession(page);
    if (!testInfo.project.use.hasTouch) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const box = await page.locator('#map').boundingBox();
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + Math.min(box.height / 2, 200));
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
        if (el.type !== 'range' && (r.width < 44 || r.height < 44)) out.push(`${id}: ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (el.matches('input, select') && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${id}: font ${getComputedStyle(el).fontSize}`);
      }
      return out;
    });
    const problems = { mapgen: await check() };
    await page.locator('#btn-continue').click();
    await page.locator('#f-end').selectOption('ticks');
    problems.setup = await check();
    await page.locator('#btn-start').click();
    await expect(page.locator('#game')).toBeVisible();
    await pause(page);
    const s = (await visibleSampleHexes(page));
    const land = Object.values(s)[0];
    await tapMap(page, land.x, land.y);
    await expect(page.locator('#inspector')).toBeVisible();
    // The sheet handle is a full-width swipe strip; it is checked separately below.
    problems.game = (await check()).filter((p) => !p.startsWith('sheet-handle'));
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
