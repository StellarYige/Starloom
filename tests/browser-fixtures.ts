import { test as base, webkit } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
export { expect } from '@playwright/test'

export const test = base.extend({
  context: async (
    {
      context,
      browserName,
      launchOptions,
      contextOptions,
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    },
    use,
    info,
  ) => {
    if (browserName !== 'webkit') {
      await use(context)
      return
    }
    // Use a fresh ordinary profile for WebKit on every platform. Ephemeral
    // contexts have different Blob storage limits; these flows verify normal
    // local saving, not private browsing. Keep IDB and disk storage real.
    // Keep the directory name ASCII and short: Windows WebKit's SQLite path
    // handling fails with Unicode test titles. Each test still gets a fresh profile.
    await mkdir(info.project.outputDir, { recursive: true })
    const profile = await mkdtemp(join(info.project.outputDir, 'webkit-profile-'))
    const persistent = await webkit.launchPersistentContext(profile, {
      ...launchOptions,
      ...contextOptions,
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    })
    try {
      await use(persistent)
    } finally {
      await persistent.close()
    }
  },
})

test.afterEach(async ({ page, browserName }, info) => {
  if (info.status !== info.expectedStatus) {
    // Keep useful failure evidence in CI logs without uploading profiles/photos.
    console.error('Browser failure context', {
      browserName,
      url: page.url(),
      alerts: await page
        .getByRole('alert')
        .allTextContents()
        .catch(() => []),
    })
  }
})
