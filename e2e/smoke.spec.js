import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test('setup → start → the sim runs and stats appear', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await page.locator('#f-seed').fill('smoke');
  await page.locator('#btn-start').click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#stats li')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => window.popsim.host.tickCount), { timeout: 10_000 }).toBeGreaterThan(5);
  await expect(page.locator('#hud-year')).not.toHaveText('Year 0');
});

test('controls: pause, step and speed change', async ({ page }) => {
  await page.locator('#btn-start').click();
  await page.locator('#btn-play').click(); // pause
  const before = await page.evaluate(() => window.popsim.host.tickCount);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.popsim.host.tickCount)).toBe(before);
  await page.locator('#btn-step').click();
  await expect.poll(() => page.evaluate(() => window.popsim.host.tickCount)).toBe(before + 1);
  await page.locator('#speed button', { hasText: 'Max' }).click();
  await expect.poll(() => page.evaluate(() => window.popsim.host.tickCount), { timeout: 10_000 }).toBeGreaterThan(before + 50);
});

test('tapping a cell opens the inspector', async ({ page }) => {
  await page.locator('#btn-start').click();
  await page.locator('#btn-play').click();
  // Tap the first start cell of civ 1 so the inspector shows an owner.
  const pt = await page.evaluate(() => {
    const { host, camera } = window.popsim;
    const w = host.world;
    const i = w.owner.findIndex((o) => o === 1);
    const x = i % w.width, y = Math.floor(i / w.width);
    return { x: camera.x + (x + 0.5) * camera.scale, y: camera.y + (y + 0.5) * camera.scale };
  });
  await page.locator('#map').click({ position: pt });
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#inspector')).toContainText('Expansionist');
});

test('bottom sheet expands and collapses', async ({ page }) => {
  await page.locator('#btn-start').click();
  const handle = page.locator('#sheet-handle');
  await handle.click();
  await expect(page.locator('#sheet')).toHaveAttribute('data-open', 'true');
  await handle.click();
  await expect(page.locator('#sheet')).toHaveAttribute('data-open', 'false');
});

test('presets and randomise produce a startable setup', async ({ page }) => {
  await page.locator('#f-preset').selectOption('archipelago');
  await expect(page.locator('#f-seed')).toHaveValue('islands');
  await page.locator('#btn-randomise').click();
  await expect(page.locator('#f-preset')).toHaveValue('custom');
  await page.locator('#btn-start').click();
  await expect.poll(() => page.evaluate(() => window.popsim.host.tickCount), { timeout: 10_000 }).toBeGreaterThan(2);
});

test('touch targets are at least 44px', async ({ page }) => {
  await page.locator('#btn-start').click();
  const small = await page.evaluate(() => [...document.querySelectorAll('#game button')]
    .filter((b) => b.offsetParent !== null && !b.classList.contains('sheet-handle'))
    .map((b) => ({ id: b.id || b.textContent, ...b.getBoundingClientRect().toJSON() }))
    .filter((r) => r.width < 44 || r.height < 44));
  expect(small).toEqual([]);
});

test('manifest is served and valid', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.display).toBe('standalone');
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
});
