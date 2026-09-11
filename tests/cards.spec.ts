import { test, expect } from '@playwright/test'
import { current, exportCard, fixture, readWorks, ready, saved, startCard } from './card-helpers'

test('both card layouts export real PNGs matching visible previews with optional dates', async ({
  page,
}, info) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  await startCard(page)
  await page.getByLabel('姓名', { exact: true }).fill('林予安')
  await page
    .getByLabel('短句', { exact: true })
    .fill('把喜欢的日常，慢慢收藏。\nEvery little moment with you.')
  for (const [name, id] of [
    ['上下照片条', 'photo-strip'],
    ['写真拼贴', 'portrait-collage'],
  ]) {
    await page.getByRole('button', { name: `选择${name}布局` }).click()
    await ready(page)
    await page.screenshot({ path: info.outputPath(`${id}-editor.png`), fullPage: true })
    await exportCard(page, info, id)
    await page.getByLabel('日期（可选）').fill('2026-09-11')
    await page.getByLabel('短句', { exact: true }).click()
    await exportCard(page, info, `${id}-dated`)
    await page.getByRole('button', { name: '不显示日期', exact: true }).click()
  }
  expect(errors).toEqual([])
  expect(
    requests.filter(
      (url) =>
        /^https?:/.test(url) && new URL(url).origin !== new URL(info.project.use.baseURL!).origin,
    ),
  ).toEqual([])
})

