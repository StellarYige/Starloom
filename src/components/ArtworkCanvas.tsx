import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { ArtworkFormat, Crop, PhotoSlot, ProjectState } from '../core/types'
import { dragCrop } from '../core/crop'
import { projectCrop } from '../core/project'
import { artworkLayout } from '../templates'
import { cardCrop } from '../core/photo-card'
import { photoFrame, prepareFonts, renderArtwork } from '../core/render'
import type { RenderResult } from '../core/render'

interface Props {
  project: ProjectState
  bitmap: ImageBitmap | null
  secondBitmap?: ImageBitmap | null
  format: ArtworkFormat
  activeSlot?: PhotoSlot
  onSelectSlot?: (slot: PhotoSlot) => void
  editable?: boolean
  safeArea?: boolean
  thumbnail?: boolean
  onCrop?: (crop: Crop, slot?: PhotoSlot) => void
  onCommit?: () => void
  onRender?: (format: ArtworkFormat, result: RenderResult | null, error?: string) => void
}
export function ArtworkCanvas({
  project,
  bitmap,
  secondBitmap,
  format,
  activeSlot = 'first',
  onSelectSlot,
  editable = false,
  safeArea = false,
  thumbnail = false,
  onCrop,
  onCommit,
  onRender,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [drawing, setDrawing] = useState(true)
  const gesture = useRef<{
    id: number
    x: number
    y: number
    crop: Crop
    ratio: number
    slot: PhotoSlot
  } | null>(null)
  const layout = artworkLayout(project, format)
  const label = format === 'card' ? '电子小卡' : format === 'avatar' ? '应援头像' : '生日贺图'

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(
        Math.max(
          1,
          Math.round(entry.contentRect.width * Math.min(window.devicePixelRatio || 1, 2)),
        ),
      ),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    onRender?.(format, null)
    if (!bitmap || !width || (format === 'card' && !secondBitmap)) {
      setDrawing(true)
      return
    }
    void prepareFonts(project)
      .then(() => {
        if (cancelled || !canvas.current) return
        const result = renderArtwork(canvas.current, project, bitmap, format, width, secondBitmap)
        setDrawing(false)
        onRender?.(format, result)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          onRender?.(
            format,
            null,
            e instanceof Error ? e.message : '字体或图片尚未准备好，请重试。',
          )
      })
    return () => {
      cancelled = true
    }
  }, [project, bitmap, secondBitmap, format, width, onRender])
  useEffect(() => {
    gesture.current = null
  }, [project.templateId, bitmap, secondBitmap, format])

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || !bitmap || event.button !== 0 || gesture.current || !container.current) return
    const bounds = container.current.getBoundingClientRect()
    const ratio = layout.width / bounds.width
    const x = (event.clientX - bounds.left) * ratio
    const y = (event.clientY - bounds.top) * ratio
    // Reverse paint order: the small overlapping print is the topmost photo in a collage.
    const frame = [...layout.layers]
      .reverse()
      .find(
        (layer) =>
          layer.type === 'photo' &&
          x >= layer.x &&
          x <= layer.x + layer.width &&
          y >= layer.y &&
          y <= layer.y + layer.height,
      )
    if (!frame || frame.type !== 'photo') return
    const slot = frame.slot ?? 'first'
    if (slot === 'second' && !secondBitmap) return
    if (format === 'card' && slot !== activeSlot) onSelectSlot?.(slot)
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop: format === 'card' ? cardCrop(project, slot) : projectCrop(project, format),
      ratio,
      slot,
    }
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    if (!start || !bitmap || event.pointerId !== start.id) return
    const photo = start.slot === 'second' ? secondBitmap : bitmap
    if (!photo) return
    onCrop?.(
      dragCrop(
        photo.width,
        photo.height,
        photoFrame(project, format, start.slot),
        start.crop,
        (event.clientX - start.x) * start.ratio,
        (event.clientY - start.y) * start.ratio,
      ),
      start.slot,
    )
  }
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    onCommit?.()
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !editable ||
      !bitmap ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    const photo = activeSlot === 'second' && format === 'card' ? secondBitmap : bitmap
    if (!photo) return
    const delta = event.shiftKey ? 24 : 6
    onCrop?.(
      dragCrop(
        photo.width,
        photo.height,
        photoFrame(project, format, activeSlot),
        format === 'card' ? cardCrop(project, activeSlot) : projectCrop(project, format),
        event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0,
        event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0,
      ),
      activeSlot,
    )
  }

  return (
    <div
      ref={container}
      className={`artwork ${editable ? 'is-editable' : ''} ${thumbnail ? 'is-thumbnail' : ''}`}
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
      tabIndex={editable ? 0 : undefined}
      role={editable ? 'group' : undefined}
      aria-label={
        editable
          ? `${format === 'card' ? `电子小卡照片 ${activeSlot === 'first' ? '1' : '2'}` : format === 'avatar' ? '头像照片' : '贺图照片'}裁切，拖动或使用方向键移动`
          : undefined
      }
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={pointerEnd}
      onKeyDown={keyDown}
      onKeyUp={onCommit}
    >
      <canvas ref={canvas} role="img" aria-label={`${label}${thumbnail ? '缩略图' : '实时预览'}`} />
      {editable &&
        format === 'card' &&
        (() => {
          const frame = photoFrame(project, format, activeSlot)
          return (
            <div
              className="photo-selection"
              aria-hidden="true"
              style={{
                left: `${(frame.x / layout.width) * 100}%`,
                top: `${(frame.y / layout.height) * 100}%`,
                width: `${(frame.width / layout.width) * 100}%`,
                height: `${(frame.height / layout.height) * 100}%`,
              }}
            >
              <span>{activeSlot === 'first' ? '1' : '2'}</span>
            </div>
          )
        })()}
      {drawing && (
        <div className="artwork-loading">
          <span className="loading-dot" />
          <span>正在准备作品</span>
        </div>
      )}
      {safeArea && format === 'avatar' && <div className="safe-area" aria-hidden="true" />}
    </div>
  )
}
