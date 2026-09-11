import { chromium, test, expect } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { current, fixture, readWorks, ready, saved } from './card-helpers'

test('saved works survive complete browser process exit and reopen with the same profile and origin', async ({}, info) => {
  test.setTimeout(120_000)
  const profile = info.outputPath('browser-profile')
  const options = {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
    baseURL: info.project.use.baseURL!,
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    deviceScaleFactor: info.project.use.deviceScaleFactor,
  }
  const processId = async (context: BrowserContext) => {
    const cdp = await context.browser()!.newBrowserCDPSession()
    const result = await cdp.send('SystemInfo.getProcessInfo')
    await cdp.detach()
    return result.processInfo.find((item) => item.type === 'browser')!.id
  }
  let context = await chromium.launchPersistentContext(profile, options)
  try {
    const firstPid = await processId(context)
    const version = context.browser()!.version()
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: '新建物料', exact: true }).click()
    await saved(page)
    const birthday = await current(page)
    await page.getByRole('button', { name: '我的物料', exact: true }).click()
    await page.getByRole('button', { name: '新建电子小卡', exact: true }).click()
    await ready(page)
    await page
      .getByLabel('上传照片 1', { exact: true })
      .setInputFiles(await fixture(page, '#cf624b', 1600, 800))
    await ready(page)
    await page
      .getByLabel('上传照片 2', { exact: true })
      .setInputFiles(await fixture(page, '#426b9f', 800, 1600))
    await ready(page)
    await page.getByRole('button', { name: '放大照片', exact: true }).click()
    await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
    await page.getByRole('button', { name: /^照片 1/ }).click()
    await page.getByRole('button', { name: '放大照片', exact: true }).click()
    await page.getByLabel('姓名', { exact: true }).fill('重开浏览器后的日常')
    await page.getByLabel('短句', { exact: true }).fill('两张照片和每个布局，都留在这里。')
    await page.getByLabel('日期（可选）').fill('2026-09-11')
    await page.getByRole('button', { name: '立即保存', exact: true }).click()
    await ready(page)
    await saved(page)
    const before = await current(page)
    const preview = await page
      .locator('.primary-artwork canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    const browser = context.browser()!
    // A persistent context owns its browser; closing it awaits that browser's shutdown.
    await context.close()
    expect(browser.isConnected()).toBe(false)
    await expect
      .poll(() => {
        try {
          process.kill(firstPid, 0)
          return false
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === 'ESRCH'
        }
      })
      .toBe(true)

    context = await chromium.launchPersistentContext(profile, options)
    const secondPid = await processId(context)
    expect(secondPid).not.toBe(firstPid)
    const reopened = await context.newPage()
    await reopened.goto('/')
    await ready(reopened)
    await saved(reopened)
    const after = await current(reopened)
    expect(after.project).toEqual(before.project)
    expect(after.asset).toEqual(before.asset)
    expect(after.secondAsset).toEqual(before.secondAsset)
    expect(after.id).toBe(before.id)
    expect(after.title).toBe(before.title)
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(after.revision).toBe(before.revision)
    await expect(reopened.getByLabel('姓名', { exact: true })).toHaveValue(before.project.name)
    await expect(reopened.getByLabel('日期（可选）')).toHaveValue('2026-09-11')
    await expect(reopened.getByRole('button', { name: '选择写真拼贴布局' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(reopened.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    const data = await readWorks(reopened)
    expect(data.works).toHaveLength(2)
    expect(data.works.find((work) => work.id === birthday.id).project).toEqual(birthday.project)
    const visual = await reopened.evaluate(async (data) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.primary-artwork canvas')!
      const before = new Image()
      before.src = data
      const after = new Image()
      after.src = canvas.toDataURL()
      await Promise.all([before.decode(), after.decode()])
      const scratch = document.createElement('canvas')
      scratch.width = canvas.width
      scratch.height = canvas.height
      const ctx = scratch.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(before, 0, 0)
      const a = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(after, 0, 0)
      const b = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
      return {
        before: [before.width, before.height],
        after: [after.width, after.height],
        difference: sum / a.length,
      }
    }, preview)
    await info.attach('restart-preview-difference', {
      body: JSON.stringify(visual),
      contentType: 'application/json',
    })
    expect(visual.after).toEqual(visual.before)
    expect(visual.difference).toBeLessThan(0.1)
    await reopened.screenshot({
      path: info.outputPath('restored-after-process-exit.png'),
      fullPage: true,
    })
    await info.attach('restart-evidence', {
      body: JSON.stringify(
        {
          version,
          origin: options.baseURL,
          profile: 'dedicated test profile, same for both launches',
          firstPid,
          secondPid,
          firstProcessExited: true,
          worksRestored: data.works.length,
          firstPhotoSHA256: after.asset.blob,
          secondPhotoSHA256: after.secondAsset.blob,
          allLayoutsRestored: after.project.card.cropsByLayout,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
  } finally {
    await context.close()
  }
})
