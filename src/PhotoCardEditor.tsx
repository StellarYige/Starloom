import { useCallback, useEffect, useState } from 'react'
import { Download, FolderHeart, Redo2, RotateCcw, Sparkle, Undo2, Upload } from 'lucide-react'
import { ArtworkCanvas } from './components/ArtworkCanvas'
import { ExportModal } from './components/ExportModal'
import { LocalSaveNotice } from './components/LocalSaveNotice'
import { CustomColorPicker } from './components/CustomColorPicker'
import { TemporaryLeaveDialog } from './components/TemporaryLeaveDialog'
import { useEditor } from './hooks/useEditor'
import { cardTemplates, getCardTemplate } from './templates/photo-cards'
import {
  cardCrop,
  isPhotoCard,
  photoSlots,
  switchCardLayout,
  updateCardCrop,
} from './core/photo-card'
import { countCharacters, validateContent } from './core/project'
import { normalizeCrop } from './core/crop'
import { photoFrame } from './core/render'
import type { RenderResult } from './core/render'
import type { ArtworkFormat, PhotoAsset, PhotoSlot, ProjectState } from './core/types'
import type { WorkRecord } from './core/storage'

export default function PhotoCardEditor({
  work,
  onLibrary,
  onSaved,
  temporary = false,
}: {
  work: WorkRecord
  onLibrary: () => void
  onSaved: () => void
  temporary?: boolean
}) {
  const editor = useEditor(work, onSaved, temporary)
  const { project, asset, secondAsset, bitmap, secondBitmap } = editor
  const [slot, setSlot] = useState<PhotoSlot>('first')
  const [result, setResult] = useState<RenderResult | null>(null)
  const [renderError, setRenderError] = useState('')
  const [snapshot, setSnapshot] = useState<{
    project: ProjectState
    asset: PhotoAsset
    secondAsset?: PhotoAsset
  } | null>(null)
  const onRender = useCallback(
    (_format: ArtworkFormat, next: RenderResult | null, error?: string) => {
      setResult((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
      setRenderError(error ?? '')
    },
    [],
  )
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (snapshot || editor.importing || !(event.ctrlKey || event.metaKey) || event.altKey) return
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
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        editor.redo()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [snapshot, editor.importing, editor.undo, editor.redo])
  if (!isPhotoCard(project)) return null
  const template = getCardTemplate(project.templateId)
  const crop = cardCrop(project, slot)
  const selectedBitmap = slot === 'first' ? bitmap : secondBitmap
  const issues = [...validateContent(project), ...(result?.issues ?? [])]
  const ready =
    !!bitmap && !!secondBitmap && !!result && !issues.length && !renderError && !editor.importing
  const zoom = (value: number) => {
    if (!selectedBitmap) return
    editor.change(
      (previous) =>
        updateCardCrop(
          previous,
          slot,
          normalizeCrop(
            selectedBitmap.width,
            selectedBitmap.height,
            photoFrame(previous, 'card', slot),
            { ...cardCrop(previous, slot), zoom: value },
          ),
        ),
      `zoom-${project.templateId}-${slot}`,
    )
  }
  return (
    <div className="app-shell card-shell">
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={async (event) => {
              event.preventDefault()
              if (await editor.prepareLeave()) onLibrary()
            }}
            aria-label="星迹 Starloom 首页"
          >
            <span className="brand-symbol">
              <Sparkle size={25} strokeWidth={1.4} />
            </span>
            <span className="brand-chinese">星迹</span>
            <span className="brand-english">Starloom</span>
          </a>
          <span className="header-tagline">把喜欢，做成作品</span>
          <button
            className="text-button library-link"
            disabled={editor.transitioning}
            onClick={async () => {
              if (await editor.prepareLeave()) onLibrary()
            }}
          >
            <FolderHeart size={17} />
            我的物料
          </button>
        </div>
      </header>
      <main className="main-content" inert={editor.transitioning}>
        <div className="current-work-label">
          <span>正在编辑</span>
          <strong>{work.title}</strong>
          <span>双照片电子小卡</span>
        </div>
        <section className="intro">
          <div>
            <p className="eyebrow">TWO FRAMES, A LITTLE KEEPSAKE</p>
            <h1>
              把喜欢的<span className="headline-accent">两帧</span>，留在一起。
            </h1>
            <p className="intro-description">日常、旅行、见面纪念。两张照片，一句想留下的话。</p>
          </div>
        </section>
        <div className="workspace card-workspace">
          <section className="preview-panel" aria-label="作品预览">
            <div className="preview-toolbar">
              <span className="card-format">
                电子小卡 <small>3:4 竖版</small>
              </span>
              <div className="history-actions">
                <button
                  className="icon-button"
                  aria-label="撤销"
                  disabled={!editor.canUndo || editor.importing}
                  onClick={editor.undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="重做"
                  disabled={!editor.canRedo || editor.importing}
                  onClick={editor.redo}
                >
                  <Redo2 size={17} />
                </button>
              </div>
            </div>
            <div className="preview-stage card-stage">
              <div className="stage-label">
                <span className="live-dot" />
                实时预览 · {template.name}
              </div>
              <div className="primary-artwork card">
                <ArtworkCanvas
                  project={project}
                  bitmap={bitmap}
                  secondBitmap={secondBitmap}
                  format="card"
                  editable={!!bitmap && !!secondBitmap && !editor.importing}
                  activeSlot={slot}
                  onSelectSlot={(next) => {
                    editor.seal()
                    setSlot(next)
                  }}
                  onRender={onRender}
                  onCrop={(next, target = slot) =>
                    editor.change(
                      (previous) => updateCardCrop(previous, target, next),
                      `drag-${project.templateId}-${target}`,
                    )
                  }
                  onCommit={editor.seal}
                />
              </div>
              <p className="card-preview-hint">
                选中照片 {slot === 'first' ? '1' : '2'} · 拖动或用方向键微调
              </p>
            </div>
            <div className="preview-footer">
              <span>1800 × 2400 px · PNG</span>
              <span>无水印</span>
            </div>
          </section>
          <section className="editor-panel" aria-label="小卡设置">
            <div className="editor-panel-heading">
              <p className="panel-eyebrow">MAKE IT YOURS</p>
              <h2>收藏这一刻</h2>
              <p>分别照顾好两张照片，剩下的交给排版。</p>
            </div>
            <div className="editor-body card-editor-body">
              {(editor.error || renderError) && (
                <p className="message error" role="alert">
                  {editor.error || renderError}
                </p>
              )}
              <fieldset className="card-fieldset">
                <legend>01 / 选一个布局</legend>
                <div className="card-layouts">
                  {cardTemplates.map((item) => {
                    const preview =
                      asset && secondAsset
                        ? switchCardLayout(project, item.id, { first: asset, second: secondAsset })
                        : project
                    return (
                      <button
                        className={`card-layout ${item.id === project.templateId ? 'is-selected' : ''}`}
                        key={item.id}
                        aria-label={`选择${item.name}布局`}
                        aria-pressed={item.id === project.templateId}
                        disabled={!bitmap || !secondBitmap}
                        onClick={() => {
                          editor.seal()
                          editor.change(() => preview)
                        }}
                      >
                        <div className="card-layout-preview">
                          <ArtworkCanvas
                            project={preview}
                            bitmap={bitmap}
                            secondBitmap={secondBitmap}
                            format="card"
                            thumbnail
                          />
                        </div>
                        <strong>{item.name}</strong>
                      </button>
                    )
                  })}
                </div>
                <p className="field-hint">{template.subtitle} 切回布局会恢复两张照片各自的位置。</p>
              </fieldset>
              <fieldset className="card-fieldset">
                <legend>02 / 放入两张照片</legend>
                <div className="card-photo-slots">
                  {photoSlots.map((target, index) => {
                    const photo = target === 'first' ? asset : secondAsset
                    return (
                      <div
                        key={target}
                        className={`card-photo-slot ${slot === target ? 'is-selected' : ''}`}
                      >
                        <button
                          className="photo-slot-select"
                          aria-pressed={slot === target}
                          onClick={() => {
                            editor.seal()
                            setSlot(target)
                          }}
                        >
                          <strong>照片 {index + 1}</strong>
                          <span>{photo?.sample ? '示例照片' : (photo?.name ?? '等待照片')}</span>
                        </button>
                        <label className="photo-slot-upload">
                          <Upload size={14} />
                          换图
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label={`上传照片 ${index + 1}`}
                            disabled={editor.importing}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ''
                              if (file) {
                                editor.seal()
                                setSlot(target)
                                void editor.upload(file, target)
                              }
                            }}
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
                <p className="field-hint">JPG / PNG / WebP · 每张最大 30 MB · 照片仅在本机处理</p>
                <div className="crop-controls">
                  <div className="field-heading">
                    <label htmlFor="card-zoom">照片 {slot === 'first' ? '1' : '2'} 缩放</label>
                    <span>{Math.round(crop.zoom * 100)}%</span>
                  </div>
                  <div className="zoom-row">
                    <button
                      className="icon-button"
                      aria-label="缩小照片"
                      disabled={!selectedBitmap || crop.zoom <= 1}
                      onClick={() => {
                        zoom(Math.max(1, crop.zoom - 0.1))
                        editor.seal()
                      }}
                    >
                      −
                    </button>
                    <input
                      id="card-zoom"
                      style={
                        {
                          '--range-fill': `${((crop.zoom - 1) / 3) * 100}%`,
                        } as import('react').CSSProperties
                      }
                      type="range"
                      min="1"
                      max="4"
                      step="0.01"
                      value={crop.zoom}
                      disabled={!selectedBitmap || editor.importing}
                      onChange={(event) => zoom(Number(event.target.value))}
                      onPointerUp={editor.seal}
                      onKeyUp={editor.seal}
                    />
                    <button
                      className="icon-button"
                      aria-label="放大照片"
                      disabled={!selectedBitmap || crop.zoom >= 4}
                      onClick={() => {
                        zoom(Math.min(4, crop.zoom + 0.1))
                        editor.seal()
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      editor.change((previous) =>
                        updateCardCrop(previous, slot, { x: 0.5, y: 0.5, zoom: 1 }),
                      )
                    }
                  >
                    <RotateCcw size={13} />
                    重置照片 {slot === 'first' ? '1' : '2'} 裁切
                  </button>
                </div>
                {editor.importing && <p role="status">正在本机处理照片…</p>}
                {editor.notice && (
                  <p className="field-hint" role="status">
                    {editor.notice}
                  </p>
                )}
                {result?.lowResolution && (
                  <p className="field-hint">
                    照片较小或放大较多，导出可能偏软；可减小缩放或换一张更清晰的照片。
                  </p>
                )}
              </fieldset>
              <fieldset className="card-fieldset">
                <legend>03 / 写下想留住的话</legend>
                <div className="form-field">
                  <div className="field-heading">
                    <label htmlFor="card-name">姓名</label>
                    <span>{countCharacters(project.name)} / 40</span>
                  </div>
                  <input
                    id="card-name"
                    type="text"
                    value={project.name}
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
                  <div className="field-heading">
                    <label htmlFor="card-wish">短句</label>
                    <span>{countCharacters(project.wish)} / 80</span>
                  </div>
                  <textarea
                    id="card-wish"
                    rows={3}
                    value={project.wish}
                    onChange={(event) =>
                      editor.change(
                        (previous) => ({ ...previous, wish: event.target.value }),
                        'wish',
                      )
                    }
                    onBlur={editor.seal}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="card-date">日期（可选）</label>
                  <input
                    id="card-date"
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={project.card.date}
                    onChange={(event) =>
                      editor.change(
                        (previous) =>
                          isPhotoCard(previous)
                            ? { ...previous, card: { ...previous.card, date: event.target.value } }
                            : previous,
                        'date',
                      )
                    }
                    onBlur={editor.seal}
                  />
                  <button
                    className="text-button"
                    disabled={!project.card.date}
                    onClick={() =>
                      editor.change((previous) =>
                        isPhotoCard(previous)
                          ? { ...previous, card: { ...previous.card, date: '' } }
                          : previous,
                      )
                    }
                  >
                    不显示日期
                  </button>
                </div>
              </fieldset>
              <fieldset className="card-fieldset">
                <legend>04 / 配色与装饰</legend>
                <div className="card-palettes">
                  {template.palettes.map((item) => (
                    <button
                      key={item.color}
                      aria-label={`配色：${item.name}`}
                      aria-pressed={project.color === item.color}
                      style={{ background: item.color }}
                      onClick={() =>
                        editor.change((previous) => ({ ...previous, color: item.color }))
                      }
                    />
                  ))}
                </div>
                <CustomColorPicker
                  id="card-color"
                  color={project.color}
                  onChange={(color, group) =>
                    editor.change((previous) => ({ ...previous, color }), group)
                  }
                  onSeal={editor.seal}
                />
                <div className="card-decorations">
                  {(['sparkles', 'lines'] as const).map((decoration) => (
                    <label key={decoration}>
                      <input
                        type="checkbox"
                        checked={project.decorations[decoration]}
                        onChange={(event) =>
                          editor.change((previous) => ({
                            ...previous,
                            decorations: {
                              ...previous.decorations,
                              [decoration]: event.target.checked,
                            },
                          }))
                        }
                      />
                      {decoration === 'sparkles' ? '星芒' : '细线与纸胶带'}
                    </label>
                  ))}
                </div>
              </fieldset>
              {!!issues.length && (
                <p className="message error" role="alert">
                  {issues[0]}
                </p>
              )}
            </div>
            <div className="editor-panel-footer">
              <button
                className="primary-button"
                disabled={!ready}
                onClick={() => {
                  if (asset && secondAsset) {
                    void editor.saveNow()
                    setSnapshot({ project: structuredClone(project), asset, secondAsset })
                  }
                }}
              >
                <Download size={17} />
                导出电子小卡 PNG
              </button>
              <p>1800 × 2400 · 免费制作 · 照片不上传</p>
            </div>
          </section>
        </div>
        <LocalSaveNotice
          status={editor.saveStatus}
          savedAt={editor.savedAt}
          detail={editor.saveDetail}
          temporary={temporary}
          retry={() => {
            void editor.saveNow()
          }}
        />
      </main>
      <footer className="site-footer">
        <span>Starloom ✦ 为每一份热爱，留下一点星迹。</span>
        <span>把喜欢，做成作品</span>
      </footer>
      {editor.confirmingLeave && <TemporaryLeaveDialog onDecision={editor.decideLeave} />}
      {snapshot && <ExportModal snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </div>
  )
}
