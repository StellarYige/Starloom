import { useEffect, useState } from 'react'
import { Download, LoaderCircle, ExternalLink, Check } from 'lucide-react'
import { Modal } from './Modal'
import type { Format, PhotoAsset, ProjectState } from '../core/types'
import { decodePhoto } from '../core/photos'
import { exportArtwork } from '../core/render'
import { getTemplate } from '../templates'
import { validateContent } from '../core/project'

export function ExportModal({
  snapshot,
  onClose,
}: {
  snapshot: { project: ProjectState; asset: PhotoAsset }
  onClose: () => void
}) {
  const [files, setFiles] = useState<Partial<Record<Format, string>>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      let bitmap: ImageBitmap | undefined
      try {
        const issues = validateContent(snapshot.project)
        if (issues.length) throw new Error(issues.join('\n'))
        bitmap = await decodePhoto(snapshot.asset.blob)
        for (const format of ['avatar', 'poster'] as const) {
          if (cancelled) return
          const blob = await exportArtwork(snapshot.project, bitmap, format)
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          urls.push(url)
          setFiles((previous) => ({ ...previous, [format]: url }))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '导出失败，请重试。')
      } finally {
        bitmap?.close()
      }
    })()
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [snapshot])
  const stem =
    snapshot.project.name
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 50) || '生日来信'
  return (
    <Modal title="心意准备好了" onClose={onClose} className="export-modal">
      <p className="modal-intro">两份配套的生日心意，送给特别的 TA。</p>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="export-grid">
        {(['avatar', 'poster'] as const).map((format) => {
          const layout = getTemplate(snapshot.project.templateId).layouts[format]
          return (
            <section className="export-card" key={format}>
              <div className="export-image">
                {files[format] ? (
                  <a
                    href={files[format]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`查看${format === 'avatar' ? '头像' : '贺图'}原图`}
                  >
                    <img
                      src={files[format]}
                      alt={format === 'avatar' ? '已导出的应援头像' : '已导出的生日贺图'}
                    />
                  </a>
                ) : (
                  <LoaderCircle className="spin" size={28} />
                )}
              </div>
              <h3>{format === 'avatar' ? '应援头像' : '生日贺图'}</h3>
              <p>
                {layout.exportWidth} × {layout.exportHeight} · PNG
              </p>
              {files[format] ? (
                <>
                  <a
                    className="primary-button"
                    href={files[format]}
                    download={`星迹-${stem}-${format === 'avatar' ? '应援头像' : '生日贺图'}.png`}
                  >
                    <Download size={16} />
                    下载{format === 'avatar' ? '头像' : '贺图'} PNG
                  </a>
                  <a
                    className="text-button view-original"
                    href={files[format]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={13} />
                    查看原图
                  </a>
                </>
              ) : (
                <button className="primary-button" disabled>
                  <LoaderCircle size={16} className="spin" />
                  {error ? '生成未完成' : '正在生成高清图片'}
                </button>
              )}
            </section>
          )
        })}
      </div>
      <div className="export-note">
        <Check size={15} />
        <span>原尺寸 · 无水印 · 仅在本机生成</span>
      </div>
      <p className="small-print">
        手机未开始下载时，可点开原图并长按保存。关闭此窗口后，原图链接将释放；可随时重新导出。
      </p>
    </Modal>
  )
}
