import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoAsset, PhotoSlot, ProjectState } from '../core/types'
import { replacePhoto } from '../core/project'
import { isPhotoCard, photoIds, replaceCardPhoto } from '../core/photo-card'
import { historyReducer, initialHistory } from '../core/history'
import type { HistoryAction } from '../core/history'
import { decodePhoto, importPhoto } from '../core/photos'
import { saveWorkContent } from '../core/storage'
import type { WorkRecord } from '../core/storage'
import { refreshThumbnail } from '../core/thumbnail'

function usePhotoBitmap(asset: PhotoAsset | undefined, onError: (error: string) => void) {
  const [resource, setResource] = useState<{ id: string; bitmap: ImageBitmap } | null>(null)
  useEffect(() => {
    if (!asset) return
    let cancelled = false
    let image: ImageBitmap | null = null
    void decodePhoto(asset.blob)
      .then((bitmap) => {
        image = bitmap
        if (cancelled) bitmap.close()
        else setResource({ id: asset.id, bitmap })
      })
      .catch((error: unknown) => {
        if (!cancelled)
          onError(error instanceof Error ? error.message : '照片无法读取，请换一张试试。')
      })
    return () => {
      cancelled = true
      image?.close()
    }
  }, [asset, onError])
  return resource?.id === asset?.id && resource?.bitmap.width ? resource.bitmap : null
}

