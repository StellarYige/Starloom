import { artworkTemplate } from '../templates'
import { createId, graphemes } from './project'
import { isPhotoCard } from './photo-card'
import { decodePhoto } from './photos'
import { createWork, isValidWork, validateTitle } from './storage'
import type { WorkRecord } from './storage'
import { isRecord, templateTextFields } from './template-text'
import type { PhotoAsset, ProjectState } from './types'

export type ProjectSnapshot = Pick<WorkRecord, 'title' | 'project' | 'asset' | 'secondAsset'>
export const MAX_PROJECT_FILE_BYTES = 100 * 1024 * 1024
const FORMAT = 'starloom-project'
const VERSION = 1
const invalid = () => new Error('工程文件已损坏或内容不完整，请重新导出后再导入。')

function templateVersions(project: ProjectState) {
  const crops = isPhotoCard(project) ? project.card.cropsByLayout : project.cropsByTemplate
  const ids = new Set([
    project.templateId,
    ...Object.keys(crops),
    ...Object.keys(project.templateTexts ?? {}),
  ])
  return Object.fromEntries(
    Array.from(ids, (templateId) => {
      const state = { ...project, templateId }
      let template
      try {
        template = artworkTemplate(state)
      } catch {
        throw new Error('工程使用的模板或布局尚未安装，无法导入。请使用支持该模板的星迹版本。')
      }
      const fields = new Set(templateTextFields(state).map((field) => field.id))
      if (Object.keys(project.templateTexts?.[templateId] ?? {}).some((id) => !fields.has(id)))
        throw new Error('工程中的装饰文案与当前模板不兼容，请使用匹配的星迹版本。')
      return [templateId, template.version]
    }),
  )
}

function validateSnapshot(snapshot: ProjectSnapshot) {
  if (!isRecord(snapshot.project)) throw invalid()
  if (snapshot.project.version !== 2 && snapshot.project.version !== 3)
    throw new Error('工程中的作品版本不兼容，请使用支持该版本的星迹。')
  if (typeof snapshot.title !== 'string') throw invalid()
  validateTitle(snapshot.title)
  if (
    !isValidWork({
      ...snapshot,
      schemaVersion: snapshot.project.version,
      id: 'project-file',
      createdAt: 0,
      updatedAt: 0,
      revision: 1,
      thumbnail: null,
      thumbnailRevision: 0,
    })
  )
    throw invalid()
  return templateVersions(snapshot.project)
}

async function digest(bytes: ArrayBuffer) {
  if (!crypto.subtle)
    throw new Error('工程完整性校验需要安全连接，请使用 HTTPS 或本机 localhost / 127.0.0.1 地址。')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function checkPhoto(asset: PhotoAsset) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.blob.type)) throw invalid()
  const bitmap = await decodePhoto(asset.blob)
  try {
    if (bitmap.width !== asset.width || bitmap.height !== asset.height) throw invalid()
  } finally {
    bitmap.close()
  }
}

async function encodeAsset(asset: PhotoAsset) {
  await checkPhoto(asset)
  const bytes = await asset.blob.arrayBuffer()
  const array = new Uint8Array(bytes)
  const chunks: string[] = []
  // Chunking avoids spreading a whole photo onto the JavaScript call stack.
  for (let offset = 0; offset < array.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...array.subarray(offset, offset + 0x8000)))
  const { blob, ...metadata } = asset
  return {
    ...metadata,
    type: blob.type,
    size: blob.size,
    sha256: await digest(bytes),
    data: btoa(chunks.join('')),
  }
}

async function decodeAsset(value: unknown): Promise<PhotoAsset> {
  if (
    !isRecord(value) ||
    typeof value.data !== 'string' ||
    typeof value.type !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(value.type) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    value.size > MAX_PROJECT_FILE_BYTES ||
    value.data.length !== 4 * Math.ceil(value.size / 3) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    typeof value.sample !== 'boolean' ||
    ![value.width, value.height, value.originalWidth, value.originalHeight].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0,
    )
  )
    throw invalid()
  const binary = atob(value.data)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (bytes.length !== value.size || (await digest(bytes.buffer)) !== value.sha256) throw invalid()
  return {
    id: value.id,
    name: value.name,
    sample: value.sample,
    width: value.width as number,
    height: value.height as number,
    originalWidth: value.originalWidth as number,
    originalHeight: value.originalHeight as number,
    blob: new Blob([bytes], { type: value.type }),
  }
}

