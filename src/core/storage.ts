import type { Crop, LegacyProjectState, PhotoAsset, ProjectState } from './types'
import { artworkTemplate, getTemplate } from '../templates'
import { isPhotoCard } from './photo-card'
import { birthdayText, countCharacters, createId, graphemes, migrateProject } from './project'

export interface Draft {
  schemaVersion: 1
  project: LegacyProjectState
  asset: PhotoAsset
  savedAt: number
}
export interface WorkRecord {
  schemaVersion: 2 | 3
  id: string
  title: string
  createdAt: number
  updatedAt: number
  revision: number
  project: ProjectState
  asset: PhotoAsset
  secondAsset?: PhotoAsset
  thumbnail: Blob | null
  thumbnailRevision: number
}
export type WorkSummary = Pick<WorkRecord, 'id' | 'title' | 'updatedAt' | 'thumbnail'> & {
  templateId: string
}
export const DB_NAME = 'starloom-local'
export const LEGACY_WORK_ID = 'legacy-current-v1'
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('浏览器没有开放本地存储。'))
    const request = indexedDB.open(DB_NAME, 2)
    let abandoned = false
    const blocked = () => {
      abandoned = true
      const error = new Error(
        '本地数据库正在等待，请关闭其他星迹页面，然后点击重试。原数据仍保留。',
      )
      error.name = 'StorageBlockedError'
      reject(error)
    }
    // A request queued behind a blocked upgrade may never receive its own blocked event.
    const timeout = setTimeout(blocked, 3000)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts')
      if (!db.objectStoreNames.contains('works')) {
        const works = db.createObjectStore('works', { keyPath: 'id' })
        works.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    request.onsuccess = () => {
      clearTimeout(timeout)
      const db = request.result
      db.onversionchange = () => db.close()
      if (abandoned) db.close()
      else resolve(db)
    }
    request.onerror = () => {
      clearTimeout(timeout)
      reject(request.error)
    }
    request.onblocked = () => {
      clearTimeout(timeout)
      blocked()
    }
  })
}
/** IDB requests are enqueued in callbacks; unrelated async work stays outside transactions. */
async function transact<T>(
  names: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      let value: T
      let failure: unknown
      // Resolve only after commit; strict durability also requests a disk flush before completion.
      const tx =
        mode === 'readwrite'
          ? db.transaction(names, mode, { durability: 'strict' })
          : db.transaction(names, mode)
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('保存被浏览器中止。'))
      tx.onerror = () => {
        failure ??= tx.error
      }
      const fail = (error: unknown) => {
        failure = error
        tx.abort()
      }
      try {
        run(
          tx,
          (next) => {
            value = next
          },
          fail,
        )
      } catch (error) {
        fail(error)
      }
    })
  } finally {
    db.close()
  }
}
function validCrop(crop: Crop | undefined) {
  return (
    !!crop &&
    [crop.x, crop.y, crop.zoom].every(Number.isFinite) &&
    crop.x >= 0 &&
    crop.x <= 1 &&
    crop.y >= 0 &&
    crop.y <= 1 &&
    crop.zoom >= 1 &&
    crop.zoom <= 4
  )
}
function validPhoto(asset: PhotoAsset | undefined, id: string | undefined) {
  return (
    !!asset &&
    typeof id === 'string' &&
    !!id &&
    asset.id === id &&
    asset.blob instanceof Blob &&
    asset.blob.size > 0 &&
    typeof asset.name === 'string' &&
    typeof asset.sample === 'boolean' &&
    [asset.width, asset.height, asset.originalWidth, asset.originalHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
}
function validContent(
  p: ProjectState | LegacyProjectState | undefined,
  asset: PhotoAsset | undefined,
) {
  return (
    !!p &&
    !!asset &&
    asset.blob instanceof Blob &&
    asset.blob.size > 0 &&
    typeof p.name === 'string' &&
    typeof p.wish === 'string' &&
    p.name.length <= 10000 &&
    p.wish.length <= 10000 &&
    /^#[\da-f]{6}$/i.test(p.color) &&
    Number.isInteger(p.month) &&
    p.month >= 1 &&
    p.month <= 12 &&
    Number.isInteger(p.day) &&
    p.day >= 1 &&
    p.day <= 31 &&
    typeof p.templateId === 'string' &&
    typeof p.photoId === 'string' &&
    p.photoId === asset.id &&
    !!p.decorations &&
    typeof p.decorations.sparkles === 'boolean' &&
    typeof p.decorations.lines === 'boolean' &&
    typeof asset.name === 'string' &&
    typeof asset.sample === 'boolean' &&
    [asset.width, asset.height, asset.originalWidth, asset.originalHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
}
export function isValidDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const d = value as Draft
  return (
    d.schemaVersion === 1 &&
    d.project?.version === 1 &&
    validContent(d.project, d.asset) &&
    Number.isFinite(d.savedAt) &&
    Number.isFinite(new Date(d.savedAt).getTime()) &&
    validCrop(d.project.crops?.avatar) &&
    validCrop(d.project.crops?.poster)
  )
}
export function isValidWork(value: unknown): value is WorkRecord {
  if (!value || typeof value !== 'object') return false
  const w = value as WorkRecord
  const crops = w.project?.cropsByTemplate
  const project = w.project
  const card = project && isPhotoCard(project) ? project.card : null
  const compatible = card
    ? w.schemaVersion === 3 &&
      validPhoto(w.secondAsset, card.secondPhotoId) &&
      typeof card.date === 'string' &&
      card.date.length <= 20 &&
      !!card.cropsByLayout &&
      !!card.cropsByLayout[project.templateId] &&
      Object.values(card.cropsByLayout).every(
        (pair) => !!pair && validCrop(pair.first) && validCrop(pair.second),
      )
    : w.schemaVersion === 2 &&
      project?.version === 2 &&
      project.card === undefined &&
      w.secondAsset === undefined &&
      !!crops &&
      !!crops[project.templateId] &&
      Object.values(crops).every(
        (pair) => !!pair && validCrop(pair.avatar) && validCrop(pair.poster),
      )
  return (
    compatible &&
    validContent(w.project, w.asset) &&
    typeof w.id === 'string' &&
    !!w.id &&
    typeof w.title === 'string' &&
    Number.isFinite(w.createdAt) &&
    Number.isFinite(w.updatedAt) &&
    Number.isFinite(new Date(w.updatedAt).getTime()) &&
    Number.isInteger(w.revision) &&
    w.revision > 0
  )
}
function record(
  project: ProjectState,
  asset: PhotoAsset,
  title: string,
  id = createId(),
  time = Date.now(),
  secondAsset?: PhotoAsset,
): WorkRecord {
  const work: WorkRecord = {
    schemaVersion: isPhotoCard(project) ? 3 : 2,
    id,
    title,
    createdAt: time,
    updatedAt: time,
    revision: 1,
    project,
    asset,
    ...(secondAsset ? { secondAsset } : {}),
    thumbnail: null,
    thumbnailRevision: 0,
  }
  if (!isValidWork(work)) throw new Error('作品内容无法保存，原数据未被替换。')
  return work
}
export function validateTitle(title: string) {
  const value = title.trim()
  if (!value || countCharacters(value) > 60) throw new Error('作品名称请填写 1～60 个字符。')
  return value
}
export async function migrateLegacyDraft(): Promise<boolean> {
  const state = await transact<{ marker: unknown; draft: unknown }>(
    ['drafts', 'meta'],
    'readonly',
    (tx, done) => {
      const marker = tx.objectStore('meta').get('migration-v1')
      const draft = tx.objectStore('drafts').get('current')
      draft.onsuccess = () => done({ marker: marker.result, draft: draft.result })
    },
  )
  if (state.marker || state.draft === undefined) return false
  if (!isValidDraft(state.draft))
    throw new Error('旧草稿暂时无法迁移，原数据已保留。可重试或新建独立作品。')
  getTemplate(state.draft.project.templateId)
  const legacy = state.draft
  const project = migrateProject(legacy.project)
  const work = record(
    project,
    legacy.asset,
    `${legacy.project.name.trim() || '生日应援'} · ${birthdayText(project)}`,
    LEGACY_WORK_ID,
    legacy.savedAt,
  )
  return transact<boolean>(['works', 'meta'], 'readwrite', (tx, done) => {
    const meta = tx.objectStore('meta')
    const marker = meta.get('migration-v1')
    marker.onsuccess = () => {
      if (marker.result) {
        done(false)
        return
      }
      const existing = tx.objectStore('works').get(LEGACY_WORK_ID)
      existing.onsuccess = () => {
        if (!existing.result) tx.objectStore('works').add(work)
        meta.put({ workId: LEGACY_WORK_ID }, 'migration-v1')
        const active = meta.get('activeWorkId')
        active.onsuccess = () => {
          if (!active.result) meta.put(LEGACY_WORK_ID, 'activeWorkId')
        }
        done(true)
      }
    }
  })
}
export function listWorks(): Promise<WorkSummary[]> {
  return transact(['works'], 'readonly', (tx, done) => {
    const items: WorkSummary[] = []
    const cursor = tx.objectStore('works').index('updatedAt').openCursor(null, 'prev')
    cursor.onsuccess = () => {
      const next = cursor.result
      if (!next) {
        done(items)
        return
      }
      const w = next.value as WorkRecord
      items.push({
        id: w.id,
        title: typeof w.title === 'string' ? w.title : '暂不可读取的作品',
        updatedAt: Number.isFinite(new Date(w.updatedAt).getTime()) ? w.updatedAt : 0,
        templateId: w.project?.templateId ?? '',
        thumbnail:
          w.thumbnailRevision === w.revision && w.thumbnail instanceof Blob ? w.thumbnail : null,
      })
      next.continue()
    }
  })
}
export async function getWork(id: string): Promise<WorkRecord> {
  const value = await transact<unknown>(['works'], 'readonly', (tx, done) => {
    const request = tx.objectStore('works').get(id)
    request.onsuccess = () => done(request.result)
  })
  if (!value) throw new Error('这份作品已被删除，无法继续保存或打开。')
  if (!isValidWork(value)) throw new Error('这份作品暂不可读取，原数据仍保留。')
  artworkTemplate(value.project)
  // A WebKit IDB File/Blob can still refer to a database backing file that a
  // later revision replaces. Keep an independent byte snapshot for this session;
  // do not rewrite the stored record or change its IDs, schema or timestamps.
  const snapshot = async (asset: PhotoAsset): Promise<PhotoAsset> => ({
    ...asset,
    blob: new Blob([await asset.blob.arrayBuffer()], { type: asset.blob.type }),
  })
  const [asset, secondAsset] = await Promise.all([
    snapshot(value.asset),
    value.secondAsset ? snapshot(value.secondAsset) : undefined,
  ])
  return { ...value, asset, ...(secondAsset ? { secondAsset } : {}) }
}
export function readActiveWorkId(): Promise<string | null> {
  return transact(['meta'], 'readonly', (tx, done) => {
    const request = tx.objectStore('meta').get('activeWorkId')
    request.onsuccess = () => done(typeof request.result === 'string' ? request.result : null)
  })
}
export function activateWork(id: string): Promise<void> {
  return transact(['works', 'meta'], 'readwrite', (tx, done, fail) => {
    const request = tx.objectStore('works').get(id)
    request.onsuccess = () => {
      if (!request.result) {
        fail(new Error('这份作品已被删除。'))
        return
      }
      tx.objectStore('meta').put(id, 'activeWorkId')
      done()
    }
  })
}
export async function createWork(
  project: ProjectState,
  asset: PhotoAsset,
  title = '新的生日应援',
  secondAsset?: PhotoAsset,
): Promise<WorkRecord> {
  const work = record(
    structuredClone(project),
    { ...asset },
    validateTitle(title),
    undefined,
    undefined,
    secondAsset ? { ...secondAsset } : undefined,
  )
  return transact(['works', 'meta'], 'readwrite', (tx, done) => {
    tx.objectStore('works').add(work)
    tx.objectStore('meta').put(work.id, 'activeWorkId')
    done(work)
  })
}
function editWork(id: string, update: (work: WorkRecord) => WorkRecord): Promise<WorkRecord> {
  return transact(['works'], 'readwrite', (tx, done, fail) => {
    const store = tx.objectStore('works')
    const request = store.get(id)
    request.onsuccess = () => {
      try {
        if (!isValidWork(request.result))
          throw new Error('作品已删除或暂不可读取，修改未覆盖其他作品。')
        const previous = request.result
        const next = update(previous)
        if (!isValidWork(next)) throw new Error('作品内容无法保存。')
        if (next !== previous) store.put(next)
        done(next)
      } catch (error) {
        fail(error)
      }
    }
  })
}
export function saveWorkContent(
  id: string,
  project: ProjectState,
  asset: PhotoAsset,
  secondAsset?: PhotoAsset,
) {
  return editWork(id, (work) => {
    if (isPhotoCard(project) && !secondAsset)
      throw new Error('第二张照片缺失，未覆盖已保存的作品。')
    return JSON.stringify(work.project) === JSON.stringify(project) &&
      work.asset.id === asset.id &&
      work.secondAsset?.id === secondAsset?.id
      ? work
      : {
          ...work,
          project,
          asset,
          ...(secondAsset ? { secondAsset } : {}),
          updatedAt: Date.now(),
          revision: work.revision + 1,
        }
  })
}
export function renameWork(id: string, title: string) {
  const value = validateTitle(title)
  return editWork(id, (work) =>
    work.title === value ? work : { ...work, title: value, updatedAt: Date.now() },
  )
}
export async function copyWork(id: string): Promise<WorkRecord> {
  const source = await getWork(id)
  const photoId = createId()
  const secondPhotoId = createId()
  const project = { ...structuredClone(source.project), photoId }
  if (isPhotoCard(project)) project.card.secondPhotoId = secondPhotoId
  return createWork(
    project,
    { ...source.asset, id: photoId },
    graphemes(source.title).slice(0, 56).join('') + '（副本）',
    source.secondAsset ? { ...source.secondAsset, id: secondPhotoId } : undefined,
  )
}
export function deleteWork(id: string): Promise<void> {
  return transact(['works', 'meta'], 'readwrite', (tx, done) => {
    tx.objectStore('works').delete(id)
    const meta = tx.objectStore('meta')
    const active = meta.get('activeWorkId')
    active.onsuccess = () => {
      if (active.result === id) meta.put(null, 'activeWorkId')
    }
    done()
  })
}
export function saveThumbnail(id: string, revision: number, thumbnail: Blob): Promise<boolean> {
  return transact(['works'], 'readwrite', (tx, done, fail) => {
    const store = tx.objectStore('works')
    const request = store.get(id)
    request.onsuccess = () => {
      const work = request.result as WorkRecord | undefined
      if (!work || work.revision !== revision) {
        done(false)
        return
      }
      try {
        store.put({ ...work, thumbnail, thumbnailRevision: revision })
        done(true)
      } catch (error) {
        fail(error)
      }
    }
  })
}
