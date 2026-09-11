import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Copy,
  Image,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkle,
  Trash2,
} from 'lucide-react'
import App from './App'
import PhotoCardEditor from './PhotoCardEditor'
import { createPhotoCard, isPhotoCard } from './core/photo-card'
import { cardTemplates } from './templates/photo-cards'
import { Modal } from './components/Modal'
import { templates } from './templates'
import { countCharacters, createId, createProject } from './core/project'
import { decodePhoto, loadSample } from './core/photos'
import {
  activateWork,
  copyWork,
  createWork,
  deleteWork,
  getWork,
  listWorks,
  migrateLegacyDraft,
  readActiveWorkId,
  renameWork,
} from './core/storage'
import type { WorkRecord, WorkSummary } from './core/storage'

const message = (error: unknown) =>
  error instanceof Error ? error.message : '本地操作未完成，原作品仍保留。'
function WorkThumbnail({ work }: { work: WorkSummary }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!work.thumbnail) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(work.thumbnail)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [work.thumbnail])
  return url ? (
    <img
      src={url}
      alt={`${work.title}的${cardTemplates.some((item) => item.id === work.templateId) ? '小卡' : '贺图'}缩略图`}
    />
  ) : (
    <span className="work-placeholder">
      <Image size={34} strokeWidth={1} />
      <span>打开作品，生成预览</span>
    </span>
  )
}

