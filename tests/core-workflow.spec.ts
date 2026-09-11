import { test, expect } from './browser-fixtures'
import { readFile } from 'node:fs/promises'
import { current, exportCard, fixture, readWorks, ready, saved } from './card-helpers'

// Browser-neutral user flows. No Chromium import, CDP, or synthetic CDP touch events.
test.describe('@core', () => {
  test('clear entry points and actual examples load from the current site path', async ({
    page,
  }, info) => {
    const failed: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(response.url())
    })
    page.on('pageerror', (error) => failed.push(error.message))
    await page.goto('./')
    await expect(page.getByRole('button', { name: '制作生日应援', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '制作电子小卡', exact: true })).toBeEnabled()
    const images = page.locator('.creation-examples img')
    await expect(images).toHaveCount(4)
    await expect
      .poll(() =>
        images.evaluateAll((nodes) =>
          nodes.every((node) => (node as HTMLImageElement).naturalWidth === 480),
        ),
      )
      .toBe(true)
    const baseURL = info.project.use.baseURL!
    for (const src of await images.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).src),
    ))
      expect(src.startsWith(baseURL)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    const fonts = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
    )
    expect(fonts.some((font) => font.includes('Noto Sans SC'))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('empty-library.png'), fullPage: true })
    expect(failed).toEqual([])
  })

  test('birthday creation saves imported bytes, resumes last work and exports both PNGs', async ({
    page,
    browserName,
  }, info) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    const fonts: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.url().includes('.woff2') && response.ok()) fonts.push(response.url())
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.goto('./')
    await page.getByRole('button', { name: '制作生日应援', exact: true }).click()
    const go = (step: string) =>
      page
        .getByRole('navigation', { name: '制作步骤' })
        .getByRole('button', { name: new RegExp(step) })
        .click()
    await go('放照片')
    await page.getByLabel('上传照片', { exact: true }).setInputFiles('public/assets/portrait.jpg')
    await expect(page.locator('.photo-meta')).toContainText('portrait.jpg')
    await go('写祝福')
    await page.getByLabel('TA 的名字').fill('星光 · Summer')
    await page.getByLabel('生日月份').selectOption('2')
    await page.getByLabel('生日日期').selectOption('29')
    await page.getByLabel('想对 TA 说的话').fill('愿你自由，也被爱。\nHappy birthday!')
    await go('选配色')
    await page.getByLabel('自定义应援色', { exact: true }).fill('#98617c')
    await go('微调')
    await page.getByRole('button', { name: '放大照片', exact: true }).click()
    await page.getByRole('button', { name: '立即保存', exact: true }).click()
    await saved(page)
    const before = await current(page)
    await page.reload()
    await expect(page.getByRole('button', { name: '我的物料', exact: true })).toBeVisible()
    await saved(page)
    expect((await current(page)).project).toEqual(before.project)
    expect((await current(page)).asset).toEqual(before.asset)
    await go('导出')
    await page.getByRole('button', { name: '导出这份心意', exact: true }).click()
    for (const [label, format, width, height] of [
      ['头像', 'avatar', 1600, 1600],
      ['贺图', 'poster', 2400, 3000],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: `下载${label} PNG`, exact: true }).click(),
      ])
      const path = info.outputPath(`birthday-${format}.png`)
      await download.saveAs(path)
      const png = await readFile(path)
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height])
      expect(png.length).toBeGreaterThan(30_000)
      const difference = await page.evaluate(
        async ({ data, format }) => {
          const preview = document.querySelector<HTMLCanvasElement>(
            format === 'avatar' ? '.companion-art canvas' : '.primary-artwork canvas',
          )!
          const a = new Image(),
            b = new Image()
          a.src = preview.toDataURL()
          b.src = `data:image/png;base64,${data}`
          await Promise.all([a.decode(), b.decode()])
          const canvas = document.createElement('canvas')
          canvas.width = preview.width
          canvas.height = preview.height
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(a, 0, 0)
          const x = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(b, 0, 0, canvas.width, canvas.height)
          const y = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let sum = 0
          for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i])
          return sum / x.length
        },
        { data: png.toString('base64'), format },
      )
      expect(difference).toBeLessThan(5)
      await info.attach(`birthday-${format}-difference`, {
        body: JSON.stringify({ browserName, difference }),
        contentType: 'application/json',
      })
    }
    expect(fonts.length).toBeGreaterThan(0)
    for (const url of fonts) expect(url.startsWith(info.project.use.baseURL!)).toBe(true)
    const loadedFonts = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
    )
    for (const family of ['Noto Sans SC', 'Cormorant Garamond']) {
      expect(loadedFonts.some((loaded) => loaded.includes(family))).toBe(true)
    }
    expect(errors).toEqual([])
  })

  test('two-photo card creates, crops independently, saves both layouts and exports', async ({
    page,
    browserName,
  }, info) => {
    test.setTimeout(90_000)
    await page.goto('./')
    await page.getByRole('button', { name: '制作电子小卡', exact: true }).click()
    await ready(page)
    await page.getByLabel('上传照片 1', { exact: true }).setInputFiles('public/assets/portrait.jpg')
    await ready(page)
    await saved(page)
    const first = await current(page)
    await page
      .getByLabel('上传照片 2', { exact: true })
      .setInputFiles(await fixture(page, '#5779a1', 800, 1200))
    await ready(page)
    await saved(page)
    expect((await current(page)).asset).toEqual(first.asset)
    await page.getByRole('button', { name: /^照片 1/ }).click()
    await page.getByRole('button', { name: '放大照片', exact: true }).click()
    await saved(page)
    const strip = (await current(page)).project.card.cropsByLayout['photo-strip']
    await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
    await page.getByRole('button', { name: /^照片 2/ }).click()
    await page.getByRole('button', { name: '放大照片', exact: true }).click()
    await page.getByLabel('姓名', { exact: true }).fill('两帧日常')
    await page.getByLabel('短句', { exact: true }).fill('把喜欢慢慢收藏。\nEvery little moment.')
    await page.getByRole('button', { name: '立即保存', exact: true }).click()
    await saved(page)
    // Seed an old record only after all writes for this revision have settled.
    // A fixture must not race the app's asynchronous thumbnail transaction.
    await expect
      .poll(async () => {
        const work = await current(page)
        return work.thumbnail && work.thumbnailRevision === work.revision
      })
      .toBe(true)
    const before = await current(page)
    expect(before.asset.blob).not.toBe(before.secondAsset.blob)
    expect(before.project.card.cropsByLayout['photo-strip']).toEqual(strip)
    // 0.3 stored uploaded File objects directly. Exercise those existing records,
    // including subsequent saves that can replace WebKit's backing disk files.
    await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('starloom-local')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const work = await new Promise<any>((resolve, reject) => {
          const tx = db.transaction('works', 'readonly')
          const read = tx.objectStore('works').get(id)
          tx.oncomplete = () => resolve(read.result)
          tx.onabort = () => reject(tx.error)
        })
        // Model original uploaded Files with independent bytes. Wrapping an
        // IDB-backed Blob directly can keep a reference to the file replaced
        // by the next put, producing an already-corrupt synthetic fixture.
        await Promise.all(
          [work.asset, work.secondAsset].map(async (asset) => {
            asset.blob = new File([await asset.blob.arrayBuffer()], asset.name, {
              type: asset.blob.type,
            })
          }),
        )
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('works', 'readwrite')
          tx.objectStore('works').put(work)
          tx.oncomplete = () => resolve()
          tx.onabort = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
    }, before.id)
    const seeded = await current(page)
    expect(seeded.asset).toEqual(before.asset)
    expect(seeded.secondAsset).toEqual(before.secondAsset)
    await page.reload()
    await ready(page)
    await saved(page)
    const after = await current(page)
    expect(after.project).toEqual(before.project)
    expect(after.asset).toEqual(before.asset)
    expect(after.secondAsset).toEqual(before.secondAsset)
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '选择上下照片条布局' }).click()
    await exportCard(page, info, 'photo-strip')
    await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
    await page.getByLabel('日期（可选）').fill('2026-09-11')
    await page.getByLabel('短句', { exact: true }).click()
    await exportCard(page, info, 'portrait-collage-dated')
    await page.getByRole('button', { name: '我的物料', exact: true }).click()
    await expect(page.getByAltText('新的电子小卡的小卡缩略图')).toBeVisible()
    expect((await readWorks(page)).works).toHaveLength(1)
    await info.attach('engine', {
      body: JSON.stringify({
        browserName,
        version: page.context().browser()!.version(),
        baseURL: info.project.use.baseURL,
      }),
      contentType: 'application/json',
    })
  })
})
