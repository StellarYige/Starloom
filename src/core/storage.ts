import type { PhotoAsset, ProjectState } from './types'
import { getTemplate } from '../templates'

export interface Draft {
  schemaVersion: 1
  project: ProjectState
  asset: PhotoAsset
  savedAt: number
}
const DB_NAME = 'starloom-local'
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('浏览器没有开放本地存储。'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    let abandoned = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts')
    }
    request.onsuccess = () => {
      if (abandoned) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      abandoned = true
      reject(new Error('请关闭其他星迹页面后重试。'))
    }
  })
}
export function isValidDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const d = value as Draft
  const p = d.project
  if (d.schemaVersion !== 1 || !p || p.version !== 1 || !d.asset || !(d.asset.blob instanceof Blob))
    return false
  if (
    typeof p.name !== 'string' ||
    typeof p.wish !== 'string' ||
    p.name.length > 10000 ||
    p.wish.length > 10000 ||
    !/^#[\da-f]{6}$/i.test(p.color)
  )
    return false
  if (
    !Number.isInteger(p.month) ||
    p.month < 1 ||
    p.month > 12 ||
    !Number.isInteger(p.day) ||
    p.day < 1 ||
    p.day > 31
  )
    return false
  if (
    typeof p.templateId !== 'string' ||
    p.photoId !== d.asset.id ||
    !p.decorations ||
    typeof p.decorations.sparkles !== 'boolean' ||
    typeof p.decorations.lines !== 'boolean'
  )
    return false
  if (
    !Number.isFinite(d.savedAt) ||
    typeof d.asset.name !== 'string' ||
    typeof d.asset.sample !== 'boolean' ||
    d.asset.blob.size === 0
  )
    return false
  if (
    ![d.asset.width, d.asset.height, d.asset.originalWidth, d.asset.originalHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return false
  return ['avatar', 'poster'].every((format) => {
    const crop = p.crops?.[format as 'avatar' | 'poster']
    return (
      crop &&
      [crop.x, crop.y, crop.zoom].every(Number.isFinite) &&
      crop.x >= 0 &&
      crop.x <= 1 &&
      crop.y >= 0 &&
      crop.y <= 1 &&
      crop.zoom >= 1 &&
      crop.zoom <= 4
    )
  })
}
export async function readDraft(): Promise<Draft | null> {
  const db = await openDatabase()
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('current')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (value === undefined) return null
    if (!isValidDraft(value)) throw new Error('这份草稿无法读取，原数据仍保留在浏览器中。')
    getTemplate(value.project.templateId)
    return value
  } finally {
    db.close()
  }
}
export async function writeDraft(project: ProjectState, asset: PhotoAsset): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put(
        { schemaVersion: 1, project, asset, savedAt: Date.now() } satisfies Draft,
        'current',
      )
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('保存被浏览器中止。'))
    })
  } finally {
    db.close()
  }
}
