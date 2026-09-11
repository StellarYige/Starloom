import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const go = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: new RegExp(name) })
    .click()
const canvas = (page: Page) => page.locator('.primary-artwork canvas')
async function pixels(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLCanvasElement>('.primary-artwork canvas')
    return (
      el &&
      el.width ===
        Math.round(parseFloat(getComputedStyle(el).width) * Math.min(devicePixelRatio, 2))
    )
  })
  return canvas(page).evaluate((el: HTMLCanvasElement) => el.toDataURL())
}
async function imageDifference(page: Page, expected: string) {
  return page.evaluate(async (url) => {
    const actual = document.querySelector<HTMLCanvasElement>('.primary-artwork canvas')!
    const image = new Image()
    image.src = url
    const currentImage = new Image()
    currentImage.src = actual.toDataURL()
    await Promise.all([image.decode(), currentImage.decode()])
    const reference = document.createElement('canvas')
    reference.width = actual.width
    reference.height = actual.height
    // Read pixels from copies: repeated readbacks of the production canvas can
    // switch Chromium from GPU to CPU rasterization and change antialiasing.
    const ctx = reference.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(currentImage, 0, 0, reference.width, reference.height)
    const a = ctx.getImageData(0, 0, reference.width, reference.height).data
    ctx.clearRect(0, 0, reference.width, reference.height)
    ctx.drawImage(image, 0, 0, reference.width, reference.height)
    const b = ctx.getImageData(0, 0, reference.width, reference.height).data
    let difference = 0
    for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i])
    return difference / a.length
  }, expected)
}
const saved = (page: Page) =>
  expect(page.locator('.workspace-status')).toContainText('已保存到本机')
async function changeZoom(page: Page) {
  const slider = page.getByRole('slider', { name: '照片缩放' })
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  await slider.click({ position: { x: box!.width * 0.28, y: box!.height / 2 } })
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(1.2)
  return slider.inputValue()
}
async function makeImage(
  page: Page,
  width: number,
  height: number,
  type = 'image/png',
  transparent = false,
) {
  const data = await page.evaluate(
    ({ width, height, type, transparent }) => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const context = c.getContext('2d')!
      const gradient = context.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#E8C89D')
      gradient.addColorStop(0.5, '#ACBDA1')
      gradient.addColorStop(1, '#718BA0')
      context.fillStyle = gradient
      context.fillRect(transparent ? width / 4 : 0, 0, transparent ? width / 2 : width, height)
      context.fillStyle = '#8f475c'
      context.fillRect(width * 0.4, height * 0.25, width * 0.2, height * 0.4)
      return c.toDataURL(type)
    },
    { width, height, type, transparent },
  )
  return Buffer.from(data.split(',')[1], 'base64')
}
async function getLocalDraft(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('starloom-local', 1)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('drafts').objectStore('drafts').get('current')
          read.onsuccess = () => {
            db.close()
            resolve(read.result)
          }
          read.onerror = () => reject(read.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '选好了，放入照片' })).toBeEnabled()
  await page.waitForFunction(() => document.querySelectorAll('.artwork-loading').length === 0)
})

