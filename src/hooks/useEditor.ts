import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoAsset, ProjectState } from '../core/types'
import { replacePhoto } from '../core/project'
import { historyReducer, initialHistory } from '../core/history'
import type { HistoryAction } from '../core/history'
import { decodePhoto, importPhoto } from '../core/photos'
import { saveWorkContent } from '../core/storage'
import type { WorkRecord } from '../core/storage'
import { refreshThumbnail } from '../core/thumbnail'

/** One mount is one work session. IDs never come from mutable navigation state. */
export function useEditor(work: WorkRecord, onSaved: () => void, temporary = false) {
  const [history, setHistory] = useState(() => initialHistory(work.project))
  const historyRef = useRef(history)
  const assets = useRef(new Map<string, PhotoAsset>([[work.asset.id, work.asset]]))
  const [saveStatus, setSaveStatus] = useState(
    temporary ? '保存失败 · 临时制作仍可导出' : '作品已恢复',
  )
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [resource, setResource] = useState<{ id: string; bitmap: ImageBitmap } | null>(null)
  const project = history.present
  const asset = assets.current.get(project.photoId)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const saveSequence = useRef(0)
  const uploadSequence = useRef(0)
  const alive = useRef(true)
  const savedCallback = useRef(onSaved)
  savedCallback.current = onSaved
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      ++uploadSequence.current
    }
  }, [])

  const dispatch = useCallback((action: HistoryAction<ProjectState>) => {
    const next = historyReducer(historyRef.current, action)
    historyRef.current = next
    setHistory(next)
  }, [])
  useEffect(() => {
    if (!asset) return
    let cancelled = false
    let image: ImageBitmap | null = null
    setError('')
    void decodePhoto(asset.blob)
      .then((bitmap) => {
        image = bitmap
        if (cancelled) bitmap.close()
        else setResource({ id: asset.id, bitmap })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '照片无法读取，请换一张试试。')
      })
    return () => {
      cancelled = true
      image?.close()
    }
  }, [asset])

  const saveNow = useCallback((): Promise<boolean> => {
    const snapshot = structuredClone(historyRef.current.present)
    const photo = assets.current.get(snapshot.photoId)
    if (temporary || !photo) return Promise.resolve(false)
    const sequence = ++saveSequence.current
    if (alive.current) setSaveStatus('正在保存…')
    const task = queue.current
      .catch(() => undefined)
      .then(() => saveWorkContent(work.id, snapshot, photo))
    queue.current = task
    return task
      .then((saved) => {
        if (alive.current && sequence === saveSequence.current) setSaveStatus('已保存到本机')
        savedCallback.current()
        void refreshThumbnail(saved)
          .then((changed) => {
            if (changed) savedCallback.current()
          })
          .catch(() => undefined)
        return true
      })
      .catch(() => {
        if (alive.current && sequence === saveSequence.current) setSaveStatus('保存失败 · 仍可导出')
        return false
      })
  }, [work.id, temporary])

  useEffect(() => {
    if (temporary || transitioning) return
    setSaveStatus('等待保存…')
    const timer = window.setTimeout(() => {
      void saveNow()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [project, asset, temporary, transitioning, saveNow])
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveNow()
    }
    const pagehide = () => {
      void saveNow()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', pagehide)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', pagehide)
    }
  }, [saveNow])
  useEffect(() => {
    const retained = new Set(
      [...history.past, history.present, ...history.future].map((p) => p.photoId),
    )
    for (const id of assets.current.keys()) if (!retained.has(id)) assets.current.delete(id)
  }, [history])
  const change = useCallback(
    (update: (previous: ProjectState) => ProjectState, group?: string) => {
      dispatch({ type: 'change', value: update(historyRef.current.present), group })
    },
    [dispatch],
  )
  const seal = useCallback(() => {
    dispatch({ type: 'seal' })
    void saveNow()
  }, [dispatch, saveNow])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [dispatch])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [dispatch])
  const upload = useCallback(
    async (file: File) => {
      const sequence = ++uploadSequence.current
      setImporting(true)
      setError('')
      try {
        const next = await importPhoto(file)
        if (!alive.current || sequence !== uploadSequence.current) return
        assets.current.set(next.id, next)
        change((previous) => replacePhoto(previous, next.id))
        setNotice(
          Math.max(next.originalWidth, next.originalHeight) > 4096
            ? '已在本机生成 4096px 工作副本，原文件保持不变。'
            : '照片已放入，各主题的裁切已重新居中，可分别调整。',
        )
      } catch (e) {
        if (alive.current && sequence === uploadSequence.current)
          setError(e instanceof Error ? e.message : '图片读取失败，请重试。')
      } finally {
        if (alive.current && sequence === uploadSequence.current) setImporting(false)
      }
    },
    [change],
  )
  const prepareLeave = useCallback(async () => {
    ++uploadSequence.current
    setImporting(false)
    setTransitioning(true)
    dispatch({ type: 'seal' })
    const saved = await saveNow()
    if (alive.current) {
      setTransitioning(false)
      if (!saved)
        setError('当前修改尚未保存，已为你留在这份作品。可以继续编辑、重试保存或先导出图片。')
    }
    return saved
  }, [dispatch, saveNow])
  return {
    project,
    asset,
    bitmap: resource?.id === project.photoId ? resource.bitmap : null,
    ready: true,
    importing,
    transitioning,
    saveStatus,
    notice,
    setNotice,
    error,
    setError,
    change,
    seal,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    upload,
    saveNow,
    prepareLeave,
    storageAllowed: !temporary,
  }
}
