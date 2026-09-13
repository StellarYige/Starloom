import { test, expect } from './browser-fixtures'
import type { Page, TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { current, exportCard, fixture, readWorks, ready, saved, startCard } from './card-helpers'

const go = (page: Page, step: string) =>
  page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: new RegExp(step) })
    .click()
async function downloadProject(page: Page, info: TestInfo) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出工程', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.starloom$/)
  const path = info.outputPath('editable.starloom')
  await download.saveAs(path)
  return { path, value: JSON.parse(await readFile(path, 'utf8')) }
}
function withoutPhotoIds(project: any) {
  const copy = structuredClone(project)
  delete copy.photoId
  if (copy.card) delete copy.card.secondPhotoId
  return copy
}

test('card project restores both photos, layouts and editable decoration copy, preserving actual PNG output', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await startCard(page)
  await page.getByLabel('上传照片 1', { exact: true }).setInputFiles(await fixture(page, '#853542'))
  await ready(page)
  await page
    .getByLabel('上传照片 2', { exact: true })
    .setInputFiles(await fixture(page, '#254a72', 900, 1400))
  await ready(page)
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await page.getByText('模板装饰文案', { exact: true }).click()
  await page.getByLabel('小卡文案 1', { exact: true }).fill('OUR STORY')
  await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
  await page.getByRole('button', { name: /^照片 2/ }).click()
  await page.getByRole('button', { name: '放大照片', exact: true }).click()
  await page.getByLabel('小卡文案 1', { exact: true }).fill('our memories')
  await page.getByLabel('显示小卡文案 2', { exact: true }).uncheck()
  await page.getByLabel('姓名', { exact: true }).fill('两帧收藏')
  await page.getByLabel('日期（可选）').fill('2026-09-13')
  await page.getByLabel('自定义应援色', { exact: true }).fill('#935b76')
  // Export right after typing: the file must include the current editor snapshot.
  await page.getByLabel('短句', { exact: true }).fill('未等待自动保存的最后一句')
  const { path, value } = await downloadProject(page, info)
  expect(value.project.wish).toBe('未等待自动保存的最后一句')
  const beforePng = await exportCard(page, info, 'before-import')
  await saved(page)
  const original = await current(page)
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await page.getByLabel('导入工程文件', { exact: true }).setInputFiles(path)
  await ready(page)
  const imported = await current(page)
  expect(imported.id).not.toBe(original.id)
  expect(imported.asset.id).not.toBe(original.asset.id)
  expect(imported.secondAsset.id).not.toBe(original.secondAsset.id)
  expect(withoutPhotoIds(imported.project)).toEqual(withoutPhotoIds(original.project))
  expect(imported.asset.blob).toBe(original.asset.blob)
  expect(imported.secondAsset.blob).toBe(original.secondAsset.blob)
  expect((await readWorks(page)).works).toHaveLength(2)
  await page.reload()
  await ready(page)
  expect((await current(page)).project).toEqual(imported.project)
  const afterPng = await exportCard(page, info, 'after-import')
  expect(afterPng.equals(beforePng)).toBe(true)
  await page.getByText('模板装饰文案', { exact: true }).click()
  await expect(page.getByLabel('小卡文案 1', { exact: true })).toHaveValue('our memories')
  await expect(page.getByLabel('显示小卡文案 2', { exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: '选择上下照片条布局' }).click()
  await expect(page.getByLabel('小卡文案 1', { exact: true })).toHaveValue('OUR STORY')
  await page.getByLabel('姓名', { exact: true }).fill('导入后独立修改')
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  const source = (await readWorks(page)).works.find((work) => work.id === original.id)
  expect(source!.project).toEqual(original.project)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('imported-library.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('birthday decorations support edit, hide, undo, defaults and project recovery across themes', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await page.goto('./')
  await page.getByRole('button', { name: '制作生日应援', exact: true }).click()
  await saved(page)
  await go(page, '写祝福')
  await page.getByText('模板装饰文案', { exact: true }).click()
  const field = page.getByLabel('贺图文案 1', { exact: true })
  await expect(field).toHaveValue('A LITTLE LOVE, JUST FOR YOU')
  await field.fill('FOR OUR DAY')
  await field.blur()
  await page.getByLabel('显示贺图文案 1', { exact: true }).uncheck()
  await expect(field).toBeDisabled()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(field).toBeEnabled()
  await expect(field).toHaveValue('FOR OUR DAY')
  await page.getByRole('button', { name: '恢复贺图文案 1默认', exact: true }).click()
  await expect(field).toHaveValue('A LITTLE LOVE, JUST FOR YOU')
  await field.fill('FOR OUR DAY')
  // Release the text field before scrolling to a distant control in mobile WebKit.
  await field.blur()
  await page.getByLabel('显示头像文案 1', { exact: true }).uncheck()
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择心动拍立得主题' }).click()
  await go(page, '写祝福')
  await page.getByText('模板装饰文案', { exact: true }).click()
  await page.getByLabel('头像文案 1', { exact: true }).fill('our day')
  await page.getByLabel('TA 的名字').fill('纪念日')
  const { path } = await downloadProject(page, info)
  await saved(page)
  const original = await current(page)
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await page.getByLabel('导入工程文件', { exact: true }).setInputFiles(path)
  await saved(page)
  const imported = await current(page)
  expect(imported.id).not.toBe(original.id)
  expect(withoutPhotoIds(imported.project)).toEqual(withoutPhotoIds(original.project))
  expect(imported.asset.blob).toBe(original.asset.blob)
  await go(page, '选主题')
  await page.getByRole('button', { name: '选择生日来信主题' }).click()
  await go(page, '写祝福')
  await page.getByText('模板装饰文案', { exact: true }).click()
  await expect(field).toHaveValue('FOR OUR DAY')
  await expect(page.getByLabel('显示头像文案 1', { exact: true })).not.toBeChecked()
  await field.fill('W'.repeat(81))
  await go(page, '导出')
  await expect(page.getByRole('button', { name: '导出这份心意', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '导出工程', exact: true })).toBeEnabled()
  await go(page, '写祝福')
  await page.getByText('模板装饰文案', { exact: true }).click()
  await page.getByLabel('显示贺图文案 1', { exact: true }).uncheck()
  await page.screenshot({ path: info.outputPath('decoration-settings.png'), fullPage: true })
  await go(page, '导出')
  await page.getByRole('button', { name: '导出这份心意', exact: true }).click()
  for (const [name, width, height] of [
    ['头像', 1600, 1600],
    ['贺图', 2400, 3000],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: `下载${name} PNG`, exact: true }).click(),
    ])
    const output = info.outputPath(`decorated-${width}.png`)
    await download.saveAs(output)
    const png = await readFile(output)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height])
  }
})

