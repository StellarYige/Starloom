import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoAsset, ProjectState } from '../core/types'
import { createProject } from '../core/project'
import { historyReducer, initialHistory } from '../core/history'
import { decodePhoto, importPhoto, loadSample } from '../core/photos'
import { readDraft, writeDraft } from '../core/storage'

export function useEditor() {
  const [history, setHistory] = useState(() => initialHistory(createProject()))
  const assets = useRef(new Map<string, PhotoAsset>())
  const [ready, setReady] = useState(false)
  const [storageAllowed, setStorageAllowed] = useState(false)
  const [saveStatus, setSaveStatus] = useState('正在读取草稿')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [resource, setResource] = useState<{ id: string; bitmap: ImageBitmap } | null>(null)
  const project = history.present
  const asset = assets.current.get(project.photoId)
  const latest = useRef({ project, asset, ready, storageAllowed })
  latest.current = { project, asset, ready, storageAllowed }
  const queue = useRef<Promise<void>>(Promise.resolve())
  const saveSequence = useRef(0)
  const uploadSequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let storageOk = true
      try {
        let draft = null
        try {
          draft = await readDraft()
        } catch (e) {
          storageOk = false
          if (!cancelled) {
            setSaveStatus('草稿暂不可用')
            setNotice(e instanceof Error ? e.message : '本地存储暂不可用，仍可制作和导出。')
          }
        }
        const initialAsset = draft?.asset ?? (await loadSample())
        if (cancelled) return
        assets.current.set(initialAsset.id, initialAsset)
        if (draft) {
          setHistory(initialHistory(draft.project))
          setNotice('上次的心意已回来，接着创作吧。')
        }
        setStorageAllowed(storageOk)
        setReady(true)
        if (storageOk) setSaveStatus(draft ? '草稿已恢复' : '已准备好')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '创作空间未能加载，请刷新重试。')
      }
    })()
    return () => {
      cancelled = true
    }
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

  const saveNow = useCallback(() => {
    const snapshot = latest.current
    if (!snapshot.ready || !snapshot.storageAllowed || !snapshot.asset) return
    const sequence = ++saveSequence.current
    setSaveStatus('正在保存…')
    queue.current = queue.current
      .catch(() => undefined)
      .then(() => writeDraft(snapshot.project, snapshot.asset!))
      .then(() => {
        if (sequence === saveSequence.current) setSaveStatus('已保存到本机')
      })
      .catch(() => {
        if (sequence === saveSequence.current) setSaveStatus('保存失败 · 仍可导出')
      })
  }, [])

  useEffect(() => {
    if (!ready || !storageAllowed) return
    setSaveStatus('等待保存…')
    const timer = window.setTimeout(saveNow, 500)
    return () => window.clearTimeout(timer)
  }, [project, asset, ready, storageAllowed, saveNow])

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', saveNow)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', saveNow)
    }
  }, [saveNow])

  useEffect(() => {
    const retained = new Set(
      [...history.past, history.present, ...history.future].map((p) => p.photoId),
    )
    for (const id of assets.current.keys()) if (!retained.has(id)) assets.current.delete(id)
  }, [history])

  const change = useCallback((update: (previous: ProjectState) => ProjectState, group?: string) => {
    setHistory((previous) =>
      historyReducer(previous, { type: 'change', value: update(previous.present), group }),
    )
  }, [])
  const seal = useCallback(() => {
    setHistory((previous) => historyReducer(previous, { type: 'seal' }))
    saveNow()
  }, [saveNow])
  const undo = useCallback(
    () => setHistory((previous) => historyReducer(previous, { type: 'undo' })),
    [],
  )
  const redo = useCallback(
    () => setHistory((previous) => historyReducer(previous, { type: 'redo' })),
    [],
  )

  const upload = useCallback(
    async (file: File) => {
      const sequence = ++uploadSequence.current
      setImporting(true)
      setError('')
      try {
        const next = await importPhoto(file)
        if (sequence !== uploadSequence.current) return
        assets.current.set(next.id, next)
        change((previous) => ({
          ...previous,
          photoId: next.id,
          crops: { avatar: { x: 0.5, y: 0.5, zoom: 1 }, poster: { x: 0.5, y: 0.5, zoom: 1 } },
        }))
        if (Math.max(next.originalWidth, next.originalHeight) > 4096)
          setNotice('已在本机生成 4096px 工作副本，原文件保持不变。')
        else setNotice('照片已放入，两份作品可以分别调整裁切。')
      } catch (e) {
        if (sequence === uploadSequence.current)
          setError(e instanceof Error ? e.message : '图片读取失败，请重试。')
      } finally {
        if (sequence === uploadSequence.current) setImporting(false)
      }
    },
    [change],
  )

  const reset = useCallback(async () => {
    ++uploadSequence.current
    setImporting(true)
    try {
      const sample = await loadSample()
      assets.current.set(sample.id, sample)
      setHistory(initialHistory(createProject()))
      setStorageAllowed(true)
      setReady(true)
      setError('')
      setNotice('新的生日来信，等你写下。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新开始失败，请重试。')
    } finally {
      setImporting(false)
    }
  }, [])

  return {
    project,
    asset,
    bitmap: resource?.id === project.photoId ? resource.bitmap : null,
    ready,
    importing,
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
    reset,
    saveNow,
    storageAllowed,
  }
}
