import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createProject } from './project'
import { isValidDraft, readDraft, writeDraft } from './storage'
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
describe('local draft', () => {
  it('restores the photo bytes and all editing content in one record', async () => {
    const project = {
      ...createProject(),
      photoId: asset.id,
      name: '草稿恢复',
      color: '#123456',
      crops: { avatar: { x: 0.3, y: 0.7, zoom: 1.5 }, poster: { x: 0.6, y: 0.4, zoom: 2.3 } },
    }
    await writeDraft(project, asset)
    const restored = await readDraft()
    expect(restored?.project).toEqual(project)
    expect(await restored?.asset.blob.text()).toBe('example-photo-bytes')
    expect(restored?.asset.name).toBe('照片.png')
  })
  it('rejects incompatible or malformed records instead of partially restoring', () => {
    const draft = {
      schemaVersion: 1,
      project: { ...createProject(), photoId: asset.id },
      asset,
      savedAt: Date.now(),
    }
    expect(isValidDraft(draft)).toBe(true)
    expect(isValidDraft({ ...draft, schemaVersion: 2 })).toBe(false)
    expect(isValidDraft({ ...draft, asset: { ...asset, id: 'wrong-photo' } })).toBe(false)
    expect(
      isValidDraft({
        ...draft,
        project: { ...draft.project, crops: { avatar: { x: NaN, y: 0.5, zoom: 1 } } },
      }),
    ).toBe(false)
    expect(isValidDraft({ ...draft, asset: { ...asset, blob: 'invalid' } })).toBe(false)
  })
})
