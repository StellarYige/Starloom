import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cardTemplates } from '../templates/photo-cards'
import {
  createPhotoCard,
  cardCrop,
  updateCardCrop,
  switchCardLayout,
  replaceCardPhoto,
  validCardDate,
} from './photo-card'
import { createProject, validateContent } from './project'
import { historyReducer, initialHistory } from './history'
import {
  copyWork,
  createWork,
  DB_NAME,
  getWork,
  isValidWork,
  listWorks,
  saveThumbnail,
  saveWorkContent,
} from './storage'
import type { PhotoAsset } from './types'

const first: PhotoAsset = {
  id: 'first',
  name: 'test-first.png',
  blob: new Blob(['first-photo']),
  width: 1400,
  height: 900,
  originalWidth: 1400,
  originalHeight: 900,
  sample: false,
}
const second: PhotoAsset = {
  ...first,
  id: 'second',
  name: 'test-second.png',
  blob: new Blob(['second-photo']),
  width: 700,
  height: 1800,
}
const photos = { first, second }
const project = () =>
  replaceCardPhoto(replaceCardPhoto(createPhotoCard(), first.id, 'first'), second.id, 'second')
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
describe('dual photo cards', () => {
  it('has two distinct portrait compositions with exactly two slots and 1800 × 2400 exports', () => {
    expect(cardTemplates).toHaveLength(2)
    for (const { layout } of cardTemplates) {
      expect([layout.exportWidth, layout.exportHeight]).toEqual([1800, 2400])
      expect(layout.width / layout.height).toBe(3 / 4)
      expect(
        layout.layers.filter((layer) => layer.type === 'photo').map((layer) => layer.slot),
      ).toEqual(['first', 'second'])
      expect(
        layout.layers.some((layer) => layer.type === 'text' && layer.content === 'birthday'),
      ).toBe(false)
    }
    expect(cardTemplates[0].layout.layers).not.toEqual(cardTemplates[1].layout.layers)
  })
  it('allows an absent date and ordinary short copy, validates real calendar dates and preserves birthday checks', () => {
    expect(validateContent(createPhotoCard())).toEqual([])
    for (const date of ['', '2024-02-29', '2026-09-11']) expect(validCardDate(date)).toBe(true)
    for (const date of ['2025-02-29', '2026-13-01', '0000-01-01', 'today'])
      expect(validCardDate(date)).toBe(false)
    const card = createPhotoCard()
    expect(
      validateContent({ ...card, card: { ...card.card!, date: '2025-02-29' } }).join(),
    ).toContain('日期')
    expect(validateContent({ ...card, wish: '星'.repeat(81) }).join()).toContain('80')
    expect(validateContent({ ...createProject(), month: 13 }).join()).toContain('生日')
  })
  it('remembers each slot for each layout without sharing mutable crops', () => {
    const strip = updateCardCrop(
      updateCardCrop(project(), 'first', { x: 0.4, y: 0.6, zoom: 2 }),
      'second',
      { x: 0.6, y: 0.4, zoom: 3 },
    )
    const collage = updateCardCrop(switchCardLayout(strip, 'portrait-collage', photos), 'second', {
      x: 0.55,
      y: 0.45,
      zoom: 1.8,
    })
    expect(
      switchCardLayout(collage, 'photo-strip', photos).card?.cropsByLayout['photo-strip'],
    ).toEqual(strip.card?.cropsByLayout['photo-strip'])
    expect(
      cardCrop(
        switchCardLayout(
          switchCardLayout(collage, 'photo-strip', photos),
          'portrait-collage',
          photos,
        ),
        'second',
      ).zoom,
    ).toBe(1.8)
    expect(cardCrop(collage, 'first')).not.toBe(cardCrop(strip, 'first'))
  })
  it.each(['first', 'second'] as const)(
    'replaces %s only, and undo/redo restores both assets and all layout memories',
    (slot) => {
      const before = switchCardLayout(
        updateCardCrop(project(), 'first', { x: 0.5, y: 0.5, zoom: 2 }),
        'portrait-collage',
        photos,
      )
      const after = replaceCardPhoto(before, 'replacement', slot)
      const other = slot === 'first' ? 'second' : 'first'
      for (const id of Object.keys(before.card!.cropsByLayout)) {
        expect(after.card!.cropsByLayout[id][slot]).toEqual({ x: 0.5, y: 0.5, zoom: 1 })
        expect(after.card!.cropsByLayout[id][other]).toEqual(before.card!.cropsByLayout[id][other])
      }
      const history = historyReducer(initialHistory(before), { type: 'change', value: after })
      const undo = historyReducer(history, { type: 'undo' })
      expect(undo.present).toEqual(before)
      expect(historyReducer(undo, { type: 'redo' }).present).toEqual(after)
    },
  )
})
describe('additive work compatibility and atomic two-photo storage', () => {
  it('leaves v2 birthday records unchanged alongside v3 cards, and copies both photos independently', async () => {
    const old = await createWork({ ...createProject(), photoId: first.id }, first)
    const card = await createWork(project(), first, '日常小卡', second)
    expect(old.schemaVersion).toBe(2)
    expect(card.schemaVersion).toBe(3)
    expect(await getWork(old.id)).toEqual(old)
    const copy = await copyWork(card.id)
    expect(new Set([copy.asset.id, copy.secondAsset!.id, first.id, second.id]).size).toBe(4)
    expect(await copy.asset.blob.text()).toBe('first-photo')
    expect(await copy.secondAsset!.blob.text()).toBe('second-photo')
    await saveWorkContent(
      copy.id,
      { ...copy.project, name: '副本姓名' },
      copy.asset,
      copy.secondAsset,
    )
    expect((await getWork(card.id)).project).toEqual(card.project)
    expect(await getWork(old.id)).toEqual(old)
    expect(await listWorks()).toHaveLength(3)
  })
  it('rejects missing, mismatched, malformed and future card data instead of defaulting to a birthday work', async () => {
    const work = await createWork(project(), first, '日常小卡', second)
    for (const broken of [
      { ...work, secondAsset: undefined },
      { ...work, secondAsset: first },
      { ...work, schemaVersion: 4 },
      { ...work, schemaVersion: 2 },
      { ...work, project: { ...work.project, version: 4 } },
      { ...work, project: { ...work.project, card: undefined } },
      {
        ...work,
        project: {
          ...work.project,
          card: {
            ...work.project.card,
            cropsByLayout: { 'photo-strip': { first: { x: 0.5, y: 0.5, zoom: 1 } } },
          },
        },
      },
    ])
      expect(isValidWork(broken)).toBe(false)
    await expect(saveWorkContent(work.id, work.project, first)).rejects.toThrow()
    expect(await getWork(work.id)).toEqual(work)
  })
  it('rolls back content and both photo blobs together on an aborted transaction', async () => {
    const work = await createWork(project(), first, '日常小卡', second)
    const originalPut = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      const request = originalPut.apply(this, args)
      if (this.name === 'works') this.transaction.abort()
      return request
    })
    try {
      await expect(
        saveWorkContent(work.id, replaceCardPhoto(work.project, 'replacement', 'second'), first, {
          ...second,
          id: 'replacement',
          blob: new Blob(['new']),
        }),
      ).rejects.toThrow()
    } finally {
      spy.mockRestore()
    }
    expect(await getWork(work.id)).toEqual(work)
  })
  it('invalidates the thumbnail when only the second photo changes', async () => {
    const work = await createWork(project(), first, '日常小卡', second)
    const next = await saveWorkContent(
      work.id,
      replaceCardPhoto(work.project, 'next', 'second'),
      first,
      { ...second, id: 'next' },
    )
    expect(next.revision).toBe(work.revision + 1)
    expect(await saveThumbnail(work.id, work.revision, new Blob(['stale']))).toBe(false)
    expect(await saveThumbnail(work.id, next.revision, new Blob(['current']))).toBe(true)
  })
})