test('damaged and incompatible imports leave existing works intact and the same file can be retried', async ({
  page,
}, info) => {
  await startCard(page)
  const { path, value } = await downloadProject(page, info)
  const original = await current(page)
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  const undecodable = structuredClone(value)
  const bytes = Buffer.from('This is not a PNG')
  Object.assign(undecodable.assets[0], {
    data: bytes.toString('base64'),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  for (const [data, message] of [
    ['{broken', '损坏'],
    [JSON.stringify({ ...value, version: 99 }), '版本不兼容'],
    [JSON.stringify(undecodable), '图片无法读取'],
  ]) {
    await page.getByLabel('导入工程文件', { exact: true }).setInputFiles({
      name: 'backup.starloom',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    })
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('button', { name: '导入工程', exact: true })).toBeEnabled()
    const state = await readWorks(page)
    expect(state.works).toHaveLength(1)
    expect(state.active).toBe(original.id)
    expect(state.works[0].project).toEqual(original.project)
  }
  await page.getByLabel('导入工程文件', { exact: true }).setInputFiles(path)
  await ready(page)
  expect((await readWorks(page)).works).toHaveLength(2)
})

for (const kind of ['生日应援', '电子小卡']) {
  test(`${kind} autosave and thumbnail updates do not scan the work list while editing`, async ({
    page,
  }) => {
    await page.goto('./')
    await page.getByRole('button', { name: `制作${kind}`, exact: true }).click()
    await saved(page)
    if (kind === '生日应援') await go(page, '写祝福')
    else await ready(page)
    await page.evaluate(() => {
      ;(window as any).workListScans = 0
      const original = IDBIndex.prototype.openCursor
      IDBIndex.prototype.openCursor = function (...args) {
        if (this.objectStore.name === 'works' && this.name === 'updatedAt')
          ++(window as any).workListScans
        return original.apply(this, args)
      }
    })
    for (const name of ['第一次自动保存', '第二次自动保存', '最新作品名称']) {
      await page.getByLabel(kind === '生日应援' ? 'TA 的名字' : '姓名', { exact: true }).fill(name)
      await saved(page)
      await expect
        .poll(async () => {
          const work = await current(page)
          return (
            work.project.name === name && work.thumbnail && work.thumbnailRevision === work.revision
          )
        })
        .toBe(true)
    }
    expect(await page.evaluate(() => (window as any).workListScans)).toBe(0)
    await page.getByRole('button', { name: '我的物料', exact: true }).click()
    await expect(page.locator('.work-card img')).toBeVisible()
    expect(await page.evaluate(() => (window as any).workListScans)).toBe(1)
    expect((await current(page)).project.name).toBe('最新作品名称')
  })
}
