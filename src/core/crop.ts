import type { Crop, Rect } from './types'

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export function cropGeometry(width: number, height: number, frame: Rect, crop: Crop) {
  const zoom = clamp(crop.zoom, 1, 4)
  const scale = Math.max(frame.width / width, frame.height / height) * zoom
  const sourceWidth = frame.width / scale
  const sourceHeight = frame.height / scale
  const sourceX = clamp(crop.x * width - sourceWidth / 2, 0, width - sourceWidth)
  const sourceY = clamp(crop.y * height - sourceHeight / 2, 0, height - sourceHeight)
  return { sourceX, sourceY, sourceWidth, sourceHeight, scale }
}
export function normalizeCrop(width: number, height: number, frame: Rect, crop: Crop): Crop {
  const geometry = cropGeometry(width, height, frame, crop)
  return {
    x: (geometry.sourceX + geometry.sourceWidth / 2) / width,
    y: (geometry.sourceY + geometry.sourceHeight / 2) / height,
    zoom: clamp(crop.zoom, 1, 4),
  }
}
export function dragCrop(
  width: number,
  height: number,
  frame: Rect,
  start: Crop,
  dx: number,
  dy: number,
) {
  const normalized = normalizeCrop(width, height, frame, start)
  const { scale } = cropGeometry(width, height, frame, normalized)
  return normalizeCrop(width, height, frame, {
    ...normalized,
    x: normalized.x - dx / scale / width,
    y: normalized.y - dy / scale / height,
  })
}
