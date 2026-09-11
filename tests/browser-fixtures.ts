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
    if (browserName !== 'webkit' || process.platform !== 'win32') {
      await use(context)
      return
    }
    // Windows WebKit cannot store IDB Blobs in ephemeral contexts. A fresh,
    // per-test persistent profile tests real disk storage without mocking IDB.
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
