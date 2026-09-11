import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const themes = [
  ['生日来信', 'birthday-letter'],
  ['心动拍立得', 'heart-polaroid'],
  ['此刻主场', 'center-stage'],
] as const
const go = (page: Page, step: string) =>
  page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: new RegExp(step) })
    .click()
async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await ready(page)
}
async function ready(page: Page) {
  await page.waitForFunction(
    () =>
      !!document.querySelector('.primary-artwork canvas') &&
      !document.querySelector('.artwork-loading'),
  )
}
async function library(page: Page) {
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await expect(page.locator('h1')).toContainText('我的物料')
}
async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const open = indexedDB.open('starloom-local')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['works', 'meta', 'drafts'])
          const works = tx.objectStore('works').getAll()
          const active = tx.objectStore('meta').get('activeWorkId')
          const legacy = tx.objectStore('drafts').get('current')
          const marker = tx.objectStore('meta').get('migration-v1')
          tx.oncomplete = () => {
            db.close()
            resolve({
              works: works.result.map((w) => ({
                ...w,
                asset: { ...w.asset, size: w.asset?.blob?.size },
                thumbnail: !!w.thumbnail,
              })),
              active: active.result,
              legacy: legacy.result,
              marker: marker.result,
            })
          }
          tx.onabort = () => {
            db.close()
            reject(tx.error)
          }
        }
        open.onerror = () => reject(open.error)
      }),
  )
}
async function menu(page: Page, title: string, action: string) {
  const card = page.getByRole('article', { name: `作品：${title}`, exact: true })
  if (!(await card.locator('details').getAttribute('open'))) {
    // Boolean open attributes may be empty strings; use the DOM property instead.
    if (!(await card.locator('details').evaluate((el) => (el as HTMLDetailsElement).open)))
      await card.locator('summary').click()
  }
  await card.getByRole('button', { name: action, exact: true }).click()
}
async function rename(page: Page, from: string, to: string) {
  await menu(page, from, '重命名')
  await page.getByLabel('作品名称', { exact: true }).fill(to)
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('article', { name: `作品：${to}`, exact: true })).toBeVisible()
}
async function openWork(page: Page, title: string) {
  await page.getByRole('button', { name: `继续编辑${title}`, exact: true }).click()
  await ready(page)
}

test('three themes export real paired PNGs with matching visible previews', async ({
  page,
}, info) => {
  test.setTimeout(100_000)
  await start(page)
  for (const [name, id] of themes) {
    await go(page, '选主题')
    await page.getByRole('button', { name: `选择${name}主题` }).click()
    await ready(page)
    await go(page, '导出')
    await page.getByRole('button', { name: '导出这份心意' }).click()
    for (const [label, format] of [
      ['头像', 'avatar'],
      ['贺图', 'poster'],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: `下载${label} PNG` }).click(),
      ])
      const path = info.outputPath(`${id}-${format}.png`)
      await download.saveAs(path)
      const buffer = await readFile(path)
      expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(buffer.readUInt32BE(16)).toBe(format === 'avatar' ? 1600 : 2400)
      expect(buffer.readUInt32BE(20)).toBe(format === 'avatar' ? 1600 : 3000)
      const comparison = await page.evaluate(
        async ({ data, format }) => {
          const preview = document.querySelector<HTMLCanvasElement>(
            format === 'poster' ? '.primary-artwork canvas' : '.companion-art canvas',
          )!
          const actual = new Image()
          actual.src = preview.toDataURL()
          const exported = new Image()
          exported.src = `data:image/png;base64,${data}`
          await Promise.all([actual.decode(), exported.decode()])
          const scratch = document.createElement('canvas')
          scratch.width = preview.width
          scratch.height = preview.height
          const ctx = scratch.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(actual, 0, 0)
          const a = ctx.getImageData(0, 0, scratch.width, scratch.height).data
          ctx.clearRect(0, 0, scratch.width, scratch.height)
          ctx.drawImage(exported, 0, 0, scratch.width, scratch.height)
          const b = ctx.getImageData(0, 0, scratch.width, scratch.height).data
          let sum = 0
          for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
          return sum / a.length
        },
        { data: buffer.toString('base64'), format },
      )
      await info.attach(`${id}-${format}-difference`, {
        body: JSON.stringify({ meanChannelDifference: comparison }),
        contentType: 'application/json',
      })
      expect(comparison).toBeLessThan(5)
    }
    await page.getByRole('button', { name: '关闭弹窗' }).click()
  }
})

