import { defineConfig } from '@playwright/test'

// Edge locally on Windows; bundled Chromium on Linux/CI. Never inherited by WebKit.
export const chromiumChannel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === 'win32' && !process.env.CI ? 'msedge' : undefined)
const sharedTests = ['**/core-workflow.spec.ts', '**/experience.spec.ts']

export default defineConfig({
  testDir: './tests',
  outputDir: '.qa/test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [
    ['list'],
    ['json', { outputFile: '.qa/results.json' }],
    ['html', { outputFolder: '.qa/report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The full legacy suite includes CDP touch gestures and browser PID checks.
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        channel: chromiumChannel,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        channel: chromiumChannel,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'webkit-desktop',
      testMatch: sharedTests,
      use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'webkit-mobile',
      testMatch: sharedTests,
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
