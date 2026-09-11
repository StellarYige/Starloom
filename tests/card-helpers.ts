import { expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'

export async function saved(page: Page) {
  await expect(page.locator('.workspace-status')).toContainText('已保存到本机')
  await expect(page.getByText('正在打开作品…', { exact: true })).toBeHidden()
}
export async function ready(page: Page) {
  await expect(page.getByRole('button', { name: '导出电子小卡 PNG', exact: true })).toBeEnabled()
  await expect(page.getByText('正在打开作品…', { exact: true })).toBeHidden()
}
export async function startCard(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: '制作电子小卡', exact: true }).click()
  await ready(page)
}
export async function readWorks(page: Page) {
  return page.evaluate(async () => {
    const data = await new Promise<{ works: any[]; active: string }>((resolve, reject) => {
      const request = indexedDB.open('starloom-local')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['works', 'meta'])
        const works = tx.objectStore('works').getAll()
        const active = tx.objectStore('meta').get('activeWorkId')
        tx.oncomplete = () => {
          db.close()
          resolve({ works: works.result, active: active.result })
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      }
      request.onerror = () => reject(request.error)
    })
    const digest = async (blob: Blob) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('')
    return {
      active: data.active,
      works: await Promise.all(
        data.works.map(async (work) => ({
          ...work,
          asset: { ...work.asset, blob: await digest(work.asset.blob) },
          secondAsset: work.secondAsset
            ? { ...work.secondAsset, blob: await digest(work.secondAsset.blob) }
            : undefined,
          thumbnail: !!work.thumbnail,
        })),
      ),
    }
  })
}
export async function current(page: Page) {
  const data = await readWorks(page)
  return data.works.find((work) => work.id === data.active)!
}
export async function fixture(page: Page, color: string, width = 1400, height = 900) {
  const data = await page.evaluate(
    ({ color, width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = color
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#ffdf86'
      ctx.fillRect(width * 0.1, height * 0.1, width * 0.2, height * 0.2)
      ctx.fillStyle = '#fffefa'
      ctx.beginPath()
      ctx.arc(width * 0.68, height * 0.62, Math.min(width, height) * 0.18, 0, Math.PI * 2)
      ctx.fill()
      return canvas.toDataURL().split(',')[1]
    },
    { color, width, height },
  )
  return {
    name: `generated-${width}-${height}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  }
}
export async function exportCard(page: Page, info: TestInfo, id: string) {
  await ready(page)
  await page.getByRole('button', { name: '导出电子小卡 PNG', exact: true }).click()
  await expect(page.getByRole('link', { name: '下载小卡 PNG', exact: true })).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: '下载小卡 PNG', exact: true }).click(),
  ])
  const path = info.outputPath(`${id}.png`)
  await download.saveAs(path)
  const png = await readFile(path)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1800, 2400])
  expect(png.length).toBeGreaterThan(30_000)
  const difference = await page.evaluate(async (data) => {
    const preview = document.querySelector<HTMLCanvasElement>('.primary-artwork canvas')!
    const original = new Image()
    original.src = preview.toDataURL()
    const exported = new Image()
    exported.src = `data:image/png;base64,${data}`
    await Promise.all([original.decode(), exported.decode()])
    const scratch = document.createElement('canvas')
    scratch.width = preview.width
    scratch.height = preview.height
    const ctx = scratch.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(original, 0, 0)
    const a = ctx.getImageData(0, 0, scratch.width, scratch.height).data
    ctx.clearRect(0, 0, scratch.width, scratch.height)
    ctx.drawImage(exported, 0, 0, scratch.width, scratch.height)
    const b = ctx.getImageData(0, 0, scratch.width, scratch.height).data
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
    return sum / a.length
  }, png.toString('base64'))
  expect(difference).toBeLessThan(5)
  await info.attach(`${id}-preview-difference`, {
    body: JSON.stringify({ difference, bytes: png.length }),
    contentType: 'application/json',
  })
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  return png
}
