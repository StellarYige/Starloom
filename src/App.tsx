import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Download,
  Flower2,
  Heart,
  ImagePlus,
  Info,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Move,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Sparkle,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { ArtworkCanvas } from './components/ArtworkCanvas'
import { ExportModal } from './components/ExportModal'
import { Modal } from './components/Modal'
import { ThemeSelector } from './components/ThemeSelector'
import { useEditor } from './hooks/useEditor'
import { getTemplate } from './templates'
import { birthdayText, countCharacters, daysInMonth, validateContent } from './core/project'
import { normalizeCrop } from './core/crop'
import { photoFrame } from './core/render'
import type { RenderResult } from './core/render'
import type { Format, PhotoAsset, ProjectState } from './core/types'

const steps = [
  { name: '选主题', title: '从喜欢的样子开始', description: '一套主题，两份心意。' },
  { name: '放照片', title: '放入一张喜欢的照片', description: '关于 TA 的，每一帧都值得纪念。' },
  { name: '写祝福', title: '有些心意，想对你说', description: '写下名字，也写下你的祝愿。' },
  { name: '选配色', title: '用 TA 的颜色，点亮心意', description: '把熟悉的应援色，留在作品里。' },
  { name: '微调', title: '让每个细节，恰到好处', description: '分别照顾好头像和贺图里的 TA。' },
  { name: '导出', title: '准备好，把心意送出', description: '再看一眼，然后保存这份喜欢。' },
]

