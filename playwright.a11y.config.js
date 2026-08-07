const { defineConfig, devices } = require('@playwright/test');

// Config separado de playwright.config.js (que es solo para tests/visual).
// Corre los tests de accesibilidad (axe-core) contra un set representativo
// de páginas: home/mapa + una ficha de cada familia de generador.
module.exports = defineConfig({
  testDir: './tests/accessibility',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report-a11y' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'a11y-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'a11y-mobile',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npx http-server . -p 8080 -s',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
  },
});