test('theme switches keep content, have independent crop memories, undo, and restore after refresh', async ({
  page,
}) => {
  await start(page)
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('记住每一个不同的构图')
  await go(page, '微调')
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择心动拍立得主题' }).click()
  await go(page, '微调')
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await page.getByRole('tab', { name: /应援头像/ }).click()
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择此刻主场主题' }).click()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择心动拍立得主题' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.getByRole('button', { name: '选择生日来信主题' }).click()
  await go(page, '微调')
  await page.getByRole('tab', { name: /生日贺图/ }).click()
  await expect(page.getByRole('slider', { name: '照片缩放' })).toHaveValue('1.1')
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择心动拍立得主题' }).click()
  await go(page, '微调')
  await expect(page.getByRole('slider', { name: '照片缩放' })).toHaveValue('1.2')
  await expect(page.locator('.workspace-status')).toContainText('已保存到本机')
  const before = (await records(page)).works[0].project
  await page.reload()
  await ready(page)
  expect((await records(page)).works[0].project).toEqual(before)
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('记住每一个不同的构图')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('all themes fit long Chinese and continuous English with light, dark and saturated colors', async ({
  page,
}, info) => {
  test.setTimeout(100_000)
  await start(page)
  for (const [name, id] of themes) {
    await go(page, '选主题')
    await page.getByRole('button', { name: `选择${name}主题` }).click()
    for (const color of ['#FFFFFF', '#000000', '#FFFF00']) {
      await go(page, '写祝福')
      await page.getByLabel('TA 的名字').fill('星'.repeat(40))
      await page
        .getByLabel('想对 TA 说的话')
        .fill('愿每一份喜欢都成为闪闪发光的作品'.repeat(20).slice(0, 200))
      await go(page, '选配色')
      await page.getByLabel('自定义颜色', { exact: true }).fill(color)
      await go(page, '导出')
      await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
    }
    await page.getByRole('button', { name: '导出这份心意' }).click()
    for (const [label, format] of [
      ['头像', 'avatar'],
      ['贺图', 'poster'],
    ]) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: `下载${label} PNG` }).click(),
      ])
      await download.saveAs(info.outputPath(`long-${id}-${format}.png`))
    }
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await go(page, '写祝福')
    await page.getByLabel('TA 的名字').fill('W'.repeat(40))
    await page.getByLabel('想对 TA 说的话').fill('W'.repeat(200))
    await go(page, '导出')
    await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
  }
})

test('new, copy, rename, independent edits, delete confirmation and last-work deletion', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await start(page)
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('原作的姓名')
  await library(page)
  await rename(page, '新的生日应援', '原作')
  await menu(page, '原作', '复制')
  await ready(page)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('副本独立的姓名')
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择此刻主场主题' }).click()
  await library(page)
  await rename(page, '原作（副本）', '副本')
  await openWork(page, '原作')
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('原作的姓名')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await ready(page)
  await library(page)
  expect((await records(page)).works).toHaveLength(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const summary of await page.locator('.work-menu summary').all()) {
    const box = await summary.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: info.outputPath('three-works-library.png'), fullPage: true })
  await menu(page, '新的生日应援', '删除')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect((await records(page)).works).toHaveLength(3)
  await menu(page, '新的生日应援', '删除')
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('h1')).toContainText('我的物料')
  expect((await records(page)).works).toHaveLength(2)
  for (const title of ['原作', '副本']) {
    await menu(page, title, '删除')
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: '第一份心意，从这里开始' })).toBeVisible()
  expect((await records(page)).works).toEqual([])
})

