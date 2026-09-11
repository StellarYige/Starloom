import { test, expect } from '@playwright/test'
import { current, fixture, ready, saved, startCard } from './card-helpers'

test('mouse and touch drag select the correct collage photo and undo one whole gesture', async ({
  page,
  isMobile,
}) => {
  await startCard(page)
  await page.getByLabel('上传照片 1', { exact: true }).setInputFiles(await fixture(page, '#c76750'))
  await ready(page)
  await page
    .getByLabel('上传照片 2', { exact: true })
    .setInputFiles(await fixture(page, '#4478ab', 800, 1600))
  await ready(page)
  await page.getByRole('button', { name: '选择写真拼贴布局' }).click()
  for (const slot of [1, 2]) {
    await page.getByRole('button', { name: new RegExp(`^照片 ${slot}`) }).click()
    await page.getByRole('slider').focus()
    await page.getByRole('slider').press('End')
  }
  await page.getByRole('button', { name: /^照片 1/ }).click()
  await saved(page)
  const original = await current(page)
  const canvas = page.locator('.primary-artwork .artwork')
  await canvas.scrollIntoViewIfNeeded()
  const bounds = (await canvas.boundingBox())!
  // A point inside the overlapping small photo must target photo 2 (last painted).
  const x = bounds.x + (bounds.width * 650) / 900
  const y = bounds.y + (bounds.height * 550) / 1200
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 20, y: y + 18, id: 1 }],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 30, y: y + 26, id: 1 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 30, y + 26, { steps: 5 })
    await page.mouse.up()
  }
  await expect(page.getByRole('button', { name: /^照片 2/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await saved(page)
  const dragged = (await current(page)).project.card.cropsByLayout['portrait-collage']
  expect(dragged.first).toEqual(original.project.card.cropsByLayout['portrait-collage'].first)
  expect(dragged.second).not.toEqual(original.project.card.cropsByLayout['portrait-collage'].second)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await saved(page)
  expect((await current(page)).project).toEqual(original.project)
  await page.getByRole('button', { name: /^照片 1/ }).click()
  await canvas.focus()
  await canvas.press('ArrowLeft')
  await saved(page)
  const keyed = (await current(page)).project.card.cropsByLayout['portrait-collage']
  expect(keyed.first).not.toEqual(original.project.card.cropsByLayout['portrait-collage'].first)
  expect(keyed.second).toEqual(original.project.card.cropsByLayout['portrait-collage'].second)
})

test('an old pending save cannot mark newer edits saved, and beforeunload tracks dirty content', async ({
  page,
}) => {
  await startCard(page)
  await saved(page)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('starloom-local')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('works', 'readwrite')
          let released = false
          ;(window as any).releaseCardSave = () => {
            released = true
          }
          const keepAlive = () => {
            const request = tx.objectStore('works').get('test-lock')
            request.onsuccess = () => {
              if (!released) keepAlive()
            }
          }
          keepAlive()
          tx.oncomplete = () => db.close()
          resolve()
        }
      }),
  )
  await page.getByLabel('姓名', { exact: true }).fill('已排队的第一版')
  await page.getByRole('button', { name: '立即保存', exact: true }).click()
  await expect(page.locator('.workspace-status')).toContainText('正在保存')
  await page.getByLabel('姓名', { exact: true }).fill('后来修改的第二版')
  await expect(page.locator('.workspace-status')).not.toContainText('已保存到本机')
  const prevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await page.getByRole('button', { name: '我的物料', exact: true }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toBeVisible()
  await page.evaluate(() => (window as any).releaseCardSave())
  await expect(page.getByRole('heading', { name: /我的物料/ })).toBeVisible()
  await page.getByRole('button', { name: '继续编辑新的电子小卡', exact: true }).click()
  await ready(page)
  await saved(page)
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('后来修改的第二版')
  expect((await current(page)).project.name).toBe('后来修改的第二版')
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }),
  ).toBe(false)
})

test('a corrupt card stays untouched while an independent new work is created', async ({
  page,
}) => {
  await startCard(page)
  await saved(page)
  const original = await current(page)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open('starloom-local')
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('works', 'readwrite')
          const store = tx.objectStore('works')
          const get = store.getAll()
          get.onsuccess = () => store.put({ ...get.result[0], secondAsset: undefined })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
  )
  await page.reload()
  await expect(page.locator('.library-message')).toContainText('暂不可读取')
  await page.getByRole('button', { name: '新建电子小卡', exact: true }).click()
  await ready(page)
  await saved(page)
  expect((await current(page)).id).not.toBe(original.id)
  const preserved = await page.evaluate(
    (id) =>
      new Promise<any>((resolve) => {
        const request = indexedDB.open('starloom-local')
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('works')
          const get = tx.objectStore('works').get(id)
          tx.oncomplete = () => {
            db.close()
            resolve({
              project: get.result.project,
              missingSecond: get.result.secondAsset === undefined,
            })
          }
        }
      }),
    original.id,
  )
  expect(preserved.project).toEqual(original.project)
  expect(preserved.missingSecond).toBe(true)
})
