import { artworkLayout, artworkTemplate, getTemplate } from '../templates'
import type { ArtworkFormat, PhotoSlot, ProjectState, TextLayer } from './types'
import { cardCrop, isPhotoCard } from './photo-card'
import { palette } from './color'
import { cropGeometry } from './crop'
import { birthdayText, graphemes, projectCrop } from './project'
import { fitText } from './text'

export const fontFamily = {
  sans: '"Noto Sans SC", sans-serif',
  serif: '"Cormorant Garamond", "Noto Sans SC", serif',
}
export function textContent(layer: TextLayer, project: ProjectState) {
  if (typeof layer.content === 'object') {
    const value = project.templateTexts?.[project.templateId]?.[layer.content.id]
    return value?.hidden ? '' : (value?.text ?? layer.content.literal)
  }
  return layer.content === 'birthday'
    ? birthdayText(project)
    : layer.content === 'date'
      ? (project.card?.date ?? '').replaceAll('-', '.')
      : project[layer.content]
}
function fontSpec(layer: TextLayer, size = layer.size) {
  return `${layer.italic ? 'italic ' : ''}${layer.weight ?? (layer.font === 'serif' ? 500 : 400)} ${size}px ${fontFamily[layer.font]}`
}
const fontLoads = new Map<string, Promise<unknown>>()
export async function prepareFonts(project: ProjectState) {
  const layouts = isPhotoCard(project)
    ? [artworkLayout(project, 'card')]
    : Object.values(getTemplate(project.templateId).layouts)
  const layers = layouts
    .flatMap((layout) => layout.layers)
    .filter((layer): layer is TextLayer => layer.type === 'text')
  await Promise.all(
    layers.map((layer) => {
      const text = textContent(layer, project)
      if (!text) return
      const spec = fontSpec(layer)
      const key = `${spec}:${text}`
      if (!fontLoads.has(key)) {
        if (fontLoads.size > 160) fontLoads.clear()
        const load = document.fonts.load(spec, text).catch((error) => {
          fontLoads.delete(key)
          throw error
        })
        fontLoads.set(key, load)
      }
      return fontLoads.get(key)
    }),
  )
}
export function photoFrame(
  project: ProjectState,
  format: ArtworkFormat,
  slot: PhotoSlot = 'first',
) {
  const frame = artworkLayout(project, format).layers.find(
    (layer) => layer.type === 'photo' && (layer.slot ?? 'first') === slot,
  )
  if (!frame || frame.type !== 'photo') throw new Error('主题缺少照片区域。')
  return frame
}
export interface RenderResult {
  issues: string[]
  lowResolution: boolean
}