export default function Workspace() {
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [active, setActive] = useState<WorkRecord | null>(null)
  const [view, setView] = useState<'library' | 'editor'>('library')
  const [session, setSession] = useState(0)
  const [busy, setBusy] = useState(true)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [temporary, setTemporary] = useState(false)
  const [dialog, setDialog] = useState<{ type: 'rename' | 'delete'; work: WorkSummary } | null>(
    null,
  )
  const [title, setTitle] = useState('')
  const [dialogError, setDialogError] = useState('')
  const loadSequence = useRef(0)
  const listSequence = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++listSequence.current
    try {
      const items = await listWorks()
      if (sequence === listSequence.current) setWorks(items)
    } catch (error) {
      if (sequence === listSequence.current) setError(message(error))
    }
  }, [])
  const show = useCallback((work: WorkRecord, isTemporary = false) => {
    setActive(work)
    setTemporary(isTemporary)
    setSession((value) => value + 1)
    setView('editor')
  }, [])
  const initialize = useCallback(async () => {
    const sequence = ++loadSequence.current
    setBusy(true)
    setError('')
    setWarning('')
    setUnavailable(false)
    let migrationWarning = ''
    try {
      await migrateLegacyDraft()
    } catch (error) {
      migrationWarning = message(error)
      if (error instanceof Error && error.name === 'StorageBlockedError') {
        if (sequence === loadSequence.current) {
          setError(migrationWarning)
          setUnavailable(true)
          setBusy(false)
        }
        return
      }
    }
    try {
      const items = await listWorks()
      const id = await readActiveWorkId()
      let restored: WorkRecord | null = null
      let restoreError = ''
      if (id && items.some((work) => work.id === id)) {
        try {
          restored = await getWork(id)
        } catch (error) {
          restoreError = message(error)
        }
      }
      if (sequence !== loadSequence.current) return
      setWorks(items)
      setWarning(migrationWarning)
      setError(restoreError)
      if (restored) show(restored)
      else setView('library')
    } catch (error) {
      if (sequence === loadSequence.current) {
        setError(message(error))
        setWarning(migrationWarning)
        setUnavailable(true)
        setView('library')
      }
    } finally {
      if (sequence === loadSequence.current) setBusy(false)
    }
  }, [show])
  useEffect(() => {
    void initialize()
    return () => {
      ++loadSequence.current
      ++listSequence.current
    }
  }, [initialize])
  const operate = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])
  const newWork = useCallback(
    () =>
      operate(async () => {
        const asset = await loadSample()
        const work = await createWork(createProject(), asset)
        show(work)
        await refresh()
      }),
    [operate, refresh, show],
  )
  const newCard = () =>
    operate(async () => {
      const asset = await loadSample()
      const work = await createWork(createPhotoCard(), asset, '新的电子小卡', asset)
      show(work)
      await refresh()
    }).catch((error) => setError(message(error)))
  const open = (id: string) =>
    operate(async () => {
      const work = await getWork(id)
      const bitmap = await decodePhoto(work.asset.blob)
      bitmap.close()
      if (work.secondAsset) (await decodePhoto(work.secondAsset.blob)).close()
      await activateWork(id)
      show(work)
    }).catch((error) => setError(message(error)))
  const copy = (id: string) =>
    operate(async () => {
      const work = await copyWork(id)
      show(work)
      await refresh()
    }).catch((error) => setError(message(error)))
  const confirm = async () => {
    if (!dialog) return
    const target = dialog
    setDialogError('')
    try {
      await operate(async () => {
        if (target.type === 'rename') await renameWork(target.work.id, title)
        else {
          await deleteWork(target.work.id)
          if (active?.id === target.work.id) setActive(null)
        }
        setDialog(null)
        await refresh()
      })
    } catch (error) {
      setDialogError(message(error))
    }
  }
  if (view === 'editor' && active)
    return (
      <div inert={busy}>
        {isPhotoCard(active.project) ? (
          <PhotoCardEditor
            key={`${active.id}:${session}`}
            work={active}
            temporary={temporary}
            onSaved={() => {
              void refresh()
            }}
            onLibrary={() => {
              setView('library')
              void refresh()
            }}
          />
        ) : (
          <App
            key={`${active.id}:${session}`}
            work={active}
            temporary={temporary}
            onSaved={() => {
              void refresh()
            }}
            onNew={newWork}
            onLibrary={() => {
              setView('library')
              void refresh()
            }}
          />
        )}
        {busy && (
          <div className="workspace-busy" role="status">
            <LoaderCircle className="spin" size={18} />
            正在打开作品…
          </div>
        )}
      </div>
    )
  return (
    <div className="app-shell library-shell">
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(event) => event.preventDefault()}
            aria-label="星迹 Starloom 首页"
          >
            <span className="brand-symbol">
              <Sparkle size={25} strokeWidth={1.4} />
            </span>
            <span className="brand-chinese">星迹</span>
            <span className="brand-english">Starloom</span>
          </a>
          <span className="header-tagline">把喜欢，做成作品</span>
          <div className="header-actions">
            <span className="library-local">
              <LockKeyhole size={15} />
              本地作品集
            </span>
          </div>
        </div>
      </header>
      <main className="library-main">
        <section className="library-heading">
          <div>
            <p className="eyebrow">YOUR LITTLE COLLECTION</p>
            <h1>
              我的物料<span>把每一份喜欢，慢慢收藏。</span>
            </h1>
          </div>
          <div className="library-create-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void newCard()
              }}
            >
              <Plus size={17} />
              制作电子小卡
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => {
                void newWork().catch((error) => setError(message(error)))
              }}
            >
              <Plus size={17} />
              制作生日应援
            </button>
          </div>
        </section>
        <p className="library-privacy">
          <LockKeyhole size={15} />
          作品仅保存在当前浏览器资料与站点，不会上传或跨设备同步。无痕窗口结束、清理网站数据或存储回收可能丢失作品，请及时下载重要成品。
        </p>
        {(error || warning) && (
          <div className="library-message" role="alert">
            <p>{error || warning}</p>
            {error && warning && error !== warning && <p>{warning}</p>}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void initialize()
              }}
            >
              重试读取与迁移
            </button>
            {unavailable && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  void operate(async () => {
                    const asset = await loadSample()
                    const now = Date.now()
                    show(
                      {
                        schemaVersion: 2,
                        id: `temporary-${createId()}`,
                        title: '临时生日应援',
                        project: createProject(),
                        asset,
                        createdAt: now,
                        updatedAt: now,
                        revision: 1,
                        thumbnail: null,
                        thumbnailRevision: 0,
                      },
                      true,
                    )
                  }).catch((error) => setError(message(error)))
                }}
              >
                临时制作并导出（无法保存）
              </button>
            )}
          </div>
        )}
        {busy && (
          <p className="library-loading" role="status">
            <LoaderCircle className="spin" size={18} />
            正在整理你的物料…
          </p>
        )}
        {!works.length && !busy ? (
          <section className="library-empty">
            <h2>第一份心意，从这里开始</h2>
            <p>从上方选择想做的作品，换上照片和文字，就能下载自己的成品。</p>
            <div className="creation-examples">
              <article className="creation-example" aria-label="生日应援成品示例">
                <div className="example-art example-birthday">
                  <img
                    src={`${import.meta.env.BASE_URL}examples/birthday-poster.webp`}
                    alt="生日来信贺图成品示例"
                    width="480"
                    height="600"
                  />
                  <img
                    src={`${import.meta.env.BASE_URL}examples/birthday-avatar.webp`}
                    alt="配套应援头像成品示例"
                    width="480"
                    height="480"
                  />
                </div>
                <h3>生日应援</h3>
                <p>
                  一张照片，一套配套头像与生日贺图。
                  <br />3 款主题 · 1600px 头像 / 2400 × 3000 贺图
                </p>
              </article>
              <article className="creation-example" aria-label="电子小卡成品示例">
                <div className="example-art example-cards">
                  <img
                    src={`${import.meta.env.BASE_URL}examples/photo-strip.webp`}
                    alt="上下照片条小卡成品示例"
                    width="480"
                    height="640"
                  />
                  <img
                    src={`${import.meta.env.BASE_URL}examples/portrait-collage.webp`}
                    alt="写真拼贴小卡成品示例"
                    width="480"
                    height="640"
                  />
                </div>
                <h3>电子小卡</h3>
                <p>
                  两张照片，收藏日常、纪念或喜欢的瞬间。
                  <br />2 种布局 · 日期可选 · 1800 × 2400 PNG
                </p>
              </article>
            </div>
            <p className="example-credit">
              示例由星迹实际导出，使用授权照片与虚构文案。
              <a
                href={`${import.meta.env.BASE_URL}licenses/ASSETS.md`}
                target="_blank"
                rel="noreferrer"
              >
                素材来源
              </a>
            </p>
          </section>
        ) : (
          <div className="work-grid" aria-label="本地作品列表" inert={busy}>
            {works.map((work) => (
              <article
                className="work-card"
                key={work.id}
                aria-label={`作品：${work.title}`}
                data-work-id={work.id}
              >
                <button
                  className="work-art"
                  onClick={() => {
                    void open(work.id)
                  }}
                  aria-label={`继续编辑${work.title}`}
                >
                  <WorkThumbnail work={work} />
                  <span className="work-open">
                    继续编辑
                    <ArrowRight size={16} />
                  </span>
                </button>
                <div className="work-card-copy">
                  <div>
                    <p>
                      {[...templates, ...cardTemplates].find(
                        (template) => template.id === work.templateId,
                      )?.name ?? '主题暂不可用'}
                    </p>
                    <h2 title={work.title}>{work.title}</h2>
                    <time dateTime={new Date(work.updatedAt).toISOString()}>
                      修改于{' '}
                      {new Intl.DateTimeFormat('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(work.updatedAt)}
                    </time>
                  </div>
                  <details className="work-menu">
                    <summary aria-label={`${work.title}的更多操作`}>
                      <MoreHorizontal size={21} />
                    </summary>
                    <div>
                      <button
                        onClick={() => {
                          void copy(work.id)
                        }}
                      >
                        <Copy size={15} />
                        复制
                      </button>
                      <button
                        onClick={() => {
                          setTitle(work.title)
                          setDialogError('')
                          setDialog({ type: 'rename', work })
                        }}
                      >
                        <Pencil size={15} />
                        重命名
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          setDialogError('')
                          setDialog({ type: 'delete', work })
                        }}
                      >
                        <Trash2 size={15} />
                        删除
                      </button>
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="library-footnote">
          照片和文字留在本机。每次打开作品都是独立编辑会话，撤销记录不跨作品或刷新保留。
        </p>
      </main>
      <footer className="site-footer">
        <span>Starloom ✦ 为每一份热爱，留下一点星迹。</span>
        <span>无需登录 · 照片不上传</span>
      </footer>
      {dialog && (
        <Modal
          title={dialog.type === 'rename' ? '给这份心意取个名字' : '删除这份物料？'}
          onClose={() => {
            if (!busy) setDialog(null)
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {dialog.type === 'rename' ? (
              <div className="rename-field">
                <label htmlFor="work-title">作品名称</label>
                <input
                  id="work-title"
                  autoFocus
                  value={title}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <small>{countCharacters(title)} / 60 · 不改变图片里的姓名</small>
              </div>
            ) : (
              <p className="modal-intro">
                将从当前浏览器删除「{dialog.work.title}
                」。这份作品的照片和编辑内容无法通过撤销恢复，已下载的 PNG 不受影响。
              </p>
            )}
            {dialogError && (
              <p className="message error" role="alert">
                {dialogError}
              </p>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                type="submit"
                className={`primary-button ${dialog.type === 'delete' ? 'danger-button' : ''}`}
                disabled={busy}
              >
                {busy ? '处理中…' : dialog.type === 'rename' ? '保存名称' : '确认删除'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