test('a pending save is flushed before switching and never written into another work', async ({
  page,
}) => {
  await start(page)
  await library(page)
  await rename(page, '新的生日应援', '甲')
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await ready(page)
  await library(page)
  await rename(page, '新的生日应援', '乙')
  await openWork(page, '甲')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open('starloom-local')
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('works', 'readwrite')
          let released = false
          ;(window as any).releaseSaveLock = () => {
            released = true
          }
          const keepAlive = () => {
            const read = tx.objectStore('works').get('lock-only')
            read.onsuccess = () => {
              if (!released) keepAlive()
            }
          }
          keepAlive()
          tx.oncomplete = () => db.close()
          resolve()
        }
      }),
  )
  await go(page, '写祝福')
  await page.getByLabel('TA 的名字').fill('离开前最后的修改')
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await expect(page.locator('.workspace-status')).toContainText('正在保存')
  await expect(page.getByLabel('TA 的名字')).toBeVisible()
  await page.evaluate(() => (window as any).releaseSaveLock())
  await expect(page.locator('h1')).toContainText('我的物料')
  await openWork(page, '乙')
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('林予安')
  await library(page)
  await openWork(page, '甲')
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('离开前最后的修改')
})

test('a late uploaded photo cannot leak into the next editing session', async ({ page }) => {
  await start(page)
  await library(page)
  await rename(page, '新的生日应援', '甲')
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await ready(page)
  await library(page)
  await rename(page, '新的生日应援', '乙')
  await openWork(page, '甲')
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 100
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 320, 100)
    return canvas.toDataURL().split(',')[1]
  })
  await page.evaluate(() => {
    const original = window.createImageBitmap
    window.createImageBitmap = (async (...args: any[]) => {
      if (args[0] instanceof Blob && args[0].type === 'image/png') {
        ;(window as any).photoWaiting = true
        await new Promise<void>((resolve) => {
          ;(window as any).releasePhoto = resolve
        })
      }
      return (original as any)(...args)
    }) as typeof createImageBitmap
  })
  await go(page, '放照片')
  await page.getByLabel('上传照片', { exact: true }).setInputFiles({
    name: '迟到的照片.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes, 'base64'),
  })
  await page.waitForFunction(() => (window as any).photoWaiting)
  await library(page)
  await openWork(page, '乙')
  await page.evaluate(() => (window as any).releasePhoto())
  await go(page, '放照片')
  await expect(page.locator('.photo-meta')).not.toContainText('迟到的照片')
  await library(page)
  await openWork(page, '甲')
  await go(page, '放照片')
  await expect(page.locator('.photo-meta')).not.toContainText('迟到的照片')
})

