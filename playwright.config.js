import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH lets environments with a preinstalled Chromium skip the download.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  webServer: {
    command: 'node tools/serve.js 4173',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'phone-portrait', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'phone-landscape', use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
