import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { exportProjectFile, projectFileName } from '../core/project-file'
import type { ProjectSnapshot } from '../core/project-file'

export function ProjectFileExport({
  snapshot,
  disabled,
}: {
  snapshot: ProjectSnapshot | null
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const pending = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return (
    <div className="project-file-export">
      <button
        className="text-button"
        disabled={disabled || busy || !snapshot}
        title="下载照片和编辑内容，之后可在「我的物料」导入为新作品"
        onClick={async () => {
          if (!snapshot || pending.current) return
          pending.current = true
          setBusy(true)
          setError('')
          try {
            const blob = await exportProjectFile(snapshot)
            if (!alive.current) return
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = projectFileName(snapshot.title)
            document.body.append(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
          } catch (error) {
            if (alive.current)
              setError(error instanceof Error ? error.message : '工程导出失败，请重试。')
          } finally {
            pending.current = false
            if (alive.current) setBusy(false)
          }
        }}
      >
        <Download size={15} />
        {busy ? '正在导出工程…' : '导出工程'}
      </button>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
