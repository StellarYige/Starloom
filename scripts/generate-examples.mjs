import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Only bundled licensed sample photos, in a fresh browser context. No user profile is read.
const baseURL = process.env.STARLOOM_EXAMPLES_URL || 'http://127.0.0.1:5173/'
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
})
const directory = 'public/examples'
const exports = []
const files = new Map()
try {
  await mkdir(directory, { recursive: true })
  const page = await browser.newPage({ baseURL })
  page.on('pageerror', (error) => console.error(error.message))
  const save = async (id, link, width, height) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: link, exact: true }).click(),
    ])
    const png = await readFile(await download.path())
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height])
    const preview = await page.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 480
      canvas.height = Math.round((480 * image.height) / image.width)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/webp', 0.9).split(',')[1]
    }, png.toString('base64'))
    files.set(`${directory}/${id}.png`, png)
    files.set(`${directory}/${id}.webp`, Buffer.from(preview, 'base64'))
    exports.push({ id, width, height, sha256: createHash('sha256').update(png).digest('hex') })
  }
  await page.goto('./')
  await page.getByRole('button', { name: '制作生日应援', exact: true }).click()
  await page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: /导出/ })
    .click()
  await page.getByRole('button', { name: '导出这份心意', exact: true }).click()
  await save('birthday-avatar', '下载头像 PNG', 1600, 1600)
  await save('birthday-poster', '下载贺图 PNG', 2400, 3000)
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await page.getByRole('button', { name: '制作电子小卡', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出电子小卡 PNG', exact: true })).toBeEnabled()
  for (const [name, id] of [
    ['上下照片条', 'photo-strip'],
    ['写真拼贴', 'portrait-collage'],
  ]) {
    await page.getByRole('button', { name: `选择${name}布局` }).click()
    await page.getByRole('button', { name: '导出电子小卡 PNG', exact: true }).click()
    await save(id, '下载小卡 PNG', 1800, 2400)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
  }
  files.set(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        generator: 'scripts/generate-examples.mjs',
        browser: browser.version(),
        photo: {
          file: 'assets/portrait.jpg',
          author: 'Aiony Haust',
          source: 'https://unsplash.com/photos/3TLl_97HNJo',
          license: 'https://unsplash.com/license',
        },
        note: 'Actual Starloom downloads using default fictional text. WebP previews are resized from these PNGs.',
        exports,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
// Publish only after the browser is closed: public/ writes trigger Vite reloads.
for (const [path, contents] of files) await writeFile(path, contents)
console.log('Generated four licensed example PNGs and their WebP previews.')