/** This is the only artwork renderer. Both UI canvases and exported PNGs call it. */
export function renderArtwork(
  canvas: HTMLCanvasElement,
  project: ProjectState,
  bitmap: ImageBitmap,
  format: ArtworkFormat,
  width: number,
  secondBitmap?: ImageBitmap | null,
): RenderResult {
  const layout = artworkLayout(project, format)
  if (isPhotoCard(project) && !secondBitmap) throw new Error('第二张照片尚未准备好，请重试或换图。')
  const height = Math.round((width * layout.height) / layout.width)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器无法创建绘图区域，请刷新后重试。')
  const colors = palette(project.color, artworkTemplate(project).colorMode)
  ctx.setTransform(width / layout.width, 0, 0, width / layout.width, 0, 0)
  ctx.clearRect(0, 0, layout.width, layout.height)
  ctx.fillStyle = colors.paper
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const issues: string[] = []
  let lowResolution = false
  for (const layer of layout.layers) {
    if (layer.decoration && !project.decorations[layer.decoration]) continue
    ctx.save()
    if (layer.type === 'photo') {
      const photo = layer.slot === 'second' ? secondBitmap! : bitmap
      ctx.beginPath()
      ctx.roundRect(layer.x, layer.y, layer.width, layer.height, layer.radius ?? 0)
      ctx.clip()
      const crop = cropGeometry(
        photo.width,
        photo.height,
        layer,
        format === 'card' ? cardCrop(project, layer.slot ?? 'first') : projectCrop(project, format),
      )
      // Transparent uploads sit on the same paper as the rest of the composition.
      ctx.fillStyle = colors.paper
      ctx.fillRect(layer.x, layer.y, layer.width, layer.height)
      ctx.drawImage(
        photo,
        crop.sourceX,
        crop.sourceY,
        crop.sourceWidth,
        crop.sourceHeight,
        layer.x,
        layer.y,
        layer.width,
        layer.height,
      )
      lowResolution ||=
        crop.sourceWidth < ((layer.width * layout.exportWidth) / layout.width) * 0.75 ||
        crop.sourceHeight < ((layer.height * layout.exportHeight) / layout.height) * 0.75
    } else if (layer.type === 'rect') {
      ctx.globalAlpha = layer.opacity ?? 1
      ctx.beginPath()
      ctx.roundRect(layer.x, layer.y, layer.width, layer.height, layer.radius ?? 0)
      if (layer.stroke) {
        ctx.strokeStyle = colors[layer.color]
        ctx.lineWidth = layer.lineWidth ?? 1
        ctx.stroke()
      } else {
        ctx.fillStyle = colors[layer.color]
        ctx.fill()
      }
    } else if (layer.type === 'line') {
      ctx.beginPath()
      ctx.moveTo(layer.x, layer.y)
      ctx.lineTo(layer.x2, layer.y2)
      ctx.strokeStyle = colors[layer.color]
      ctx.lineWidth = layer.lineWidth ?? 1
      ctx.stroke()
    } else if (layer.type === 'sparkle') {
      const { x, y, size } = layer
      ctx.beginPath()
      ctx.moveTo(x, y - size)
      ctx.quadraticCurveTo(x + size * 0.13, y - size * 0.13, x + size, y)
      ctx.quadraticCurveTo(x + size * 0.13, y + size * 0.13, x, y + size)
      ctx.quadraticCurveTo(x - size * 0.13, y + size * 0.13, x - size, y)
      ctx.quadraticCurveTo(x - size * 0.13, y - size * 0.13, x, y - size)
      ctx.fillStyle = colors[layer.color]
      ctx.fill()
    } else {
      const text = textContent(layer, project)
      if (!text) {
        ctx.restore()
        continue
      }
      const measure = (line: string, size: number) => {
        ctx.font = fontSpec(layer, size)
        return (
          ctx.measureText(line).width +
          Math.max(0, graphemes(line).length - 1) * (layer.tracking ?? 0)
        )
      }
      const fit = fitText(
        text,
        layer.width,
        layer.height,
        layer.size,
        layer.minSize ?? layer.size,
        layer.lineHeight ?? 1.1,
        layer.maxLines ?? 1,
        measure,
      )
      if (fit.overflow)
        issues.push(
          `${layer.content === 'name' ? '姓名' : layer.content === 'wish' ? (format === 'card' ? '短句' : '祝福语') : typeof layer.content === 'object' ? '装饰文案' : '文字'}在${format === 'avatar' ? '头像' : format === 'card' ? '小卡' : '贺图'}中放不下，请缩短内容或减少换行。`,
        )
      ctx.font = fontSpec(layer, fit.size)
      ctx.fillStyle = colors[layer.color]
      ctx.textBaseline = 'alphabetic'
      ctx.beginPath()
      ctx.rect(layer.x, layer.y, layer.width, layer.height)
      ctx.clip()
      const top =
        layer.vertical === 'center'
          ? layer.y + Math.max(0, (layer.height - fit.lines.length * fit.lineHeight) / 2)
          : layer.y
      // Alphabetic baseline is fixed in template units, independent of render resolution.
      for (let i = 0; i < fit.lines.length; i++) {
        const line = fit.lines[i]
        const lineWidth = measure(line, fit.size)
        let x =
          layer.x +
          (layer.align === 'center'
            ? (layer.width - lineWidth) / 2
            : layer.align === 'right'
              ? layer.width - lineWidth
              : 0)
        const y = top + i * fit.lineHeight + fit.size * 0.86
        if (layer.tracking) {
          for (const char of graphemes(line)) {
            ctx.fillText(char, x, y)
            x += ctx.measureText(char).width + layer.tracking
          }
        } else ctx.fillText(line, x, y)
      }
    }
    ctx.restore()
  }
  return { issues: [...new Set(issues)], lowResolution }
}
export const canvasBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('图片生成失败，可能是设备内存不足，请重试。')),
      type,
      quality,
    ),
  )
export async function exportArtwork(
  project: ProjectState,
  bitmap: ImageBitmap,
  format: ArtworkFormat,
  secondBitmap?: ImageBitmap,
) {
  await prepareFonts(project)
  const canvas = document.createElement('canvas')
  try {
    const result = renderArtwork(
      canvas,
      project,
      bitmap,
      format,
      artworkLayout(project, format).exportWidth,
      secondBitmap,
    )
    if (result.issues.length) throw new Error(result.issues.join('\n'))
    return await canvasBlob(canvas)
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}
