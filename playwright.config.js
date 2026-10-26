const { defineConfig, devices } = require('@playwright/test');

// Locally we drive the installed Google Chrome; CI installs Playwright's Chromium.
const chrome = process.env.CI ? {} : { channel: 'chrome' };

module.exports = defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1, // one shared in-memory registry, reset before each test
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/support/server.js',
    url: 'http://localhost:4173/config.js',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], ...chrome } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...chrome } }
  ]
});