test('complete workflow, independent crops, real PNG downloads and preview consistency', async ({
  page,
}, testInfo) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:5173/') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      requests.push(request.url())
    if (request.method() === 'POST') requests.push(`POST ${request.url()}`)
  })
  await page.getByRole('button', { name: '选好了，放入照片' }).click()
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('public/assets/portrait.jpg')
  await expect(page.locator('.photo-meta')).toContainText('portrait.jpg')
  await page.getByRole('button', { name: '下一步，写下祝福' }).click()
  await page.getByLabel('TA 的名字').fill('夏予 · Summer')
  await page.getByLabel('生日月份').selectOption('2')
  await page.getByLabel('生日日期').selectOption('29')
  await page
    .getByLabel('想对 TA 说的话')
    .fill('愿你一直自由，也一直被爱。\nHappy birthday, my favorite person!')
  await page.getByRole('button', { name: '下一步，选择配色' }).click()
  await page.getByRole('button', { name: '应援色：蔷薇粉' }).click()
  await page.getByRole('button', { name: '下一步，调整细节' }).click()
  const posterZoom = await changeZoom(page)
  await page.getByRole('tab', { name: /应援头像/ }).click()
  await expect(page.getByRole('slider')).toHaveValue('1')
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await expect(page.getByRole('slider')).toHaveValue('1.1')
  await page.getByRole('tab', { name: /生日贺图/ }).click()
  await expect(page.getByRole('slider')).toHaveValue(posterZoom)
  await page.getByRole('switch', { name: /星芒点缀/ }).uncheck()
  await page.getByRole('button', { name: '好了，准备导出' }).click()
  await page.getByRole('tab', { name: /应援头像/ }).click()
  await page.getByLabel('圆形安全区').check()
  await expect(page.locator('.safe-area')).toBeVisible()
  await saved(page)
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
  await page.getByRole('button', { name: '导出这份心意' }).click()
  await expect(page.getByRole('link', { name: '下载贺图 PNG', exact: true })).toBeVisible()
  const files: Record<string, string> = {}
  for (const [name, filename, width, height] of [
    ['下载头像 PNG', 'avatar.png', 1600, 1600],
    ['下载贺图 PNG', 'poster.png', 2400, 3000],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name, exact: true }).click(),
    ])
    const path = testInfo.outputPath(filename)
    await download.saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(width)
    expect(bytes.readUInt32BE(20)).toBe(height)
    expect(bytes.length).toBeGreaterThan(100_000)
    files[filename] = (await page
      .getByRole('link', { name, exact: true })
      .getAttribute('href')) as string
  }
  // Compare the actual visible canvas pixels with the exported file, not a second call to the renderer.
  for (const [filename, selector] of [
    ['avatar.png', '.primary-artwork canvas'],
    ['poster.png', '.companion-art canvas'],
  ]) {
    const difference = await page.evaluate(
      async ({ url, selector }) => {
        const original = document.querySelector<HTMLCanvasElement>(selector)!
        const image = new Image()
        image.src = url
        const preview = new Image()
        preview.src = original.toDataURL()
        await Promise.all([image.decode(), preview.decode()])
        const reduced = document.createElement('canvas')
        reduced.width = original.width
        reduced.height = original.height
        const ctx = reduced.getContext('2d', { willReadFrequently: true })!
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(preview, 0, 0, reduced.width, reduced.height)
        const a = ctx.getImageData(0, 0, reduced.width, reduced.height).data
        ctx.clearRect(0, 0, reduced.width, reduced.height)
        ctx.drawImage(image, 0, 0, reduced.width, reduced.height)
        const b = ctx.getImageData(0, 0, reduced.width, reduced.height).data
        let total = 0
        for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
        return total / a.length
      },
      { url: files[filename], selector },
    )
    expect(difference).toBeLessThan(5)
    await testInfo.attach(`preview-export-${filename}`, {
      body: JSON.stringify({ meanAbsoluteChannelDifference: difference, allowed: 5 }),
      contentType: 'application/json',
    })
  }
  expect(requests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('export.png'), fullPage: true })
})

test('maximum-length names and blessings fit, overflow stays editable and blocks export', async ({
  page,
}) => {
  await go(page, '写祝福')
  const name = '愿你一直自由快乐幸福闪耀'.repeat(4).slice(0, 40)
  const wish = '愿你一直自由快乐幸福闪耀'.repeat(20).slice(0, 200)
  await page.getByLabel('TA 的名字').fill(name)
  await page.getByLabel('想对 TA 说的话').fill(wish)
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('W'.repeat(40))
  await page.getByLabel('想对 TA 说的话').fill('W'.repeat(200))
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill(name + '超')
  await page.getByLabel('想对 TA 说的话').fill(wish + '超')
  await expect(page.getByLabel('TA 的名字')).toHaveValue(name + '超')
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeDisabled()
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('星迹 🌟')
  await page.getByLabel('想对 TA 说的话').fill('一\n二\n三\n四\n五\n六')
  await expect(page.getByRole('alert')).toContainText('放不下')
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeDisabled()
})