test('photos replace independently, remember each layout, undo redo and restore after reload', async ({
  page,
}) => {
  await startCard(page)
  await page
    .getByLabel('上传照片 1', { exact: true })
    .setInputFiles(await fixture(page, '#d65b45', 1600, 800))
  await ready(page)
  await saved(page)
  const first = await current(page)
  await page
    .getByLabel('上传照片 2', { exact: true })
    .setInputFiles(await fixture(page, '#446eaa', 800, 1600))
  await ready(page)
  await saved(page)
  const both = await current(page)
  expect(both.asset).toEqual(first.asset)
  expect(both.secondAsset.blob).not.toBe(both.asset.blob)
  await page.getByRole('button', { name: '照片 1', exact: false }).first().click()
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
  await page.getByRole('button', { name: /^照片 2/ }).click()
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await saved(page)
  const remembered = await current(page)
  await page.getByRole('button', { name: '选择上下照片条布局' }).click()
  await page.getByRole('button', { name: /^照片 1/ }).click()
  await expect(page.getByRole('slider')).toHaveValue('1.1')
  await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
  for (const slot of [1, 2]) {
    await saved(page)
    const before = await current(page)
    await page
      .getByLabel(`上传照片 ${slot}`, { exact: true })
      .setInputFiles(await fixture(page, '#9174a2', 900 + slot, 900))
    await ready(page)
    await saved(page)
    const replaced = await current(page)
    expect(replaced[slot === 1 ? 'secondAsset' : 'asset']).toEqual(
      before[slot === 1 ? 'secondAsset' : 'asset'],
    )
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await ready(page)
    await saved(page)
    expect((await current(page)).project).toEqual(before.project)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await ready(page)
    await saved(page)
    expect((await current(page)).project).toEqual(replaced.project)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await ready(page)
    await saved(page)
  }
  const beforeReload = await current(page)
  expect(beforeReload.project).toEqual(remembered.project)
  await page.reload()
  await ready(page)
  await saved(page)
  expect((await current(page)).project).toEqual(beforeReload.project)
  expect((await current(page)).secondAsset).toEqual(beforeReload.secondAsset)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('card copy rename thumbnail and deletion coexist with original birthday works', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建物料', exact: true }).click()
  await saved(page)
  const birthday = await current(page)
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await page.getByRole('button', { name: '新建电子小卡', exact: true }).click()
  await ready(page)
  await page.getByLabel('姓名', { exact: true }).fill('收藏日常')
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await expect(page.getByAltText('新的电子小卡的小卡缩略图')).toBeVisible()
  const original = page.getByRole('article', { name: '作品：新的电子小卡', exact: true })
  await original.locator('summary').click()
  await original.getByRole('button', { name: '复制', exact: true }).click()
  await ready(page)
  await page.getByLabel('姓名', { exact: true }).fill('副本名字')
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  const copy = page.getByRole('article', { name: '作品：新的电子小卡（副本）', exact: true })
  await copy.locator('summary').click()
  await copy.getByRole('button', { name: '重命名', exact: true }).click()
  await page.getByLabel('作品名称', { exact: true }).fill('旅行纪念')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  const renamed = page.getByRole('article', { name: '作品：旅行纪念', exact: true })
  if (!(await renamed.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
    await renamed.locator('summary').click()
  await renamed.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(renamed).toHaveCount(0)
  const data = await readWorks(page)
  expect(data.works).toHaveLength(2)
  expect(data.works.find((item) => item.id === birthday.id).project).toEqual(birthday.project)
  expect(data.works.find((item) => item.project.version === 3).project.name).toBe('收藏日常')
})

test('long copy and bad photos stay editable; controls remain reachable at 360px', async ({
  page,
}, info) => {
  await startCard(page)
  await page.setViewportSize({ width: 360, height: 844 })
  await page
    .getByLabel('上传照片 2', { exact: true })
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') })
  await expect(page.getByRole('alert')).toContainText('无法读取')
  await expect(page.getByRole('button', { name: '导出电子小卡 PNG' })).toBeEnabled()
  await page.getByLabel('姓名', { exact: true }).fill('星'.repeat(40))
  await page.getByLabel('短句', { exact: true }).fill('喜欢每一个日常'.repeat(20).slice(0, 80))
  for (const layout of ['上下照片条', '写真拼贴']) {
    await page.getByRole('button', { name: `选择${layout}布局` }).click()
    await ready(page)
  }
  await exportCard(page, info, 'long-copy')
  await page.getByLabel('短句', { exact: true }).fill('星'.repeat(81))
  await expect(page.getByRole('button', { name: '导出电子小卡 PNG' })).toBeDisabled()
  await expect(page.getByLabel('短句', { exact: true })).toHaveValue('星'.repeat(81))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('storage failure explains unsaved changes, permits export and retries without losing either photo', async ({
  page,
}, info) => {
  await startCard(page)
  await saved(page)
  const before = await current(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    ;(window as any).__restorePut = () => {
      IDBObjectStore.prototype.put = put
    }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'works') throw new DOMException('test quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.getByLabel('短句', { exact: true }).fill('保存失败也能先导出')
  await expect(page.locator('.workspace-status')).toContainText('保存失败')
  await expect(page.locator('.save-detail')).toContainText('空间不足')
  expect((await current(page)).project).toEqual(before.project)
  await exportCard(page, info, 'unsaved-export')
  await page.evaluate(() => (window as any).__restorePut())
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await saved(page)
  expect((await current(page)).project.wish).toBe('保存失败也能先导出')
  expect((await current(page)).secondAsset).toEqual(before.secondAsset)
  await page.locator('.storage-details summary').click()
  await expect(page.locator('.storage-details')).toContainText('同一浏览器、同一资料')
  await expect(page.locator('.storage-details')).toContainText('无痕窗口结束')
})

test('persistent storage messaging follows the actual browser response', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => false
    navigator.storage.persist = async () => false
  })
  await startCard(page)
  await page.locator('.storage-details summary').click()
  await page.getByRole('button', { name: '申请持久存储', exact: true }).click()
  await expect(page.locator('.persistence-control')).toContainText('未允许持久存储')
  await page.evaluate(() => {
    navigator.storage.persist = async () => true
  })
  await page.getByRole('button', { name: '申请持久存储', exact: true }).click()
  await expect(page.locator('.persistence-control')).toContainText('已允许持久存储')
  await expect(page.locator('.persistence-control')).toContainText('主动清理仍会删除作品')
})
