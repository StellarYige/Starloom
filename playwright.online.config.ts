import { defineConfig } from '@playwright/test'
import base from './playwright.config'

const baseURL = process.env.STARLOOM_ONLINE_URL
if (!baseURL || new URL(baseURL).pathname !== '/Starloom/') {
  throw new Error('Set STARLOOM_ONLINE_URL to the verified Pages URL ending in /Starloom/.')
}
export default defineConfig({
  ...base,
  grep: /@core/,
  outputDir: '.qa/online-results',
  reporter: [['list'], ['json', { outputFile: '.qa/online-results.json' }]],
  use: {
    ...base.use,
    baseURL,
    launchOptions: process.env.STARLOOM_TEST_PROXY
      ? { proxy: { server: process.env.STARLOOM_TEST_PROXY } }
      : {},
  },
  webServer: undefined,
})
