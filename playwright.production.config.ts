import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Exercise built assets and browser restart on a separate, stable origin.
export default defineConfig({
  ...base,
  grep: /@core|@experience|both card layouts export|saved works survive complete browser/,
  outputDir: '.qa/production-results',
  reporter: [['list'], ['json', { outputFile: '.qa/production-results.json' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175/Starloom/' },
  webServer: {
    command: 'npm run preview -- --port 4175 --strictPort --base=/Starloom/',
    url: 'http://127.0.0.1:4175/Starloom/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
