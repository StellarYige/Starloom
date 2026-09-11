import { test, expect } from './browser-fixtures'
import { current, saved } from './card-helpers'

test.describe('@experience', () => {
  test('temporary work can cancel discarding, then confirm and return to the library', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = () => {
        throw new DOMException('Storage unavailable for regression test', 'SecurityError')
      }
    })
    await page.goto('./')
    await page.getByRole('button', { name: '临时制作并导出（无法保存）' }).click()
    await page
      .getByRole('navigation', { name: '制作步骤' })
      .getByRole('button', { name: /写祝福/ })
      .click()
    await page.getByLabel('TA 的名字').fill('临时心意')
    await page.getByRole('button', { name: '我的物料', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '放弃临时作品？' })).toBeVisible()
    await page.getByRole('button', { name: '继续制作', exact: true }).click()
    await expect(page.getByLabel('TA 的名字')).toHaveValue('临时心意')
    await page.getByRole('button', { name: '我的物料', exact: true }).click()
    await page.getByRole('button', { name: '放弃并离开', exact: true }).click()
    await expect(page.locator('h1')).toContainText('我的物料')
    await expect(page.locator('.work-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '临时制作并导出（无法保存）' })).toBeVisible()
  })

  for (const kind of ['生日应援', '电子小卡']) {
    test(`${kind} keeps save protection and retries without discarding changes`, async ({
      page,
    }) => {
      await page.goto('./')
      await page.getByRole('button', { name: `制作${kind}`, exact: true }).click()
      await saved(page)
      if (kind === '生日应援')
        await page
          .getByRole('navigation', { name: '制作步骤' })
          .getByRole('button', { name: /写祝福/ })
          .click()
      const name = page.getByLabel(kind === '生日应援' ? 'TA 的名字' : '姓名', { exact: true })
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put
        ;(window as any).restoreSave = () => {
          IDBObjectStore.prototype.put = original
        }
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === 'works') throw new DOMException('Test quota', 'QuotaExceededError')
          return original.apply(this, args)
        }
      })
      await name.fill('保存失败也要留下的修改')
      await expect(page.locator('.workspace-status')).toContainText('保存失败')
      await page.getByRole('button', { name: '我的物料', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(name).toHaveValue('保存失败也要留下的修改')
      await expect(page.locator('.workspace-status')).toContainText('保存失败')
      await expect(
        page.getByText(
          '当前修改尚未保存，已为你留在这份作品。可以继续编辑、重试保存或先导出图片。',
        ),
      ).toBeVisible()
      await page.evaluate(() => (window as any).restoreSave())
      await page.getByRole('button', { name: '我的物料', exact: true }).click()
      await expect(page.locator('h1')).toContainText('我的物料')
      expect((await current(page)).project.name).toBe('保存失败也要留下的修改')
    })

    test(`${kind} visual color picker, hex input, undo redo and reload stay synchronized`, async ({
      page,
    }) => {
      await page.goto('./')
      await page.getByRole('button', { name: `制作${kind}`, exact: true }).click()
      await saved(page)
      if (kind === '生日应援')
        await page
          .getByRole('navigation', { name: '制作步骤' })
          .getByRole('button', { name: /选配色/ })
          .click()
      const picker = page.getByLabel('自定义应援色', { exact: true })
      const hex = page.getByLabel('自定义颜色', { exact: true })
      const initial = await picker.inputValue()
      await picker.fill('#6850a4')
      await picker.blur()
      await expect(hex).toHaveValue('#6850A4')
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await expect(picker).toHaveValue(initial)
      await page.getByRole('button', { name: '重做', exact: true }).click()
      await expect(picker).toHaveValue('#6850a4')
      await hex.fill('#123456')
      await hex.blur()
      await expect(picker).toHaveValue('#123456')
      await hex.fill('#bad')
      await expect(hex).toHaveAttribute('aria-invalid', 'true')
      await hex.blur()
      await expect(hex).toHaveValue('#123456')
      await page.getByRole('button', { name: '立即保存', exact: true }).click()
      await saved(page)
      await page.reload()
      if (kind === '生日应援')
        await page
          .getByRole('navigation', { name: '制作步骤' })
          .getByRole('button', { name: /选配色/ })
          .click()
      await expect(picker).toHaveValue('#123456')
      await expect(hex).toHaveValue('#123456')
    })
  }
})
