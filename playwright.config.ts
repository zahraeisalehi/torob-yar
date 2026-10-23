import { defineConfig, devices } from '@playwright/test';

// BASE_URL set → test that deployment (e.g. the live Liara URL); otherwise build + run fixtures/scripted locally.
const external = process.env.BASE_URL;
const PORT = Number(process.env.E2E_PORT ?? 3300);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: external ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: external
    ? undefined
    : {
        command: `npm run build && sh scripts/start.sh`,
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          PORT: String(PORT),
          DATA_SOURCE: 'fixtures',
          LLM_MODE: 'scripted',
          AUTO_REPLY: '1',
          AUTO_REPLY_MIN_S: '2',
          AUTO_REPLY_MAX_S: '3',
          DATA_RW_DIR: './data/rw-e2e',
          SHOP_TOKEN_SECRET: 'e2e-secret',
          DEMO_INDEX: '1',
        },
      },
});