export default function App() {
  const editor = useEditor()
  const { project, asset, bitmap } = editor
  const template = getTemplate(project.templateId)
  const [step, setStep] = useState(0)
  const [format, setFormat] = useState<Format>('poster')
  const [safeArea, setSafeArea] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [hex, setHex] = useState(project.color)
  const [modal, setModal] = useState<'help' | 'about' | 'reset' | null>(null)
  const [exportSnapshot, setExportSnapshot] = useState<{
    project: ProjectState
    asset: PhotoAsset
  } | null>(null)
  const [results, setResults] = useState<Record<Format, RenderResult | null>>({
    avatar: null,
    poster: null,
  })
  const [renderError, setRenderError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const otherFormat = format === 'poster' ? 'avatar' : 'poster'
  const editingPhoto = step === 1 || step === 4
  const issues = [
    ...validateContent(project),
    ...new Set(Object.values(results).flatMap((result) => result?.issues ?? [])),
  ]
  const exportReady =
    editor.ready &&
    !!bitmap &&
    !!asset &&
    !editor.importing &&
    !issues.length &&
    !!results.avatar &&
    !!results.poster &&
    !renderError
  const activeCrop = project.crops[format]
  const handleRender = useCallback(
    (target: Format, result: RenderResult | null, error?: string) => {
      setResults((previous) =>
        JSON.stringify(previous[target]) === JSON.stringify(result)
          ? previous
          : { ...previous, [target]: result },
      )
      if (error) setRenderError(error)
      else if (result) setRenderError('')
    },
    [],
  )
  useEffect(() => setHex(project.color.toUpperCase()), [project.color])
  useEffect(() => {
    if (!editor.notice) return
    const timer = window.setTimeout(() => editor.setNotice(''), 6500)
    return () => window.clearTimeout(timer)
  }, [editor.notice, editor.setNotice])
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        modal ||
        exportSnapshot ||
        editor.importing ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      )
        return
      const element = event.target as HTMLElement
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element.isContentEditable
      )
        return
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) editor.redo()
        else editor.undo()
      }
      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        editor.redo()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [modal, exportSnapshot, editor.importing, editor.undo, editor.redo])
  const goToStep = (next: number) => {
    editor.seal()
    setStep(next)
  }
  const openExport = () => {
    if (!exportReady || !asset) return
    editor.saveNow()
    setExportSnapshot({ project: structuredClone(project), asset })
  }
  const updateZoom = (zoom: number) => {
    if (!bitmap) return
    editor.change(
      (previous) => ({
        ...previous,
        crops: {
          ...previous.crops,
          [format]: normalizeCrop(bitmap.width, bitmap.height, photoFrame(previous, format), {
            ...previous.crops[format],
            zoom,
          }),
        },
      }),
      `zoom-${format}`,
    )
  }
  const cropControls = (
    <div className="crop-controls">
      <div className="field-heading">
        <label htmlFor="photo-zoom">照片缩放</label>
        <span>{Math.round(activeCrop.zoom * 100)}%</span>
      </div>
      <div className="zoom-row">
        <button
          className="icon-button"
          aria-label="缩小照片"
          disabled={!bitmap || activeCrop.zoom <= 1}
          onClick={() => {
            updateZoom(Math.max(1, activeCrop.zoom - 0.1))
            editor.seal()
          }}
        >
          −
        </button>
        <input
          id="photo-zoom"
          aria-label="照片缩放"
          type="range"
          min="1"
          max="4"
          step="0.01"
          value={activeCrop.zoom}
          disabled={!bitmap}
          onChange={(event) => updateZoom(Number(event.target.value))}
          onPointerUp={editor.seal}
          onKeyUp={editor.seal}
          style={{ '--range-fill': `${((activeCrop.zoom - 1) / 3) * 100}%` } as CSSProperties}
        />
        <button
          className="icon-button"
          aria-label="放大照片"
          disabled={!bitmap || activeCrop.zoom >= 4}
          onClick={() => {
            updateZoom(Math.min(4, activeCrop.zoom + 0.1))
            editor.seal()
          }}
        >
          +
        </button>
      </div>
      <div className="crop-help">
        <span>
          <Move size={13} />
          拖动预览中的照片来移动
        </span>
        <button
          className="text-button"
          onClick={() =>
            editor.change((previous) => ({
              ...previous,
              crops: { ...previous.crops, [format]: { x: 0.5, y: 0.5, zoom: 1 } },
            }))
          }
        >
          <RotateCcw size={13} />
          重置裁切
        </button>
      </div>
    </div>
  )
  return (
    <div className="app-shell" data-step={step}>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="#"
            className="brand"
            aria-label="星迹 Starloom 首页"
            onClick={(event) => {
              event.preventDefault()
              goToStep(0)
            }}
          >
            <span className="brand-symbol">
              <Sparkle size={25} strokeWidth={1.4} />
            </span>
            <span className="brand-chinese">星迹</span>
            <span className="brand-english">Starloom</span>
          </a>
          <span className="header-tagline">把喜欢，做成作品</span>
          <div className="header-actions">
            <span className="occasion-badge">
              <span />
              生日应援
            </span>
            <button
              className="text-button help-button"
              aria-label="使用指南"
              onClick={() => setModal('help')}
            >
              <CircleHelp size={16} />
              <span>使用指南</span>
            </button>
            <button
              className="icon-button about-button"
              aria-label="开源与隐私说明"
              onClick={() => setModal('about')}
            >
              <Info size={19} />
            </button>
          </div>
        </div>
      </header>
      <main className="main-content">
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span />A LITTLE LOVE, MADE BY YOU
            </p>
            <h1>
              把心意，留在
              <span className="headline-accent">
                这一岁
                <Sparkle className="headline-sparkle" size={23} strokeWidth={1.3} />
              </span>
              。
            </h1>
            <p className="intro-description">
              一张照片，一份祝福。为喜欢的人，做一套特别的生日应援。
            </p>
          </div>
          <div className="intro-aside">
            <Heart size={20} strokeWidth={1.3} />
            <span>
              为热爱而做
              <br />
              <small>每一份喜欢，都值得被认真对待。</small>
            </span>
          </div>
        </section>
        <nav className="step-navigation" aria-label="制作步骤">
          {steps.map((item, index) => (
            <button
              key={item.name}
              className={`step-button ${step === index ? 'is-active' : ''} ${step > index ? 'is-past' : ''}`}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => goToStep(index)}
            >
              <span className="step-number">
                {step > index ? <Check size={13} /> : String(index + 1).padStart(2, '0')}
              </span>
              <span>{item.name}</span>
              {index < 5 && <ChevronRight className="step-chevron" size={13} />}
            </button>
          ))}
        </nav>
        <div className="workspace">
          <section className="preview-panel" aria-label="作品预览">
            <div className="preview-toolbar">
              <div className="format-tabs" role="tablist" aria-label="成品切换">
                <button
                  role="tab"
                  aria-selected={format === 'poster'}
                  onClick={() => {
                    editor.seal()
                    setFormat('poster')
                  }}
                >
                  生日贺图<span>4:5</span>
                </button>
                <button
                  role="tab"
                  aria-selected={format === 'avatar'}
                  onClick={() => {
                    editor.seal()
                    setFormat('avatar')
                  }}
                >
                  应援头像<span>1:1</span>
                </button>
              </div>
              <div className="history-actions">
                <button
                  className="icon-button"
                  aria-label="撤销"
                  title="撤销 Ctrl / ⌘ Z"
                  disabled={!editor.canUndo || editor.importing}
                  onClick={editor.undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="重做"
                  title="重做 Ctrl / ⌘ Shift Z"
                  disabled={!editor.canRedo || editor.importing}
                  onClick={editor.redo}
                >
                  <Redo2 size={17} />
                </button>
              </div>
            </div>
            <div className={`preview-stage ${format === 'avatar' ? 'avatar-stage' : ''}`}>
              <div className="stage-label">
                <span className="live-dot" />
                实时预览
              </div>
              <div className={`primary-artwork ${format}`}>
                <ArtworkCanvas
                  project={project}
                  bitmap={bitmap}
                  format={format}
                  editable={editingPhoto && !!bitmap && !editor.importing}
                  safeArea={safeArea}
                  onRender={handleRender}
                  onCrop={(crop) =>
                    editor.change(
                      (previous) => ({ ...previous, crops: { ...previous.crops, [format]: crop } }),
                      `drag-${format}`,
                    )
                  }
                  onCommit={editor.seal}
                />
              </div>
              <button
                className="companion-preview"
                aria-label={`切换到${otherFormat === 'avatar' ? '应援头像' : '生日贺图'}`}
                onClick={() => {
                  editor.seal()
                  setFormat(otherFormat)
                }}
              >
                <div className="companion-art">
                  <ArtworkCanvas
                    project={project}
                    bitmap={bitmap}
                    format={otherFormat}
                    thumbnail
                    onRender={handleRender}
                  />
                </div>
                <span>
                  {otherFormat === 'avatar' ? '配套头像' : '配套贺图'}
                  <ArrowRight size={12} />
                </span>
              </button>
              <div className="stage-caption">
                <span className="caption-line" />a little keepsake, a lot of love
                <span className="caption-line" />
              </div>
            </div>
            <div className="preview-footer">
              <span>
                <Maximize2 size={13} />
                {template.layouts[format].exportWidth} × {template.layouts[format].exportHeight} px
                <span className="resolution-tag">高清 PNG</span>
              </span>
              {format === 'avatar' ? (
                <label className="safe-toggle">
                  <input
                    type="checkbox"
                    checked={safeArea}
                    onChange={(event) => setSafeArea(event.target.checked)}
                  />
                  圆形安全区
                </label>
              ) : (
                <span className="preview-assurance">
                  <Check size={13} />
                  预览即成品
                </span>
              )}
            </div>
          </section>
          <section className="editor-panel" aria-label="作品设置">
            <div className="editor-panel-heading">
              <p className="panel-eyebrow">
                MAKE IT YOURS<span>{String(step + 1).padStart(2, '0')} / 06</span>
              </p>
              <h2>{steps[step].title}</h2>
              <p>{steps[step].description}</p>
            </div>
            <div className="editor-body">
              {!editor.ready && (
                <div className="message">
                  <LoaderCircle size={16} className="spin" />
                  正在读取照片与草稿…
                </div>
              )}
              {(editor.error || renderError) && (
                <div className="message error" role="alert">
                  <CircleAlert size={16} />
                  <span>{editor.error || renderError}</span>
                  <button
                    className="icon-button"
                    aria-label="关闭错误提示"
                    onClick={() => {
                      editor.setError('')
                      setRenderError('')
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {step === 0 && (
                <ThemeSelector
                  project={project}
                  bitmap={bitmap}
                  onSelect={(id) => editor.change((previous) => ({ ...previous, templateId: id }))}
                />
              )}
              {step === 1 && (
                <div className="photo-step">
                  <input
                    ref={inputRef}
                    id="photo-input"
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="上传照片"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) await editor.upload(file)
                    }}
                  />
                  <button
                    className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                    disabled={editor.importing || !editor.ready}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragOver(false)
                      const file = event.dataTransfer.files[0]
                      if (file && !editor.importing) void editor.upload(file)
                    }}
                  >
                    <span className="upload-icon">
                      {editor.importing ? (
                        <LoaderCircle className="spin" size={25} />
                      ) : (
                        <Upload size={25} strokeWidth={1.3} />
                      )}
                    </span>
                    <strong>
                      {editor.importing ? '正在本机处理照片…' : '点击上传，或把照片拖到这里'}
                    </strong>
                    <span>JPG / PNG / WebP · 最大 30 MB</span>
                  </button>
                  <div className="photo-meta">
                    <span className="file-icon">
                      <ImagePlus size={17} />
                    </span>
                    <div>
                      <strong>{asset?.name ?? '等待照片'}</strong>
                      <p>
                        {asset ? `${asset.width} × ${asset.height} px` : '读取完成后即可编辑'}
                        {asset?.sample && ' · 可以先用示例体验'}
                      </p>
                    </div>
                    <span className="local-chip">本机</span>
                  </div>
                  {cropControls}
                  <div className="privacy-tip">
                    <LockKeyhole size={15} />
                    <p>
                      照片只在你的浏览器里处理，
                      <br />
                      不会上传到服务器。
                    </p>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="content-step">
                  <div className="form-field">
                    <div className="field-heading">
                      <label htmlFor="name">TA 的名字</label>
                      <span className={countCharacters(project.name) > 40 ? 'over-limit' : ''}>
                        {countCharacters(project.name)} / 40
                      </span>
                    </div>
                    <input
                      id="name"
                      type="text"
                      value={project.name}
                      placeholder="想把这份心意送给谁？"
                      autoComplete="off"
                      aria-invalid={!project.name.trim() || countCharacters(project.name) > 40}
                      onChange={(event) =>
                        editor.change(
                          (previous) => ({ ...previous, name: event.target.value }),
                          'name',
                        )
                      }
                      onBlur={editor.seal}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="birth-month">生日</label>
                    <div className="birthday-inputs">
                      <div>
                        <select
                          id="birth-month"
                          aria-label="生日月份"
                          value={project.month}
                          onChange={(event) =>
                            editor.change((previous) => ({
                              ...previous,
                              month: Number(event.target.value),
                              day: Math.min(previous.day, daysInMonth(Number(event.target.value))),
                            }))
                          }
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option value={i + 1} key={i}>
                              {String(i + 1).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span>月</span>
                      </div>
                      <div>
                        <select
                          aria-label="生日日期"
                          value={project.day}
                          onChange={(event) =>
                            editor.change((previous) => ({
                              ...previous,
                              day: Number(event.target.value),
                            }))
                          }
                        >
                          {Array.from({ length: daysInMonth(project.month) }, (_, i) => (
                            <option value={i + 1} key={i}>
                              {String(i + 1).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span>日</span>
                      </div>
                    </div>
                  </div>
                  <div className="form-field">
                    <div className="field-heading">
                      <label htmlFor="wish">想对 TA 说的话</label>
                      <span className={countCharacters(project.wish) > 200 ? 'over-limit' : ''}>
                        {countCharacters(project.wish)} / 200
                      </span>
                    </div>
                    <textarea
                      id="wish"
                      rows={5}
                      value={project.wish}
                      placeholder="愿你所爱皆如愿，愿你所行皆坦途。"
                      aria-invalid={countCharacters(project.wish) > 200}
                      onChange={(event) =>
                        editor.change(
                          (previous) => ({ ...previous, wish: event.target.value }),
                          'wish',
                        )
                      }
                      onBlur={editor.seal}
                    />
                    <p className="field-hint">完整祝福会出现在贺图上，头像保留姓名与生日。</p>
                  </div>
                  {!!issues.length && (
                    <div className="message error" role="alert">
                      <CircleAlert size={15} />
                      <span>{issues[0]}</span>
                    </div>
                  )}
                </div>
              )}
              {step === 3 && (
                <div className="color-step">
                  <div className="field-heading">
                    <label>选择一份熟悉的颜色</label>
                    <span>6 款灵感色</span>
                  </div>
                  <div className="palette-grid">
                    {template.palettes.map((item) => (
                      <button
                        className={`palette-choice ${project.color.toLowerCase() === item.color.toLowerCase() ? 'is-selected' : ''}`}
                        key={item.color}
                        aria-label={`应援色：${item.name}`}
                        aria-pressed={project.color.toLowerCase() === item.color.toLowerCase()}
                        onClick={() =>
                          editor.change((previous) => ({ ...previous, color: item.color }))
                        }
                      >
                        <span style={{ backgroundColor: item.color }}>
                          {project.color.toLowerCase() === item.color.toLowerCase() && (
                            <Check size={16} />
                          )}
                        </span>
                        <small>{item.name}</small>
                      </button>
                    ))}
                  </div>
                  <div className="color-divider">
                    <span />
                    或使用你的应援色
                    <span />
                  </div>
                  <div className="form-field">
                    <label htmlFor="color-hex">自定义颜色</label>
                    <div className="custom-color">
                      <label className="color-picker" title="打开颜色选择器">
                        <input
                          type="color"
                          aria-label="自定义应援色"
                          value={project.color}
                          onChange={(event) =>
                            editor.change(
                              (previous) => ({ ...previous, color: event.target.value }),
                              'color-picker',
                            )
                          }
                          onBlur={editor.seal}
                        />
                      </label>
                      <input
                        id="color-hex"
                        type="text"
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={7}
                        value={hex}
                        aria-invalid={!/^#[\da-f]{6}$/i.test(hex)}
                        onChange={(event) => {
                          const value = event.target.value
                          setHex(value)
                          if (/^#[\da-f]{6}$/i.test(value))
                            editor.change(
                              (previous) => ({ ...previous, color: value }),
                              'color-hex',
                            )
                        }}
                        onBlur={() => {
                          if (!/^#[\da-f]{6}$/i.test(hex)) setHex(project.color.toUpperCase())
                          editor.seal()
                        }}
                      />
                      <span>HEX</span>
                    </div>
                    <p className="field-hint">输入 # 加六位色值，例如 #75866B。</p>
                  </div>
                  <div
                    className="color-letter"
                    style={{ '--letter-color': project.color } as CSSProperties}
                  >
                    <Sparkle size={22} strokeWidth={1.2} />
                    <p>
                      每一种颜色，
                      <br />
                      都有只属于你们的意义。
                    </p>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="adjust-step">
                  <div className="field-heading">
                    <label>正在调整</label>
                    <span>两份裁切独立保存</span>
                  </div>
                  <div className="segmented-control">
                    <button
                      className={format === 'poster' ? 'is-active' : ''}
                      onClick={() => {
                        editor.seal()
                        setFormat('poster')
                      }}
                    >
                      生日贺图
                    </button>
                    <button
                      className={format === 'avatar' ? 'is-active' : ''}
                      onClick={() => {
                        editor.seal()
                        setFormat('avatar')
                      }}
                    >
                      应援头像
                    </button>
                  </div>
                  {cropControls}
                  <div className="decoration-settings">
                    <h3>一点恰好的装饰</h3>
                    <label className="switch-row">
                      <span>
                        <Sparkle size={18} strokeWidth={1.3} />
                        <span>
                          星芒点缀<small>让喜欢，多一点闪亮</small>
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={project.decorations.sparkles}
                        onChange={(event) =>
                          editor.change((previous) => ({
                            ...previous,
                            decorations: {
                              ...previous.decorations,
                              sparkles: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                    <label className="switch-row">
                      <span>
                        <span className="line-decoration-icon" />
                        <span>
                          纪念细线<small>留一圈温柔的边界</small>
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={project.decorations.lines}
                        onChange={(event) =>
                          editor.change((previous) => ({
                            ...previous,
                            decorations: { ...previous.decorations, lines: event.target.checked },
                          }))
                        }
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                  </div>
                  {results[format]?.lowResolution && !asset?.sample && (
                    <div className="message warning">
                      <Info size={15} />
                      <span>
                        当前裁切放大较多，导出照片可能偏软。可减小缩放或换一张更清晰的照片。
                      </span>
                    </div>
                  )}
                </div>
              )}
              {step === 5 && (
                <div className="finish-step">
                  <div className="finish-seal">
                    <Heart size={25} strokeWidth={1.3} />
                    <span>MADE WITH LOVE</span>
                  </div>
                  <h3>给 {project.name.trim() || '特别的 TA'} 的生日来信</h3>
                  <p className="finish-date">{birthdayText(project)} / HAPPY BIRTHDAY</p>
                  <div className="export-summary">
                    <div>
                      <span>应援头像</span>
                      <strong>
                        {template.layouts.avatar.exportWidth} ×{' '}
                        {template.layouts.avatar.exportHeight}
                      </strong>
                    </div>
                    <div>
                      <span>生日贺图</span>
                      <strong>
                        {template.layouts.poster.exportWidth} ×{' '}
                        {template.layouts.poster.exportHeight}
                      </strong>
                    </div>
                    <div>
                      <span>图片格式</span>
                      <strong>PNG · 无水印</strong>
                    </div>
                  </div>
                  {asset?.sample && (
                    <p className="field-hint">你正在使用示例照片，也可以先导出体验。</p>
                  )}
                  {!!issues.length && (
                    <div className="message error" role="alert">
                      <CircleAlert size={15} />
                      <span>
                        {issues[0]}
                        <button className="text-button" onClick={() => goToStep(2)}>
                          返回修改
                          <ArrowRight size={12} />
                        </button>
                      </span>
                    </div>
                  )}
                  <p className="finish-note">
                    把喜欢认真做成作品，
                    <br />
                    就是一份很好的生日礼物。
                  </p>
                </div>
              )}
            </div>
            <div className="editor-panel-footer">
              <div className="panel-footer-buttons">
                {step > 0 && (
                  <button
                    className="back-button"
                    aria-label="上一步"
                    onClick={() => goToStep(step - 1)}
                  >
                    <ArrowLeft size={17} />
                  </button>
                )}
                {step < 5 ? (
                  <button
                    className="primary-button"
                    disabled={!editor.ready || editor.importing}
                    onClick={() => goToStep(step + 1)}
                  >
                    {
                      [
                        '选好了，放入照片',
                        '下一步，写下祝福',
                        '下一步，选择配色',
                        '下一步，调整细节',
                        '好了，准备导出',
                      ][step]
                    }
                    <ArrowRight size={17} />
                  </button>
                ) : (
                  <button className="primary-button" disabled={!exportReady} onClick={openExport}>
                    <Download size={17} />
                    导出这份心意
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
              <p>
                <LockKeyhole size={12} />
                免费制作 · 无需登录 · 照片不上传
              </p>
            </div>
          </section>
        </div>
        <div className="workspace-status">
          <span
            className={
              editor.saveStatus.includes('失败') || !editor.storageAllowed ? 'save-warning' : ''
            }
            role="status"
          >
            {editor.saveStatus.includes('失败') ? (
              <CircleAlert size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            {editor.saveStatus}
          </span>
          <button className="text-button" onClick={() => setModal('reset')}>
            <RotateCcw size={13} />
            重新开始
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <span>
          Starloom <span className="footer-sparkle">✦</span> 为每一份热爱，留下一点星迹。
        </span>
        <button className="text-button" onClick={() => setModal('about')}>
          开源与素材说明
          <ArrowRight size={12} />
        </button>
      </footer>
      {editor.notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{editor.notice}</span>
          <button
            className="icon-button"
            aria-label="关闭通知"
            onClick={() => editor.setNotice('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === 'help' && (
        <Modal title="一份生日心意，六个小步骤" onClose={() => setModal(null)}>
          <p className="modal-intro">不需要设计经验，跟着模板就能完成。</p>
          <ol className="help-list">
            {steps.map((item, index) => (
              <li key={item.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {
                      [
                        '选中「生日来信」，一次制作头像和贺图。',
                        '上传自己的照片，支持 JPG、PNG 和 WebP。',
                        '填写名字、生日和祝福。完整祝福只出现在贺图中。',
                        '选择灵感色，或填写自己的应援色色值。',
                        '切换头像与贺图，分别拖动、缩放照片，再选择装饰。',
                        '保存两张高清 PNG；手机也可以点开原图长按保存。',
                      ][index]
                    }
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="help-shortcuts">
            <strong>几个贴心小提示</strong>
            <p>
              在照片调整区域，方向键可以微移，Shift + 方向键移动更多。输入框外可用 Ctrl / ⌘ Z
              撤销，Ctrl / ⌘ Shift Z 重做。
            </p>
            <p>
              当前作品会自动保存到这台设备、这个浏览器。清理网站数据或使用无痕模式，草稿可能丢失。
            </p>
          </div>
        </Modal>
      )}
      {modal === 'about' && (
        <Modal title="让喜欢，自由生长" onClose={() => setModal(null)}>
          <div className="about-brand">
            <Sparkle size={34} strokeWidth={1.2} />
            <span>星迹 Starloom</span>
          </div>
          <p className="modal-intro">
            一个开源的生日应援制作工具。
            <br />
            为热爱而做，把创作的快乐留给你。
          </p>
          <div className="about-sections">
            <section>
              <h3>
                <LockKeyhole size={17} />
                心意留在本机
              </h3>
              <p>
                照片、文字和裁切都在浏览器中处理。应用不设账户、不上传照片、不接入 AI
                或付费接口，也不使用统计追踪服务。
              </p>
            </section>
            <section>
              <h3>
                <Flower2 size={17} />
                开源与素材
              </h3>
              <p>
                项目代码与原创几何装饰采用 MIT 许可。示例照片来自 Aiony Haust /
                Unsplash，仅用于展示；示例姓名、生日和祝福为虚构内容。
              </p>
              <p>
                字体为 Noto Sans SC 与 Cormorant Garamond，采用 SIL OFL
                1.1。照片、字体均随应用提供，无需连接第三方素材服务。
              </p>
              <a
                className="text-button"
                href={`${import.meta.env.BASE_URL}licenses/ASSETS.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看完整来源与许可记录
                <ArrowRight size={13} />
              </a>
            </section>
          </div>
        </Modal>
      )}
      {modal === 'reset' && (
        <Modal title="开始一封新的生日来信？" onClose={() => setModal(null)}>
          <p className="modal-intro">
            当前照片、内容、裁切和撤销记录会被清空，本机草稿将替换为新作品。想保留这份心意，可以先导出图片。
          </p>
          <div className="confirm-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              继续这份创作
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setModal(null)
                setStep(0)
                setFormat('poster')
                setSafeArea(false)
                void editor.reset()
              }}
            >
              重新开始
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {exportSnapshot && (
        <ExportModal snapshot={exportSnapshot} onClose={() => setExportSnapshot(null)} />
      )}
    </div>
  )
}