test('draft restores uploaded bytes, content, birthday, colors, decorations and each crop', async ({
  page,
}) => {
  await go(page, '放照片')
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: '草稿照片.png',
    mimeType: 'image/png',
    buffer: await makeImage(page, 900, 1500),
  })
  await expect(page.locator('.photo-meta')).toContainText('草稿照片.png')
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('刷新后还在的心意')
  await page.getByLabel('想对 TA 说的话').fill('夏日有信，来日可期。\nHappy birthday 🌟')
  await go(page, '选配色')
  await page.getByLabel('自定义颜色', { exact: true }).fill('#9A5B70')
  await go(page, '微调')
  const posterZoom = await changeZoom(page)
  await page.getByRole('tab', { name: /应援头像/ }).click()
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await page.getByRole('switch', { name: /纪念细线/ }).uncheck()
  await saved(page)
  const before = (await getLocalDraft(page)).project
  await page.reload()
  await expect(page.getByRole('button', { name: '选好了，放入照片' })).toBeEnabled()
  await saved(page)
  expect((await getLocalDraft(page)).project).toEqual(before)
  await go(page, '放照片')
  await expect(page.locator('.photo-meta')).toContainText('草稿照片.png')
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('刷新后还在的心意')
  await expect(page.getByLabel('想对 TA 说的话')).toHaveValue(
    '夏日有信，来日可期。\nHappy birthday 🌟',
  )
  await go(page, '选配色')
  await expect(page.getByLabel('自定义颜色', { exact: true })).toHaveValue('#9A5B70')
  await go(page, '微调')
  await expect(page.getByRole('slider')).toHaveValue(posterZoom)
  await page.getByRole('tab', { name: /应援头像/ }).click()
  await expect(page.getByRole('slider')).toHaveValue('1.1')
  await expect(page.getByRole('switch', { name: /纪念细线/ })).not.toBeChecked()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('different photo aspect ratios, transparency, WebP and local large-image normalization', async ({
  page,
}) => {
  await go(page, '放照片')
  for (const [width, height, type, transparent] of [
    [1200, 1200, 'image/png', false],
    [1600, 400, 'image/jpeg', false],
    [400, 1600, 'image/png', false],
    [700, 1000, 'image/webp', false],
    [600, 800, 'image/png', true],
    [5000, 1000, 'image/jpeg', false],
  ] as const) {
    await page.getByLabel('上传照片', { exact: true }).setInputFiles({
      name: `${width}x${height}.${type.split('/')[1]}`,
      mimeType: type,
      buffer: await makeImage(page, width, height, type, transparent),
    })
    await expect(page.locator('.photo-meta')).toContainText(
      width === 5000 ? '4096 × 819' : `${width} × ${height}`,
    )
    await go(page, '导出')
    await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
    await go(page, '放照片')
  }
})

test('JPEG orientation is respected, unsupported formats and oversize files are explained', async ({
  page,
}) => {
  await go(page, '放照片')
  const jpeg = await makeImage(page, 600, 400, 'image/jpeg')
  // Add an EXIF Orientation=6 tag: a 600×400 source should display as 400×600.
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0)
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(6, 18)
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
  const marker = Buffer.alloc(4)
  marker.writeUInt16BE(0xffe1, 0)
  marker.writeUInt16BE(exif.length + 2, 2)
  const rotated = Buffer.concat([jpeg.subarray(0, 2), marker, exif, jpeg.subarray(2)])
  await page
    .getByLabel('上传照片', { exact: true })
    .setInputFiles({ name: '有方向信息.jpg', mimeType: 'image/jpeg', buffer: rotated })
  await expect(page.locator('.photo-meta')).toContainText('400 × 600')
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
  await go(page, '放照片')
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: '照片.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('unsupported'),
  })
  await expect(page.getByRole('alert')).toContainText('HEIC')
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: '过大的图片.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(30 * 1024 * 1024 + 1),
  })
  await expect(page.getByRole('alert')).toContainText('超过 30 MB')
  await expect(page.locator('.photo-meta')).toContainText('有方向信息.jpg')
})

