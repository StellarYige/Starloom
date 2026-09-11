import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Crop, Format, ProjectState } from '../core/types'
import { dragCrop } from '../core/crop'
import { projectCrop } from '../core/project'
import { getTemplate } from '../templates'
import { photoFrame, prepareFonts, renderArtwork } from '../core/render'
import type { RenderResult } from '../core/render'

interface Props {
  project: ProjectState
  bitmap: ImageBitmap | null
  format: Format
  editable?: boolean
  safeArea?: boolean
  thumbnail?: boolean
  onCrop?: (crop: Crop) => void
  onCommit?: () => void
  onRender?: (format: Format, result: RenderResult | null, error?: string) => void
}
export function ArtworkCanvas({
  project,
  bitmap,
  format,
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
  const gesture = useRef<{ id: number; x: number; y: number; crop: Crop; ratio: number } | null>(
    null,
  )
  const layout = getTemplate(project.templateId).layouts[format]

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
    if (!bitmap || !width) {
      setDrawing(true)
      return
    }
    onRender?.(format, null)
    void prepareFonts(project)
      .then(() => {
        if (cancelled || !canvas.current) return
        const result = renderArtwork(canvas.current, project, bitmap, format, width)
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
  }, [project, bitmap, format, width, onRender])

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || !bitmap || event.button !== 0 || gesture.current || !container.current) return
    const bounds = container.current.getBoundingClientRect()
    const ratio = layout.width / bounds.width
    const frame = photoFrame(project, format)
    const x = (event.clientX - bounds.left) * ratio
    const y = (event.clientY - bounds.top) * ratio
    if (x < frame.x || x > frame.x + frame.width || y < frame.y || y > frame.y + frame.height)
      return
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop: projectCrop(project, format),
      ratio,
    }
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    if (!start || !bitmap || event.pointerId !== start.id) return
    onCrop?.(
      dragCrop(
        bitmap.width,
        bitmap.height,
        photoFrame(project, format),
        start.crop,
        (event.clientX - start.x) * start.ratio,
        (event.clientY - start.y) * start.ratio,
      ),
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
    const delta = event.shiftKey ? 24 : 6
    onCrop?.(
      dragCrop(
        bitmap.width,
        bitmap.height,
        photoFrame(project, format),
        projectCrop(project, format),
        event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0,
        event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0,
      ),
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
          ? `${format === 'avatar' ? '头像' : '贺图'}照片裁切，拖动或使用方向键移动`
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
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${format === 'avatar' ? '应援头像' : '生日贺图'}${thumbnail ? '缩略图' : '实时预览'}`}
      />
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