test('new themes handle wide, tall and transparent photos on touch and desktop layouts', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await start(page)
  for (const [width, height, transparent] of [
    [1600, 400, false],
    [400, 1600, false],
    [800, 800, true],
  ] as const) {
    const data = await page.evaluate(
      ({ width, height, transparent }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#A48CC4'
        ctx.fillRect(transparent ? width / 4 : 0, 0, transparent ? width / 2 : width, height)
        ctx.fillStyle = '#F8E6B7'
        ctx.fillRect(width * 0.4, height * 0.2, width * 0.2, height * 0.6)
        return canvas.toDataURL().split(',')[1]
      },
      { width, height, transparent },
    )
    await go(page, '放照片')
    await page.getByLabel('上传照片', { exact: true }).setInputFiles({
      name: `${width}x${height}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    })
    await expect(page.locator('.photo-meta')).toContainText(`${width}x${height}.png`)
    for (const [name] of themes) {
      await go(page, '选主题')
      await page.getByRole('button', { name: `选择${name}主题` }).click()
      await go(page, '微调')
      await page.getByRole('button', { name: '放大照片', exact: true }).click()
      await go(page, '导出')
      await expect(page.getByRole('button', { name: '导出这份心意' })).toBeEnabled()
    }
  }
})

async function seedLegacy(page: Page, corrupt = false) {
  await page.goto('/licenses/Starloom-MIT.txt')
  return page.evaluate(async (corrupt) => {
    const blob = await (await fetch('/assets/portrait.jpg')).blob()
    const bitmap = await createImageBitmap(blob)
    const draft = corrupt
      ? { schemaVersion: 999, marker: 'keep-original' }
      : {
          schemaVersion: 1,
          savedAt: 1700000000000,
          project: {
            version: 1,
            templateId: 'birthday-letter',
            photoId: 'legacy-upload',
            name: '旧草稿的心意',
            month: 2,
            day: 29,
            wish: '原来的每一份喜欢，都要好好留下。',
            color: '#B97B87',
            decorations: { sparkles: false, lines: true },
            crops: { avatar: { x: 0.3, y: 0.6, zoom: 2 }, poster: { x: 0.6, y: 0.4, zoom: 1.5 } },
          },
          asset: {
            id: 'legacy-upload',
            blob,
            name: '旧照片.jpg',
            width: bitmap.width,
            height: bitmap.height,
            originalWidth: bitmap.width,
            originalHeight: bitmap.height,
            sample: false,
          },
        }
    bitmap.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('starloom-local', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('drafts')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('drafts', 'readwrite')
        tx.objectStore('drafts').put(draft, 'current')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      }
    })
    return { size: blob.size, project: 'project' in draft ? draft.project : null }
  }, corrupt)
}

test('v1 draft migrates once, preserves original bytes and every field, and survives refresh', async ({
  page,
}) => {
  const legacy = await seedLegacy(page)
  await page.goto('/')
  await ready(page)
  const first = await records(page)
  expect(first.works).toHaveLength(1)
  expect(first.works[0].asset.size).toBe(legacy.size)
  expect(first.works[0].project.cropsByTemplate['birthday-letter']).toEqual(legacy.project!.crops)
  expect(first.legacy.project).toEqual(legacy.project)
  expect(first.works[0].updatedAt).toBe(1700000000000)
  expect(
    await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const request = indexedDB.open('starloom-local')
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction(['drafts', 'works'])
            const old = tx.objectStore('drafts').get('current')
            const next = tx.objectStore('works').get('legacy-current-v1')
            tx.oncomplete = async () => {
              db.close()
              const [a, b] = await Promise.all([
                old.result.asset.blob.arrayBuffer(),
                next.result.asset.blob.arrayBuffer(),
              ])
              const first = new Uint8Array(a)
              const second = new Uint8Array(b)
              resolve(
                first.length === second.length && first.every((byte, i) => byte === second[i]),
              )
            }
          }
        }),
    ),
  ).toBe(true)
  await go(page, '写祝福')
  await expect(page.getByLabel('TA 的名字')).toHaveValue('旧草稿的心意')
  await page.reload()
  await ready(page)
  expect((await records(page)).works).toHaveLength(1)
})

test('migration transaction failure preserves legacy data and can be retried without duplicates', async ({
  page,
}) => {
  await seedLegacy(page)
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add
    ;(window as any).restoreAdd = () => {
      IDBObjectStore.prototype.add = original
    }
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof original>) {
      const request = original.apply(this, args)
      if (this.name === 'works') request.addEventListener('success', () => this.transaction.abort())
      return request
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible()
  const failed = await records(page)
  expect(failed.works).toHaveLength(0)
  expect(failed.marker).toBeUndefined()
  expect(failed.legacy.project.name).toBe('旧草稿的心意')
  await page.evaluate(() => (window as any).restoreAdd())
  await page.getByRole('button', { name: '重试读取与迁移' }).click()
  await ready(page)
  expect((await records(page)).works).toHaveLength(1)
})

test('corrupt v1 data stays untouched when a new independent work is created', async ({ page }) => {
  await seedLegacy(page, true)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('原数据已保留')
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await ready(page)
  const state = await records(page)
  expect(state.legacy).toEqual({ schemaVersion: 999, marker: 'keep-original' })
  expect(state.works).toHaveLength(1)
  expect(state.marker).toBeUndefined()
})

test('database upgrade blocked by another tab can recover without deleting the old draft', async ({
  page,
  context,
}) => {
  await seedLegacy(page)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open('starloom-local', 1)
        request.onsuccess = () => {
          ;(window as any).releaseOldDatabase = () => request.result.close()
          resolve()
        }
      }),
  )
  const next = await context.newPage()
  await next.goto('/')
  await expect(next.getByRole('alert')).toContainText('关闭其他星迹页面')
  await page.evaluate(() => (window as any).releaseOldDatabase())
  await next.getByRole('button', { name: '重试读取与迁移' }).click()
  await ready(next)
  expect((await records(next)).legacy.project.name).toBe('旧草稿的心意')
  await next.close()
})
