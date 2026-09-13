import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, switchTemplate, updateCrop } from './project'
import { createPhotoCard, switchCardLayout, updateCardCrop } from './photo-card'
import { updateTemplateText } from './template-text'
import { decodePhoto } from './photos'
import {
  createWork,
  DB_NAME,
  getWork,
  listWorks,
  readActiveWorkId,
  saveWorkContent,
} from './storage'
import {
  exportProjectFile,
  importProjectFile,
  MAX_PROJECT_FILE_BYTES,
  projectFileName,
  readProjectFile,
} from './project-file'
import type { ProjectSnapshot } from './project-file'
import type { PhotoAsset } from './types'

vi.mock('./photos', () => ({ decodePhoto: vi.fn() }))
const photo: PhotoAsset = {
  id: 'first-photo',
  name: '原图.png',
  sample: false,
  width: 1200,
  height: 1600,
  originalWidth: 2400,
  originalHeight: 3200,
  blob: new Blob(['first-photo-bytes'], { type: 'image/png' }),
}
const second = {
  ...photo,
  id: 'second-photo',
  blob: new Blob(['second-photo-bytes'], { type: 'image/png' }),
}
function birthday(): ProjectSnapshot {
  let project = {
    ...createProject(),
    photoId: photo.id,
    color: '#AB1234',
    name: '工程测试',
    wish: '可继续编辑\nHello!',
  }
  project = updateCrop(project, 'avatar', { x: 0.6, y: 0.4, zoom: 2 })
  project = updateTemplateText(project, 'poster-kicker', { text: '特别的一天', hidden: true })
  project = switchTemplate(project, 'heart-polaroid', photo)
  project = updateTemplateText(project, 'avatar-caption', { text: '记住此刻', hidden: false })
  project = switchTemplate(project, 'center-stage', photo)
  return { title: '生日备份', project, asset: photo }
}
function card(): ProjectSnapshot {
  let project = createPhotoCard()
  project.photoId = photo.id
  project.card!.secondPhotoId = second.id
  project.card!.date = '2024-02-29'
  project = updateCardCrop(project, 'first', { x: 0.4, y: 0.6, zoom: 2.5 })
  project = updateTemplateText(project, 'card-heading', { text: '两帧日常', hidden: false })
  project = switchCardLayout(project, 'portrait-collage', { first: photo, second })
  project = updateCardCrop(project, 'second', { x: 0.3, y: 0.7, zoom: 3 })
  project = updateTemplateText(project, 'card-caption', { text: '回忆', hidden: true })
  return { title: '小卡备份', project, asset: photo, secondAsset: second }
}
beforeEach(async () => {
  vi.mocked(decodePhoto)
    .mockReset()
    .mockResolvedValue({ width: 1200, height: 1600, close: vi.fn() } as unknown as ImageBitmap)
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const packed = (value: unknown) => new Blob([JSON.stringify(value)], { type: 'application/json' })

describe('portable editable project files', () => {
  it.each([birthday, card])(
    'round-trips every photo byte, crop memory, text, color and layout',
    async (source) => {
      const snapshot = source()
      const restored = await readProjectFile(await exportProjectFile(snapshot))
      expect(restored.project).toEqual(snapshot.project)
      expect(restored.title).toBe(snapshot.title)
      expect(restored.asset).toEqual(snapshot.asset)
      expect(await restored.asset.blob.text()).toBe(await snapshot.asset.blob.text())
      expect(restored.secondAsset).toEqual(snapshot.secondAsset)
      if (snapshot.secondAsset)
        expect(await restored.secondAsset!.blob.text()).toBe(await snapshot.secondAsset.blob.text())
    },
  )

  it.each([birthday, card])(
    'imports repeatedly as independent new works and never overwrites the source',
    async (source) => {
      const snapshot = source()
      const original = await createWork(
        snapshot.project,
        snapshot.asset,
        snapshot.title,
        snapshot.secondAsset,
      )
      const file = await exportProjectFile(snapshot)
      const a = await importProjectFile(file)
      const b = await importProjectFile(file)
      expect(new Set([original.id, a.id, b.id]).size).toBe(3)
      expect(new Set([original.asset.id, a.asset.id, b.asset.id]).size).toBe(3)
      expect(a.project.photoId).toBe(a.asset.id)
      if (a.secondAsset) {
        expect(a.project.card!.secondPhotoId).toBe(a.secondAsset.id)
        expect(a.secondAsset.id).not.toBe(b.secondAsset!.id)
      }
      expect(a.title).toBe(`${snapshot.title}（导入）`)
      await saveWorkContent(a.id, { ...a.project, name: '只改导入作品' }, a.asset, a.secondAsset)
      expect((await getWork(original.id)).project).toEqual(original.project)
      expect((await getWork(b.id)).project.name).toBe(snapshot.project.name)
      expect(await listWorks()).toHaveLength(3)
      expect(await readActiveWorkId()).toBe(b.id)
    },
  )

  it('also backs up unsaved content that exceeds PNG text limits', async () => {
    const snapshot = birthday()
    snapshot.project.name = ''
    snapshot.project.wish = '祝'.repeat(250)
    expect((await readProjectFile(await exportProjectFile(snapshot))).project).toEqual(
      snapshot.project,
    )
  })

  it.each([
    [
      'file version',
      (value: any) => {
        value.version = 99
      },
      '版本不兼容',
    ],
    [
      'project version',
      (value: any) => {
        value.project.version = 99
      },
      '作品版本不兼容',
    ],
    [
      'template version',
      (value: any) => {
        value.templateVersions['center-stage'] = 99
      },
      '模板版本不兼容',
    ],
    [
      'missing template',
      (value: any) => {
        value.project.cropsByTemplate.uninstalled = value.project.cropsByTemplate['center-stage']
      },
      '尚未安装',
    ],
    [
      'missing manifest',
      (value: any) => {
        delete value.templateVersions
      },
      '损坏',
    ],
    [
      'missing photo',
      (value: any) => {
        value.assets = []
      },
      '损坏',
    ],
    [
      'wrong photo reference',
      (value: any) => {
        value.project.photoId = 'missing'
      },
      '损坏',
    ],
    [
      'invalid crop',
      (value: any) => {
        value.project.cropsByTemplate['center-stage'].avatar.zoom = 99
      },
      '损坏',
    ],
    [
      'invalid text override',
      (value: any) => {
        value.project.templateTexts['birthday-letter']['poster-kicker'].hidden = 'yes'
      },
      '损坏',
    ],
    [
      'unknown text field',
      (value: any) => {
        value.project.templateTexts['birthday-letter'].unknown = { text: 'x', hidden: false }
      },
      '文案与当前模板不兼容',
    ],
    [
      'invalid base64',
      (value: any) => {
        value.assets[0].data = '!'.repeat(value.assets[0].data.length)
      },
      '损坏',
    ],
    [
      'changed photo bytes',
      (value: any) => {
        value.assets[0].data = btoa('other-photo-bytes')
      },
      '损坏',
    ],
    [
      'incorrect dimensions',
      (value: any) => {
        value.assets[0].width = 500
      },
      '损坏',
    ],
  ])(
    'rejects %s before creating a work or changing the active pointer',
    async (_label, mutate, message) => {
      const original = await createWork(birthday().project, photo)
      const value = JSON.parse(await (await exportProjectFile(birthday())).text())
      mutate(value)
      await expect(importProjectFile(packed(value))).rejects.toThrow(message)
      expect(await listWorks()).toHaveLength(1)
      expect(await readActiveWorkId()).toBe(original.id)
      expect((await getWork(original.id)).project).toEqual(original.project)
    },
  )

  it('rejects empty, truncated, unrelated and oversized files', async () => {
    for (const file of [new Blob(), new Blob(['{"format":'])])
      await expect(readProjectFile(file)).rejects.toThrow('损坏')
    await expect(readProjectFile(packed({ format: 'png' }))).rejects.toThrow('不是星迹工程')
    const oversized = new Blob(['small'])
    Object.defineProperty(oversized, 'size', { value: MAX_PROJECT_FILE_BYTES + 1 })
    const read = vi.spyOn(oversized, 'text')
    await expect(readProjectFile(oversized)).rejects.toThrow('超过 100 MB')
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects a checksum-valid photo that cannot decode, without saving a partial work', async () => {
    const file = await exportProjectFile(card())
    vi.mocked(decodePhoto).mockRejectedValueOnce(new Error('图片无法读取'))
    await expect(importProjectFile(file)).rejects.toThrow('图片无法读取')
    expect(await listWorks()).toHaveLength(0)
    expect(await readActiveWorkId()).toBeNull()
  })

  it('rolls back failed imports and permits retry without touching existing works', async () => {
    const snapshot = card()
    const original = await createWork(snapshot.project, photo, snapshot.title, second)
    const file = await exportProjectFile(snapshot)
    const failure = new DOMException('Storage full', 'QuotaExceededError')
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw failure
    })
    await expect(importProjectFile(file)).rejects.toBe(failure)
    spy.mockRestore()
    expect(await listWorks()).toHaveLength(1)
    expect(await readActiveWorkId()).toBe(original.id)
    expect(await getWork(original.id)).toEqual(original)
    await importProjectFile(file)
    expect(await listWorks()).toHaveLength(2)
  })

  it('uses a safe local filename', () => {
    expect(projectFileName('纪念/照片:*?')).toBe('纪念_照片___.starloom')
    expect(projectFileName('...')).toBe('星迹作品.starloom')
  })

  it('explains when the browser cannot perform integrity checks', async () => {
    vi.stubGlobal('crypto', { subtle: undefined })
    await expect(exportProjectFile(birthday())).rejects.toThrow('需要安全连接')
    expect(await listWorks()).toHaveLength(0)
  })
})