test('bad upload keeps the current photo, and replacement can be undone and redone', async ({
  page,
}) => {
  await go(page, '放照片')
  await saved(page)
  const originalProject = (await getLocalDraft(page)).project
  const previous = await pixels(page)
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('this is not a photo'),
  })
  await expect(page.getByRole('alert')).toContainText('无法读取')
  expect(await imageDifference(page, previous)).toBeLessThan(0.05)
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: '替换.png',
    mimeType: 'image/png',
    buffer: await makeImage(page, 900, 900),
  })
  await expect.poll(() => imageDifference(page, previous)).toBeGreaterThan(0.1)
  const replacement = await pixels(page)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await saved(page)
  expect((await getLocalDraft(page)).project).toEqual(originalProject)
  await expect.poll(() => imageDifference(page, previous)).toBeLessThan(0.05)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect.poll(() => imageDifference(page, replacement)).toBeLessThan(0.05)
})

test('pointer movement works for mouse and actual emulated touch, with one-step undo', async ({
  page,
  context,
}, testInfo) => {
  await go(page, '微调')
  await changeZoom(page)
  await page.locator('.primary-artwork').scrollIntoViewIfNeeded()
  const before = await pixels(page)
  const bounds = await page.locator('.primary-artwork').boundingBox()
  const x = bounds!.x + bounds!.width * 0.5
  const y = bounds!.y + bounds!.height * 0.5
  if (testInfo.project.name === 'mobile') {
    const session = await context.newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 35, y: y + 20, id: 1 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 35, y + 20, { steps: 8 })
    await page.mouse.up()
  }
  await expect.poll(() => imageDifference(page, before)).toBeGreaterThan(0.1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect.poll(() => imageDifference(page, before)).toBeLessThan(0.05)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect.poll(() => imageDifference(page, before)).toBeGreaterThan(0.1)
})

test('storage failure leaves editing and export usable', async ({ page }) => {
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      if (args[1] === 'readwrite')
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return transaction.apply(this, args)
    }
  })
  await page.reload()
  await expect(page.locator('.workspace-status')).toContainText('保存失败')
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('仍能导出的心意')
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
})

test('corrupt draft is reported and not overwritten by the sample project', async ({ page }) => {
  await saved(page)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open('starloom-local', 1)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('drafts', 'readwrite')
          tx.objectStore('drafts').put({ schemaVersion: 999, marker: 'keep-original' }, 'current')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
  )
  await page.reload()
  await expect(page.locator('.workspace-status')).toContainText('草稿暂不可用')
  await expect(page.getByRole('button', { name: '选好了，放入照片' })).toBeEnabled()
  expect(await getLocalDraft(page)).toEqual({ schemaVersion: 999, marker: 'keep-original' })
})

test('no horizontal overflow at 360/390px; main controls and export remain reachable', async ({
  page,
}, testInfo) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const step of ['选主题', '放照片', '写祝福', '选配色', '微调', '导出']) {
      await go(page, step)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const action = page.locator('.panel-footer-buttons .primary-button')
      await action.scrollIntoViewIfNeeded()
      await expect(action).toBeVisible()
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await go(page, '写祝福')
    await page.getByLabel('想对 TA 说的话').fill('生日快乐，愿你成为想成为的自己。')
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${width}-editing.png`),
      fullPage: true,
    })
  }
})
