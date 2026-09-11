import { decodePhoto } from './photos'
import { canvasBlob, prepareFonts, renderArtwork } from './render'
import type { WorkRecord } from './storage'
import { saveThumbnail } from './storage'

const pending = new Map<string, { latest: WorkRecord; promise: Promise<boolean> }>()
export function refreshThumbnail(work: WorkRecord): Promise<boolean> {
  const existing = pending.get(work.id)
  if (existing) {
    if (work.revision >= existing.latest.revision) existing.latest = work
    return existing.promise
  }
  const job = { latest: work, promise: Promise.resolve(false) }
  pending.set(work.id, job)
  job.promise = (async () => {
    let changed = false
    let revision: number
    do {
      const current = job.latest
      revision = current.revision
      changed = (await generate(current)) || changed
    } while (revision !== job.latest.revision)
    return changed
  })().finally(() => pending.delete(work.id))
  return job.promise
}
async function generate(work: WorkRecord) {
  if (work.thumbnail && work.thumbnailRevision === work.revision) return false
  await prepareFonts(work.project)
  const bitmap = await decodePhoto(work.asset.blob)
  const canvas = document.createElement('canvas')
  try {
    renderArtwork(canvas, work.project, bitmap, 'poster', 320)
    return await saveThumbnail(work.id, work.revision, await canvasBlob(canvas))
  } finally {
    bitmap.close()
    canvas.width = 1
    canvas.height = 1
  }
}