/** A portable file owns the photo bytes; no URLs, database IDs or thumbnails are required. */
export async function exportProjectFile(source: ProjectSnapshot): Promise<Blob> {
  const snapshot = { ...source, project: structuredClone(source.project) }
  const versions = validateSnapshot(snapshot)
  const photos = [snapshot.asset, ...(snapshot.secondAsset ? [snapshot.secondAsset] : [])]
  if (
    photos.reduce((sum, photo) => sum + 4 * Math.ceil(photo.blob.size / 3), 0) >
    MAX_PROJECT_FILE_BYTES
  )
    throw new Error('工程文件超过 100 MB，无法导出。请先使用较小的照片。')
  const assets = []
  for (const photo of photos) assets.push(await encodeAsset(photo))
  const file = new Blob(
    [
      JSON.stringify({
        format: FORMAT,
        version: VERSION,
        title: snapshot.title,
        project: snapshot.project,
        templateVersions: versions,
        assets,
      }),
    ],
    { type: 'application/json' },
  )
  if (file.size > MAX_PROJECT_FILE_BYTES)
    throw new Error('工程文件超过 100 MB，无法导出。请先使用较小的照片。')
  return file
}

export async function readProjectFile(file: Blob): Promise<ProjectSnapshot> {
  if (!file.size) throw invalid()
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('工程文件超过 100 MB，无法导入。')
  let value: unknown
  try {
    value = JSON.parse(await file.text())
  } catch {
    throw invalid()
  }
  if (!isRecord(value) || value.format !== FORMAT)
    throw new Error('这不是星迹工程文件，请选择导出的 .starloom 文件；PNG 无法恢复编辑内容。')
  if (!Number.isInteger(value.version)) throw invalid()
  if (value.version !== VERSION) throw new Error('工程文件版本不兼容，请使用支持该版本的星迹。')
  if (!isRecord(value.project)) throw invalid()
  if (value.project.version !== 2 && value.project.version !== 3)
    throw new Error('工程中的作品版本不兼容，请使用支持该版本的星迹。')
  if (!Array.isArray(value.assets) || value.assets.length !== (value.project.version === 3 ? 2 : 1))
    throw invalid()
  const asset = await decodeAsset(value.assets[0])
  const secondAsset = value.assets.length === 2 ? await decodeAsset(value.assets[1]) : undefined
  const snapshot: ProjectSnapshot = {
    title: value.title as string,
    project: value.project as unknown as ProjectState,
    asset,
    ...(secondAsset ? { secondAsset } : {}),
  }
  const versions = validateSnapshot(snapshot)
  if (
    !isRecord(value.templateVersions) ||
    Object.keys(value.templateVersions).length !== Object.keys(versions).length
  )
    throw invalid()
  for (const [id, version] of Object.entries(versions)) {
    if (!Object.hasOwn(value.templateVersions, id) || !Number.isInteger(value.templateVersions[id]))
      throw invalid()
    if (value.templateVersions[id] !== version)
      throw new Error('工程中的模板版本不兼容，请使用匹配的星迹版本。')
  }
  // Validate every photo before any database write, including apparently valid but undecodable bytes.
  await checkPhoto(asset)
  if (secondAsset) await checkPhoto(secondAsset)
  return snapshot
}

export async function importProjectFile(file: Blob): Promise<WorkRecord> {
  const source = await readProjectFile(file)
  const project = structuredClone(source.project)
  const asset = { ...source.asset, id: createId() }
  const secondAsset = source.secondAsset ? { ...source.secondAsset, id: createId() } : undefined
  project.photoId = asset.id
  if (isPhotoCard(project) && secondAsset) project.card.secondPhotoId = secondAsset.id
  // createWork uses add, assigns a new work ID and commits both photos with the active pointer.
  return createWork(
    project,
    asset,
    graphemes(source.title.trim()).slice(0, 56).join('') + '（导入）',
    secondAsset,
  )
}

export function projectFileName(title: string) {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '')
  return `${graphemes(safe).slice(0, 60).join('') || '星迹作品'}.starloom`
}
