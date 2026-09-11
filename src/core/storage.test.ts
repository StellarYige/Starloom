import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, migrateProject, switchTemplate, updateCrop } from './project'
import {
  activateWork,
  copyWork,
  createWork,
  DB_NAME,
  deleteWork,
  getWork,
  isValidDraft,
  isValidWork,
  LEGACY_WORK_ID,
  listWorks,
  migrateLegacyDraft,
  readActiveWorkId,
  renameWork,
  saveThumbnail,
  saveWorkContent,
} from './storage'
import type { Draft } from './storage'
import type { PhotoAsset } from './types'

const asset: PhotoAsset = {
  id: 'test-photo',
  blob: new Blob(['example-photo-bytes'], { type: 'image/png' }),
  name: '照片.png',
  width: 1200,
  height: 1600,
  originalWidth: 1200,
  originalHeight: 1600,
  sample: false,
}
const project = () => ({ ...createProject(), photoId: asset.id })
function legacy(): Draft {
  const { cropsByTemplate, ...content } = project()
  return {
    schemaVersion: 1,
    project: { ...content, version: 1, crops: cropsByTemplate[content.templateId] },
    asset,
    savedAt: 1700000000000,
  }
}
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
afterEach(() => vi.restoreAllMocks())
async function seedLegacy(value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put(value, 'current')
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error)
      }
    }
    request.onerror = () => reject(request.error)
  })
}
async function raw(store: string, key: string) {
  return new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction(store).objectStore(store).get(key)
      read.onsuccess = () => {
        db.close()
        resolve(read.result)
      }
      read.onerror = () => {
        db.close()
        reject(read.error)
      }
    }
    request.onerror = () => reject(request.error)
  })
}
describe('independent local works', () => {
  it('restores uploaded bytes and every template crop in one record', async () => {
    const content = updateCrop(
      switchTemplate({ ...project(), name: '草稿恢复', color: '#123456' }, 'heart-polaroid', asset),
      'poster',
      { x: 0.6, y: 0.4, zoom: 2.3 },
    )
    const work = await createWork(content, asset)
    const restored = await getWork(work.id)
    expect(restored.project).toEqual(content)
    expect(await restored.asset.blob.text()).toBe('example-photo-bytes')
    expect(restored.asset.name).toBe('照片.png')
  })
  it('new and copied works never overwrite existing content or share edits', async () => {
    const original = await createWork(project(), asset, '生日收藏')
    const fresh = await createWork(project(), asset)
    const copy = await copyWork(original.id)
    expect(new Set([original.id, fresh.id, copy.id]).size).toBe(3)
    expect(copy.title).toBe('生日收藏（副本）')
    expect(copy.asset.id).not.toBe(original.asset.id)
    await saveWorkContent(
      copy.id,
      { ...copy.project, name: '只改副本', color: '#000000' },
      copy.asset,
    )
    expect((await getWork(original.id)).project).toEqual(original.project)
    expect((await listWorks()).map((work) => work.id)).toContain(fresh.id)
  })
  it('content saves preserve renames, and read/no-op saves do not change modification time', async () => {
    const work = await createWork(project(), asset)
    expect((await saveWorkContent(work.id, work.project, asset)).updatedAt).toBe(work.updatedAt)
    await renameWork(work.id, '独立的作品名称')
    await saveWorkContent(work.id, { ...work.project, wish: '改祝福' }, asset)
    const saved = await getWork(work.id)
    expect(saved.title).toBe('独立的作品名称')
    expect(saved.project.name).toBe(work.project.name)
    expect(() => renameWork(work.id, '  ')).toThrow()
    expect(() => renameWork(work.id, '星'.repeat(61))).toThrow()
  })
  it('last active work changes independently of delayed content saves', async () => {
    const a = await createWork(project(), asset, '甲')
    const b = await createWork(project(), asset, '乙')
    await activateWork(a.id)
    await saveWorkContent(b.id, { ...b.project, name: '乙的新名字' }, asset)
    expect(await readActiveWorkId()).toBe(a.id)
    expect((await getWork(a.id)).project.name).toBe(a.project.name)
  })
  it('delete clears the active pointer and delayed saves or thumbnails cannot resurrect a work', async () => {
    const work = await createWork(project(), asset)
    await deleteWork(work.id)
    await expect(saveWorkContent(work.id, work.project, asset)).rejects.toThrow()
    expect(await saveThumbnail(work.id, work.revision, new Blob(['thumbnail']))).toBe(false)
    expect(await listWorks()).toEqual([])
    expect(await readActiveWorkId()).toBe(null)
  })
  it('accepts only the thumbnail for the current content revision', async () => {
    const work = await createWork(project(), asset)
    const next = await saveWorkContent(work.id, { ...work.project, color: '#000000' }, asset)
    expect(await saveThumbnail(work.id, work.revision, new Blob(['stale']))).toBe(false)
    expect(await saveThumbnail(work.id, next.revision, new Blob(['current']))).toBe(true)
    const saved = await getWork(work.id)
    expect(await saved.thumbnail?.text()).toBe('current')
    expect(saved.updatedAt).toBe(next.updatedAt)
  })
  it('rejects incompatible records without partly restoring them', async () => {
    const work = await createWork(project(), asset)
    expect(isValidWork(work)).toBe(true)
    expect(isValidWork({ ...work, schemaVersion: 999 })).toBe(false)
    expect(isValidWork({ ...work, asset: { ...asset, id: 'wrong' } })).toBe(false)
    expect(isValidWork({ ...work, project: { ...work.project, cropsByTemplate: {} } })).toBe(false)
  })
  it('failed creation leaves the previous work and active pointer intact', async () => {
    const originalWork = await createWork(project(), asset, '已经保存的作品')
    const original = IDBObjectStore.prototype.add
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      const request = original.apply(this, args)
      if (this.name === 'works') request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(createWork(project(), asset)).rejects.toThrow()
    spy.mockRestore()
    expect(await readActiveWorkId()).toBe(originalWork.id)
    expect(await listWorks()).toHaveLength(1)
    expect((await getWork(originalWork.id)).project).toEqual(originalWork.project)
  })
})
describe('non-destructive v1 migration', () => {
  it('copies all legacy content and photo bytes, retains the original, and runs exactly once', async () => {
    const draft = legacy()
    draft.project.crops.avatar = { x: 0.3, y: 0.7, zoom: 2 }
    await seedLegacy(draft)
    expect(await migrateLegacyDraft()).toBe(true)
    const work = await getWork(LEGACY_WORK_ID)
    expect(work.project).toEqual(migrateProject(draft.project))
    expect(work.updatedAt).toBe(draft.savedAt)
    expect(await work.asset.blob.text()).toBe(await asset.blob.text())
    expect(await raw('drafts', 'current')).toEqual(draft)
    expect(await migrateLegacyDraft()).toBe(false)
    expect(await listWorks()).toHaveLength(1)
    await deleteWork(work.id)
    expect(await migrateLegacyDraft()).toBe(false)
    expect(await listWorks()).toHaveLength(0)
    expect(await raw('drafts', 'current')).toEqual(draft)
  })
  it('retains corrupt legacy data while permitting independent new works', async () => {
    const bad = { schemaVersion: 999, marker: 'keep-original' }
    await seedLegacy(bad)
    await expect(migrateLegacyDraft()).rejects.toThrow('原数据已保留')
    await createWork(project(), asset)
    expect(await raw('drafts', 'current')).toEqual(bad)
    expect(await raw('meta', 'migration-v1')).toBeUndefined()
  })
  it('keeps missing-template drafts unchanged and does not mark migration complete', async () => {
    const draft = legacy()
    draft.project.templateId = 'not-installed'
    await seedLegacy(draft)
    await expect(migrateLegacyDraft()).rejects.toThrow('主题尚未安装')
    expect(await raw('drafts', 'current')).toEqual(draft)
    expect(await listWorks()).toEqual([])
  })
  it('rolls back both the work and migration marker on transaction abort, then retries safely', async () => {
    const draft = legacy()
    await seedLegacy(draft)
    const original = IDBObjectStore.prototype.add
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      const request = original.apply(this, args)
      if (this.name === 'works') request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(migrateLegacyDraft()).rejects.toThrow()
    spy.mockRestore()
    expect(await raw('drafts', 'current')).toEqual(draft)
    expect(await raw('meta', 'migration-v1')).toBeUndefined()
    expect(await listWorks()).toEqual([])
    expect(await migrateLegacyDraft()).toBe(true)
    expect(await listWorks()).toHaveLength(1)
  })
  it('validates legacy schema, photo binding and normalized crops', () => {
    const draft = legacy()
    expect(isValidDraft(draft)).toBe(true)
    expect(isValidDraft({ ...draft, schemaVersion: 2 })).toBe(false)
    expect(isValidDraft({ ...draft, asset: { ...asset, blob: 'invalid' } })).toBe(false)
    expect(isValidDraft({ ...draft, asset: { ...asset, id: 'wrong' } })).toBe(false)
    expect(
      isValidDraft({
        ...draft,
        project: { ...draft.project, crops: { avatar: { x: NaN, y: 0.5, zoom: 1 } } },
      }),
    ).toBe(false)
  })
})