/** One mount is one work session. IDs never come from mutable navigation state. */
export function useEditor(work: WorkRecord, onSaved: () => void, temporary = false) {
  const [history, setHistory] = useState(() => initialHistory(work.project))
  const historyRef = useRef(history)
  const assets = useRef(
    new Map<string, PhotoAsset>(
      [work.asset, ...(work.secondAsset ? [work.secondAsset] : [])].map((asset) => [
        asset.id,
        asset,
      ]),
    ),
  )
  const [saveStatus, setSaveStatus] = useState(
    temporary ? '保存失败 · 临时制作仍可导出' : '已保存到本机',
  )
  const [savedAt, setSavedAt] = useState<number | null>(temporary ? null : work.updatedAt)
  const [saveDetail, setSaveDetail] = useState(
    temporary ? '临时制作没有保存能力。请下载成品后再关闭页面。' : '',
  )
  const contentVersion = useRef(0)
  const dirty = useRef(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [uploads, setUploads] = useState({ first: false, second: false })
  const importing = uploads.first || uploads.second
  const [transitioning, setTransitioning] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const leaveDecision = useRef<((discard: boolean) => void) | null>(null)
  const decideLeave = useCallback((discard: boolean) => {
    const resolve = leaveDecision.current
    leaveDecision.current = null
    setConfirmingLeave(false)
    resolve?.(discard)
  }, [])
  const project = history.present
  const asset = assets.current.get(project.photoId)
  const secondAsset = isPhotoCard(project)
    ? assets.current.get(project.card.secondPhotoId)
    : undefined
  const bitmap = usePhotoBitmap(asset, setError)
  const secondBitmap = usePhotoBitmap(secondAsset, setError)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const saveSequence = useRef(0)
  const uploadSequence = useRef({ first: 0, second: 0 })
  const uploadPending = useRef({ first: false, second: false })
  const alive = useRef(true)
  const savedCallback = useRef(onSaved)
  savedCallback.current = onSaved
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      leaveDecision.current?.(false)
      leaveDecision.current = null
      ++uploadSequence.current.first
      ++uploadSequence.current.second
    }
  }, [])

  const dispatch = useCallback(
    (action: HistoryAction<ProjectState>) => {
      const next = historyReducer(historyRef.current, action)
      if (next.present !== historyRef.current.present) {
        ++contentVersion.current
        dirty.current = true
        // Invalidate synchronously: an earlier commit must never label a newer edit as saved.
        if (!temporary) {
          setSaveStatus('等待保存…')
          setSaveDetail('')
        }
      }
      historyRef.current = next
      setHistory(next)
    },
    [temporary],
  )

  const saveNow = useCallback((): Promise<boolean> => {
    const snapshot = structuredClone(historyRef.current.present)
    const photo = assets.current.get(snapshot.photoId)
    const secondPhoto = isPhotoCard(snapshot)
      ? assets.current.get(snapshot.card.secondPhotoId)
      : undefined
    if (temporary || !photo || (isPhotoCard(snapshot) && !secondPhoto))
      return Promise.resolve(false)
    const sequence = ++saveSequence.current
    const version = contentVersion.current
    if (alive.current) setSaveStatus('正在保存…')
    const task = queue.current
      .catch(() => undefined)
      .then(() => saveWorkContent(work.id, snapshot, photo, secondPhoto))
    queue.current = task
    return task
      .then((saved) => {
        if (
          alive.current &&
          sequence === saveSequence.current &&
          version === contentVersion.current
        ) {
          dirty.current = false
          setSaveStatus('已保存到本机')
          setSavedAt(Date.now())
          setSaveDetail('')
        }
        savedCallback.current()
        void refreshThumbnail(saved)
          .then((changed) => {
            if (changed) savedCallback.current()
          })
          .catch(() => undefined)
        return true
      })
      .catch((error: unknown) => {
        if (
          alive.current &&
          sequence === saveSequence.current &&
          version === contentVersion.current
        ) {
          setSaveStatus('保存失败 · 仍可导出')
          dirty.current = true
          setSaveDetail(
            error instanceof Error && error.name === 'QuotaExceededError'
              ? '本地存储空间不足，当前修改还未保存。请先导出成品，再释放浏览器或设备空间并重试；不要清理本站数据。'
              : `${error instanceof Error ? error.message : '浏览器未完成保存。'} 当前修改还未保存，请保持页面打开，重试保存或先导出成品。`,
          )
        }
        return false
      })
  }, [work.id, temporary])

  useEffect(() => {
    if (temporary || transitioning) return
    const timer = window.setTimeout(() => {
      void saveNow()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [project, asset, secondAsset, temporary, transitioning, saveNow])
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveNow()
    }
    const pagehide = () => {
      void saveNow()
    }
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !uploadPending.current.first && !uploadPending.current.second) return
      event.preventDefault()
      event.returnValue = ''
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('beforeunload', beforeunload)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('beforeunload', beforeunload)
    }
  }, [saveNow])
  useEffect(() => {
    const retained = new Set(
      [...history.past, history.present, ...history.future].flatMap(photoIds),
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
    async (file: File, slot: PhotoSlot = 'first') => {
      const sequence = ++uploadSequence.current[slot]
      uploadPending.current[slot] = true
      setUploads((previous) => ({ ...previous, [slot]: true }))
      setError('')
      try {
        const next = await importPhoto(file)
        if (!alive.current || sequence !== uploadSequence.current[slot]) return
        assets.current.set(next.id, next)
        change((previous) =>
          isPhotoCard(previous)
            ? replaceCardPhoto(previous, next.id, slot)
            : replacePhoto(previous, next.id),
        )
        setNotice(
          Math.max(next.originalWidth, next.originalHeight) > 4096
            ? '已在本机生成 4096px 工作副本，原文件保持不变。'
            : isPhotoCard(historyRef.current.present)
              ? `照片 ${slot === 'first' ? '1' : '2'} 已换图，该照片在各布局中重新居中；另一张保留原位。`
              : '照片已放入，各主题的裁切已重新居中，可分别调整。',
        )
      } catch (e) {
        if (alive.current && sequence === uploadSequence.current[slot])
          setError(e instanceof Error ? e.message : '图片读取失败，请重试。')
      } finally {
        if (alive.current && sequence === uploadSequence.current[slot]) {
          uploadPending.current[slot] = false
          setUploads((previous) => ({ ...previous, [slot]: false }))
        }
      }
    },
    [change],
  )
  const prepareLeave = useCallback(async () => {
    if (temporary) {
      if (leaveDecision.current) return false
      const discard = await new Promise<boolean>((resolve) => {
        leaveDecision.current = resolve
        setConfirmingLeave(true)
      })
      // Cancelling must also preserve any photo import already in progress.
      if (!discard || !alive.current) return false
    }
    ++uploadSequence.current.first
    ++uploadSequence.current.second
    uploadPending.current = { first: false, second: false }
    setUploads({ first: false, second: false })
    setTransitioning(true)
    dispatch({ type: 'seal' })
    const saved = temporary || (await saveNow())
    if (alive.current) {
      setTransitioning(false)
      if (!saved)
        setError('当前修改尚未保存，已为你留在这份作品。可以继续编辑、重试保存或先导出图片。')
    }
    return saved
  }, [dispatch, saveNow, temporary])
  return {
    project,
    asset,
    secondAsset,
    bitmap,
    secondBitmap,
    ready: true,
    importing,
    transitioning,
    saveStatus,
    savedAt,
    saveDetail,
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
    confirmingLeave,
    decideLeave,
    storageAllowed: !temporary,
  }
}
