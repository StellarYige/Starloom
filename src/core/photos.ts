import type { PhotoAsset } from './types'
import { canvasBlob } from './render'
import { SAMPLE_PHOTO_ID } from './project'

export async function decodePhoto(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('这张图片无法读取。请使用完好的 JPG、PNG 或 WebP 图片。')
  }
}
export async function importPhoto(file: File): Promise<PhotoAsset> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请使用 JPG、PNG 或 WebP 图片。HEIC 图片请先转换为 JPG。')
  if (file.size > 30 * 1024 * 1024) throw new Error('图片超过 30 MB，请选择较小的文件。')
  const image = await decodePhoto(file)
  try {
    const ratio = Math.min(1, 4096 / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * ratio))
    const height = Math.max(1, Math.round(image.height * ratio))
    let blob: Blob
    if (ratio < 1) {
      const canvas = document.createElement('canvas')
      try {
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('图片处理失败，请重试。')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(image, 0, 0, width, height)
        blob = await canvasBlob(
          canvas,
          file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
          0.96,
        )
      } finally {
        canvas.width = 1
        canvas.height = 1
      }
    } else {
      // Own the bytes instead of retaining a File backed by an external/temp path.
      blob = new Blob([await file.arrayBuffer()], { type: file.type })
    }
    const id =
      crypto.randomUUID?.() ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    return {
      id,
      blob,
      name: file.name,
      width,
      height,
      originalWidth: image.width,
      originalHeight: image.height,
      sample: false,
    }
  } finally {
    image.close()
  }
}
export async function loadSample(): Promise<PhotoAsset> {
  const response = await fetch(`${import.meta.env.BASE_URL}assets/portrait.jpg`)
  if (!response.ok) throw new Error('示例照片未能加载，请刷新后重试。')
  const blob = await response.blob()
  const image = await decodePhoto(blob)
  const asset = {
    id: SAMPLE_PHOTO_ID,
    blob,
    name: '示例人像 · Aiony Haust',
    width: image.width,
    height: image.height,
    originalWidth: image.width,
    originalHeight: image.height,
    sample: true,
  }
  image.close()
  return asset
}
