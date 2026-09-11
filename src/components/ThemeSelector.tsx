import { Check, Heart, Sparkle } from 'lucide-react'
import { templates, getTemplate } from '../templates'
import type { ProjectState } from '../core/types'
import { ArtworkCanvas } from './ArtworkCanvas'
import { switchTemplate } from '../core/project'

export function ThemeSelector({
  project,
  bitmap,
  onSelect,
}: {
  project: ProjectState
  bitmap: ImageBitmap | null
  onSelect: (id: string) => void
}) {
  const active = getTemplate(project.templateId)
  return (
    <div className="theme-step">
      <div className="theme-list">
        {templates.map((template, index) => {
          const selected = template.id === project.templateId
          const preview = switchTemplate(project, template.id, bitmap ?? { width: 1, height: 1 })
          return (
            <button
              key={template.id}
              className={`theme-card ${selected ? 'is-selected' : ''}`}
              aria-label={`选择${template.name}主题`}
              aria-pressed={selected}
              disabled={!bitmap}
              onClick={() => onSelect(template.id)}
            >
              <div className="theme-card-art">
                <div className="theme-poster">
                  <ArtworkCanvas project={preview} bitmap={bitmap} format="poster" thumbnail />
                </div>
                <div className="theme-avatar">
                  <ArtworkCanvas project={preview} bitmap={bitmap} format="avatar" thumbnail />
                </div>
                <span className="theme-sticker">
                  <Sparkle size={13} /> FOR YOUR DAY
                </span>
              </div>
              <div className="theme-card-copy">
                <div>
                  <h3>
                    {template.name}
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </h3>
                  <p>{template.subtitle}</p>
                </div>
                {selected && (
                  <span className="selected-check">
                    <Check size={14} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="theme-tags">
        {active.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="included-note">
        <span className="included-icon">
          <Heart size={17} strokeWidth={1.4} />
        </span>
        <div>
          <strong>一份内容，配套成双</strong>
          <p>应援头像 + 生日贺图，分别为你排好。</p>
        </div>
      </div>
    </div>
  )
}
